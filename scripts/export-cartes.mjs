/**
 * Génère les cartes GeoJSON des producteurs depuis PlaniLogix (PostGIS)
 * et les enregistre dans la table `public.cartes` du Supabase du site.
 *
 * Architecture: la donnée géographique vit dans PlaniLogix; on en exporte une
 * version web (WGS84, simplifiée, nettoyée) vers le portail. Le site n'accède
 * jamais directement à la base de production.
 *
 * Pré-requis:
 *   npm i -D pg            (déjà présent: @supabase/supabase-js)
 *   Remplir un .env (voir .env.example) avec:
 *     PLANILOGIX_DB_URL=postgresql://user:pass@host:5432/db
 *     SUPABASE_URL=https://sfzcslpbysabsiszcpqm.supabase.co
 *     SUPABASE_SERVICE_ROLE_KEY=...   (clé service_role, jamais exposée au client)
 *
 * Usage:
 *   node --env-file=.env scripts/export-cartes.mjs            # tous les producteurs avec géométrie
 *   node --env-file=.env scripts/export-cartes.mjs 2499 2546  # producteurs ciblés
 */
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const { PLANILOGIX_DB_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!PLANILOGIX_DB_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Variables manquantes. Voir scripts/.env.example.");
  process.exit(1);
}

// Pleine fidélité: AUCUNE simplification des polygones (les formes ne sont pas modifiées).
// On valide les géométries et on arrondit les coordonnées à ~0,1 m (6 décimales).
// La taille n'est volontairement pas optimisée: on privilégie l'exactitude.
const PRECISION = 6;

