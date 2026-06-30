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

// Tolérances de simplification (en degrés ~ 1m ≈ 0.000009).
const TOL_PROP = 0.00012;   // contour de propriété (généralisé)
const TOL_PEUP = 0.00006;   // peuplements (plus fin)
const TOL_AUTRE = 0.00008;  // travaux / prescriptions

const SQL_FEATURECOLLECTION = `
WITH prop AS (
  SELECT ST_Union(geom) AS g, ST_Transform(ST_Union(geom),4326) AS g4326
  FROM planilogix.v_proprietes WHERE producteur_id = $1 AND geom IS NOT NULL
),
raw AS (
  SELECT 'propriete'::text AS couche, jsonb_build_object('nom','Propriété') AS props, p.g4326 AS g, ${TOL_PROP}::float AS tol FROM prop p
  UNION ALL
  SELECT 'peuplement', jsonb_build_object('appellation',pe.appellation,'essences',pe.essences,'superficie_ha',round(pe.superficie_ha::numeric,2),'classe_age',pe.classe_age),
         ST_Transform(pe.geom,4326), ${TOL_PEUP} FROM planilogix.peuplements pe, prop WHERE ST_Intersects(pe.geom,prop.g)
  UNION ALL
  SELECT 'travaux', jsonb_build_object('hectares',round(t.hectares::numeric,2)),
         ST_Transform(t.geom,4326), ${TOL_AUTRE} FROM planilogix.travaux_geo t, prop WHERE ST_Intersects(t.geom,prop.g)
  UNION ALL
  SELECT 'prescription', jsonb_build_object('no_prescription',pr.no_prescription,'statut',pr.statut_courant,'hectares',round(pr.hectares::numeric,2)),
         ST_Transform(pr.geom,4326), ${TOL_AUTRE} FROM planilogix.v_prescription_actif pr, prop WHERE ST_Intersects(pr.geom,prop.g)
),
clean AS (
  SELECT couche, props, ST_CollectionExtract(ST_MakeValid(ST_SimplifyPreserveTopology(g, tol)),3) AS g FROM raw
)
SELECT
  (SELECT '['||round(ST_XMin(g4326)::numeric,5)||','||round(ST_YMin(g4326)::numeric,5)||','||round(ST_XMax(g4326)::numeric,5)||','||round(ST_YMax(g4326)::numeric,5)||']' FROM prop) AS bbox,
  count(*) FILTER (WHERE NOT ST_IsEmpty(g)) AS nb_features,
  jsonb_build_object('type','FeatureCollection','features',
    coalesce(jsonb_agg(jsonb_build_object('type','Feature','properties',props||jsonb_build_object('couche',couche),
      'geometry', ST_AsGeoJSON(g,5)::jsonb)) FILTER (WHERE NOT ST_IsEmpty(g)), '[]'::jsonb)) AS geojson
FROM clean;
`;

const SQL_IDS = `
SELECT DISTINCT producteur_id FROM planilogix.v_proprietes
WHERE producteur_id IS NOT NULL AND geom IS NOT NULL
ORDER BY producteur_id;
`;

const pgClient = new pg.Client({ connectionString: PLANILOGIX_DB_URL });
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
