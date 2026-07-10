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
raw AS (
  SELECT 'propriete'::text AS couche, jsonb_build_object('nom','Propriété') AS props, p.g4326 AS g FROM prop p
  UNION ALL
  SELECT 'peuplement', jsonb_strip_nulls(jsonb_build_object(
           'no_peup', pe.no_peup,
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
           'priorite', pe.priorite)),
         ST_Transform(pe.geom,4326) FROM planilogix.peuplements pe, prop
         WHERE ST_Intersects(pe.geom,prop.g)
           -- Exiger un recouvrement REEL (>10% de l'aire du peuplement), sinon un
           -- peuplement d'une propriete VOISINE qui ne fait qu'effleurer la limite
           -- cadastrale (micro-sliver <0,01 ha) apparaitrait sur la mauvaise carte.
           AND ST_Area(ST_Intersection(ST_MakeValid(pe.geom),prop.g)) > 0.10*ST_Area(ST_MakeValid(pe.geom))
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
),
clean AS (
  SELECT couche, props, ST_CollectionExtract(ST_MakeValid(g),3) AS g FROM raw
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