const SQL_FEATURECOLLECTION = `
WITH prop AS (
  -- Terres du producteur : détenues en propre (producteur_id) OU dont il est le
  -- propriétaire légal producteur (dossiers liés — société liée avec compte).
  SELECT ST_Union(geom) AS g, ST_Transform(ST_Union(geom),4326) AS g4326
  FROM planilogix.v_proprietes
  WHERE (producteur_id = $1 OR proprietaire_legal_producteur_id = $1) AND geom IS NOT NULL
),
-- Dictionnaire code de traitement -> libellé lisible (une description par code).
dict AS (
  SELECT DISTINCT ON (code_pr) code_pr, description
  FROM sigga.travaux WHERE description IS NOT NULL AND code_pr IS NOT NULL
  ORDER BY code_pr, description
),
-- Traitements lisibles + année, agrégés par prescription.
trait AS (
  SELECT pt.no_prescription,
         string_agg(DISTINCT coalesce(d.description, pt.code_pr), ' / ') AS traitements,
         max(pt.annee) AS annee
  FROM planilogix.prescription_traitement pt
  LEFT JOIN dict d ON d.code_pr = pt.code_pr
  GROUP BY pt.no_prescription
),
-- Peuplements du producteur, avec l'age et la hauteur du PAF convertis en NOMBRE.
-- Le PAF stocke du texte : un entier (« 35 »), une plage (« 8-17 », « 60-30 ») ou un
-- code de structure MFFP (« VIN », « JIN »). On prend la moyenne des nombres presents,
-- et le milieu de classe pour les codes. NULL si rien d'exploitable : une valeur
-- absente ne doit JAMAIS compter comme une contradiction.
peup AS (
  SELECT pe.*,
         CASE upper(btrim(coalesce(pe.classe_age,'')))
           WHEN 'JIN' THEN 40 WHEN 'JIR' THEN 40 WHEN 'JIIN' THEN 40
           WHEN 'VIN' THEN 110 WHEN 'VIR' THEN 110 WHEN 'VIIN' THEN 110
           ELSE (SELECT avg(v::numeric)
                   FROM unnest(regexp_split_to_array(coalesce(pe.classe_age,''),'[^0-9]+')) v
                  WHERE v ~ '^[0-9]+$' AND v::numeric BETWEEN 1 AND 249)
         END AS age_paf,
         -- Couper sur tout sauf chiffres ET point : « 19.5 » doit rester 19,5 m
         -- (couper sur le point en ferait moyenne(19,5) = 12 m et un peuplement se
         -- ferait rejeter par sa propre hauteur). La virgule n'est convertie en
         -- point que si elle est DECIMALE (suivie d'un seul chiffre final) :
         -- « 12,5 » -> 12.5, mais « 13,15,17 » (liste multi-etages) garde ses
         -- virgules separatrices -> tokens 13/15/17 -> moyenne 15.
         (SELECT avg(v::numeric)
            FROM unnest(regexp_split_to_array(
                   regexp_replace(coalesce(pe.hauteur_m,''), ',([0-9])([^0-9]|$)', '.\\1\\2', 'g'),
                   '[^0-9.]+')) v
           WHERE v ~ '^[0-9]+(\\.[0-9]+)?$' AND v::numeric BETWEEN 1 AND 39) AS haut_paf
  -- v_peuplements_complets = archive PAF (releves terrain CFRQ) + synthese
  -- ecoforestiere (peuplements_eco, migration 032), avec source_donnee
  -- ('paf' | 'ecoforestier'). L'archive planilogix.peuplements est redevenue
  -- 100 % PAF le 2026-08-04 — ne plus jamais la lire seule ici.
  FROM planilogix.v_peuplements_complets pe, prop
  -- Exiger un recouvrement REEL (>10% de l'aire du peuplement), sinon un peuplement
  -- d'une propriete VOISINE qui ne fait qu'effleurer la limite cadastrale
  -- (micro-sliver <0,01 ha) apparaitrait sur la mauvaise carte.
  WHERE ST_Intersects(pe.geom, prop.g)
    AND ST_Area(ST_Intersection(ST_MakeValid(pe.geom), prop.g)) > 0.10*ST_Area(ST_MakeValid(pe.geom))
),
raw AS (
  SELECT 'propriete'::text AS couche, jsonb_build_object('nom','Propriété') AS props, p.g4326 AS g FROM prop p
  UNION ALL
  SELECT 'peuplement', jsonb_strip_nulls(jsonb_build_object(
           'no_peup', pe.no_peup,
           -- Provenance du DESCRIPTIF ('paf' = releve terrain CFRQ,
           -- 'ecoforestier' = synthese de la carte du ministere). L'interface
           -- s'en sert pour etiqueter honnetement chaque peuplement.
           'source', pe.source_donnee,
           'appellation', pe.appellation,
           'essences', pe.essences,
           'superficie_ha', round(pe.superficie_ha::numeric,2),
           'classe_age', pe.classe_age,
           'densite', pe.densite,
           'hauteur_m', pe.hauteur_m,
           'surface_terriere', round(pe.surface_terriere::numeric,1),
           'diametre_moyen', round(pe.diametre_moyen::numeric,1),
           'volume_m3_ha', round(pe.volume_m3_ha::numeric,1),
           'volume_total_m3', round(pe.volume_total_m3::numeric,0),
           'drainage', pe.drainage,
           'pente', pe.pente,
           'perturbation', pe.perturbation,
           'traitements_rec', pe.traitements_rec,
           'priorite', pe.priorite,
           -- Codes bruts MRNF pour le moteur foret (courbe de maturite E1/E2/E3,
           -- src/lib/foret). Source : polygone eco_pee retenu par le FILTRE DE
           -- NON-CONTRADICTION (voir la CTE eco_ok plus bas). NULL quand aucun
           -- polygone du ministere ne concorde -> le portail n'affiche alors
           -- aucune analyse pour ce peuplement, plutot qu'un chiffre douteux.
           'gr_ess', eco.gr_ess,
           'type_eco', eco.type_eco,
           'cl_dens', eco.cl_dens,
           'cl_age_eco', eco.cl_age,
           'an_origine', CASE WHEN eco.an_origine ~ '^[0-9]{4}' THEN left(eco.an_origine,4)::int END,
           'region_eco', eco.region_eco,
           'vmb_ha_reel', round(den.vmb_ha::numeric,1),
           'composition', den.composition,
           -- Etiquettes de provenance et de fiabilite, LUES PAR L'INTERFACE.
           -- Obligation deontologique (OIFQ, art. 13/14/20) : ne pas presenter
           -- une estimation issue de la carte du ministere comme une mesure du
           -- peuplement, et signaler les reserves qui s'y rattachent.
           'analyse_absente', (eco.gr_ess IS NULL),
           'analyse_couverture_pct', round((100*eco.aire/nullif(ST_Area(ST_MakeValid(pe.geom)),0))::numeric,0),
           'peuplement_heterogene',
             (het.n_signif >= 2 AND (het.ecart_age >= 30 OR het.n_couv > 1)),
           'heterogene_nb_types', het.n_signif,
           'heterogene_ecart_age', het.ecart_age)),
         ST_Transform(pe.geom,4326) FROM peup pe
         CROSS JOIN prop
         -- Polygone ecoforestier retenu : le plus grand recouvrement PARMI CEUX
         -- QUI NE CONTREDISENT PAS le releve terrain sur l'age et la hauteur.
         -- Ces deux attributs structuraux sont les seuls dont la validation
         -- croisee (4 verificateurs independants, 8 726 peuplements de PAF) montre
         -- un gain reel : -13 % d'erreur. Les essences n'apportent presque rien
         -- seules et la densite DEGRADE le resultat -> volontairement non testees.
         LEFT JOIN LATERAL (
           SELECT e.* FROM (
             SELECT ep.gr_ess, ep.type_eco, ep.cl_dens, ep.cl_age, ep.an_origine,
                    ep.region_eco, ep.feuillet, ep.geocode,
                    ST_Area(ST_Intersection(ST_MakeValid(ep.geom), ST_MakeValid(pe.geom))) AS aire,
                    CASE ep.cl_age WHEN '10' THEN 10 WHEN '30' THEN 30 WHEN '50' THEN 50
                                   WHEN '70' THEN 70 WHEN '90' THEN 90 WHEN '120' THEN 120
                                   WHEN 'JIN' THEN 40 WHEN 'JIR' THEN 40
                                   WHEN 'VIN' THEN 110 WHEN 'VIR' THEN 110 END AS age_eco,
                    CASE left(coalesce(ep.cl_haut,''),1)
                         WHEN '1' THEN 24.0 WHEN '2' THEN 19.5 WHEN '3' THEN 14.5
                         WHEN '4' THEN 9.5  WHEN '5' THEN 5.5  WHEN '6' THEN 3.0
                         WHEN '7' THEN 1.0 END AS haut_eco
             FROM planilogix.eco_pee ep
             WHERE ep.geom && pe.geom AND ST_Intersects(ep.geom, pe.geom)
           ) e
           -- Non-contradiction : on ne rejette QUE si les deux valeurs existent et
           -- s'ecartent trop. Une valeur manquante n'est jamais une contradiction.
           WHERE (pe.age_paf  IS NULL OR e.age_eco  IS NULL OR abs(pe.age_paf  - e.age_eco)  <= 20)
             AND (pe.haut_paf IS NULL OR e.haut_eco IS NULL OR abs(pe.haut_paf - e.haut_eco) <= 5)
           ORDER BY e.aire DESC
           LIMIT 1
         ) eco ON true
         -- Heterogeneite : le peuplement recoupe-t-il plusieurs types ecoforestiers
         -- franchement differents ? (>= 20 % de l'aire chacun). Si oui, AUCUN chiffre
         -- unique ne le decrit -> l'interface affiche un avertissement.
         LEFT JOIN LATERAL (
           SELECT count(*) AS n_signif,
                  max(h.age_eco) - min(h.age_eco) AS ecart_age,
                  count(DISTINCT left(coalesce(h.type_couv,''),1)) AS n_couv
           FROM (
             SELECT ep.type_couv,
                    CASE ep.cl_age WHEN '10' THEN 10 WHEN '30' THEN 30 WHEN '50' THEN 50
                                   WHEN '70' THEN 70 WHEN '90' THEN 90 WHEN '120' THEN 120
                                   WHEN 'JIN' THEN 40 WHEN 'JIR' THEN 40
                                   WHEN 'VIN' THEN 110 WHEN 'VIR' THEN 110 END AS age_eco
             FROM planilogix.eco_pee ep
             WHERE ep.geom && pe.geom AND ST_Intersects(ep.geom, pe.geom)
               AND ST_Area(ST_Intersection(ST_MakeValid(ep.geom), ST_MakeValid(pe.geom)))
                   >= 0.20 * ST_Area(ST_MakeValid(pe.geom))
           ) h
         ) het ON true
         LEFT JOIN planilogix.eco_dendro den
           ON den.feuillet = eco.feuillet AND den.geocode = eco.geocode
          AND den.cat_co_cmp = 'TOT'
  UNION ALL
  SELECT 'travaux', jsonb_strip_nulls(jsonb_build_object(
           'no_prescription', left(t.id_travaux,13),
           'traitement', tr.traitements,
           'annee', tr.annee,
           'hectares', round(t.hectares::numeric,2))),
         ST_Transform(t.geom,4326)
  FROM planilogix.travaux_geo t
  JOIN prop ON ST_Intersects(t.geom, prop.g)
   AND ST_Area(ST_Intersection(ST_MakeValid(t.geom),prop.g)) > 0.10*ST_Area(ST_MakeValid(t.geom))
  LEFT JOIN trait tr ON tr.no_prescription = left(t.id_travaux,13)
  UNION ALL
  SELECT 'prescription', jsonb_strip_nulls(jsonb_build_object(
           'no_prescription',pc.no_prescription,
           'statut',pc.statut_courant,
           'traitement', tr.traitements,
           'annee', tr.annee,
           'hectares',round(pc.superficie::numeric,2),
           'lots',pc.lots,
           'prescrit_par',pc.prescrit_par,
           'date_rapport',pc.date_rapport)),
         ST_Transform(pc.geom,4326)
  FROM planilogix.v_prescription_carte pc
  JOIN prop ON ST_Intersects(pc.geom, prop.g)
   AND ST_Area(ST_Intersection(ST_MakeValid(pc.geom),prop.g)) > 0.10*ST_Area(ST_MakeValid(pc.geom))
  LEFT JOIN trait tr ON tr.no_prescription = pc.no_prescription
  UNION ALL
  -- Ruisseaux / ecoulements (hydrographie LiDAR fine, demande focus group A5).
  -- Decoupes a la propriete pour ne rien dessiner hors des limites du client.
  -- La classe '1. Zone_interm' (zones d'intermittence diffuses) est exclue :
  -- trop de bruit visuel, ~29% des lignes pour peu d'information.
  SELECT 'hydro', jsonb_strip_nulls(jsonb_build_object(
           'classe', h.classe,
           'type', h.type_element)),
         ST_Transform(ST_Intersection(ST_MakeValid(h.geom), prop.g),4326)
  FROM planilogix.hydro_lits_lidar h, prop
  WHERE h.geom && prop.g AND ST_Intersects(h.geom, prop.g)
    AND h.classe <> '1. Zone_interm'
),
clean AS (
  -- Dimension a extraire apres ST_MakeValid : 3 = polygones, 2 = lignes (hydro).
  SELECT couche, props,
         ST_CollectionExtract(ST_MakeValid(g), CASE WHEN couche = 'hydro' THEN 2 ELSE 3 END) AS g
  FROM raw
),
-- Cadrage de la carte: on borne sur les couches AFFICHÉES par défaut (peuplements,
-- travaux, prescriptions), jamais sur le contour de propriété. Ça évite qu'une
-- parcelle cadastrale isolée (parfois à des dizaines de km du bloc forestier)
-- fasse dézoomer toute la carte. Repli sur l'étendue des propriétés au besoin.
bounds AS (
  SELECT ST_Extent(g) AS e FROM clean
  WHERE couche <> 'propriete' AND g IS NOT NULL AND NOT ST_IsEmpty(g)
)
SELECT
  coalesce(
    (SELECT '['||round(ST_XMin(e)::numeric,5)||','||round(ST_YMin(e)::numeric,5)||','||round(ST_XMax(e)::numeric,5)||','||round(ST_YMax(e)::numeric,5)||']' FROM bounds WHERE e IS NOT NULL),
    (SELECT '['||round(ST_XMin(g4326)::numeric,5)||','||round(ST_YMin(g4326)::numeric,5)||','||round(ST_XMax(g4326)::numeric,5)||','||round(ST_YMax(g4326)::numeric,5)||']' FROM prop)
  ) AS bbox,
  count(*) FILTER (WHERE NOT ST_IsEmpty(g)) AS nb_features,
  jsonb_build_object('type','FeatureCollection','features',
    coalesce(jsonb_agg(jsonb_build_object('type','Feature','properties',props||jsonb_build_object('couche',couche),
      'geometry', ST_AsGeoJSON(g,${PRECISION})::jsonb)) FILTER (WHERE NOT ST_IsEmpty(g)), '[]'::jsonb)) AS geojson
FROM clean;
`;

const SQL_IDS = `
SELECT producteur_id FROM (
  SELECT DISTINCT producteur_id FROM planilogix.v_proprietes
   WHERE producteur_id IS NOT NULL AND geom IS NOT NULL
  UNION
  SELECT DISTINCT proprietaire_legal_producteur_id FROM planilogix.v_proprietes
   WHERE proprietaire_legal_producteur_id IS NOT NULL AND geom IS NOT NULL
) q ORDER BY producteur_id;
`;

// On retire un éventuel sslmode de l'URL (sinon pg le traite en verify-full et
// rejette le certificat du pooler Supabase) et on applique un SSL permissif.
const pgClient = new pg.Client({
  connectionString: PLANILOGIX_DB_URL.replace(/[?&]sslmode=[^&]*/gi, ""),
  ssl: { rejectUnauthorized: false },
});
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  await pgClient.connect();

  // Prévol : ce script lit v_peuplements_complets (migration 032). Sans elle,
  // chaque producteur échouerait individuellement (911 erreurs) — on préfère un
  // seul message clair. Protège aussi du scénario inverse : une VIEILLE version
  // du script lancée APRÈS la migration lirait planilogix.peuplements (redevenue
  // 100 % PAF) et REMPLACERAIT les cartes des clients éco par des cartes vides.
  const chk = await pgClient.query(
    "SELECT to_regclass('planilogix.v_peuplements_complets') AS v",
  );
  if (!chk.rows[0]?.v) {
    console.error(
      "Migration 032 non appliquée (planilogix.v_peuplements_complets absente). " +
        "Appliquer db/migrations/032_peuplements_eco.sql du dépôt PlaniLogix, puis relancer.",
    );
    await pgClient.end();
    process.exit(1);
  }

  const cibles = process.argv.slice(2).map(Number).filter(Boolean);
  const ids = cibles.length
    ? cibles
    : (await pgClient.query(SQL_IDS)).rows.map((r) => r.producteur_id);

  console.log(`${ids.length} producteur(s) à traiter.`);
  let ok = 0, vides = 0, erreurs = 0;

  for (const id of ids) {
    try {
      const { rows } = await pgClient.query(SQL_FEATURECOLLECTION, [id]);
      const row = rows[0];
      const nb = Number(row?.nb_features ?? 0);
      if (!row || nb === 0 || !row.geojson) { vides++; continue; }

      const { error } = await supabase.from("cartes").upsert(
        {
          producteur_id: id,
          geojson: row.geojson,
          bbox: row.bbox ? JSON.parse(row.bbox) : null,
          nb_features: nb,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "producteur_id" }
      );
      if (error) throw error;
      ok++;
      if (ok % 25 === 0) console.log(`  ...${ok} cartes écrites`);
    } catch (e) {
      erreurs++;
      console.error(`  producteur ${id}: ${e.message}`);
    }
  }

  console.log(`Terminé. ${ok} carte(s) écrite(s), ${vides} sans géométrie utile, ${erreurs} erreur(s).`);
  await pgClient.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
