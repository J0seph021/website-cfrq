/**
 * Calcule le BILAN DES INVESTISSEMENTS par producteur (travaux réalisés sur ~3 ans)
 * depuis PlaniLogix (PostGIS) et l'enregistre dans public.bilan_investissement du
 * Supabase du site. Sert l'encadré E5 « depuis N ans, X$ investis chez vous ».
 *
 * Même architecture que export-cartes.mjs : la donnée vit dans PlaniLogix, on en
 * pousse une synthèse web (le site n'accède jamais à la production).
 *
 * Logique alignée sur les cartes de Noël (generer_rapports_noel_CFRQ.py) :
 *   valeur = subvention / (0.95 si code ∈ CODES_95 sinon 0.85)
 *   aide   = subvention (part gouvernementale déjà calculée dans suivi_travaux)
 *   part   = valeur − aide (contribution du propriétaire)
 * Filtre RTF obligatoire (programmes année civile), miroir de taux_queries.py.
 *
 * Usage :
 *   node --env-file=scripts/.env scripts/export-bilans.mjs           # tous
 *   node --env-file=scripts/.env scripts/export-bilans.mjs 644 2546  # ciblés
 */
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const { PLANILOGIX_DB_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!PLANILOGIX_DB_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Variables manquantes. Voir scripts/.env.example.");
  process.exit(1);
}

// Fenêtre : les 3 dernières années civiles incluant l'année courante.
const ANNEE_MIN = new Date().getFullYear() - 2;

const SQL = `
WITH src AS (
  SELECT pc.producteur_id,
         st.subvention AS aide,
         st.subvention / CASE WHEN st.code_pr IN
           ('7751','7752','7753','7761','7762','7763') THEN 0.95 ELSE 0.85 END AS valeur,
         st.superficie,
         st.annee_execution::int AS annee
  FROM planilogix.suivi_travaux st
  JOIN planilogix.prescription     p  ON p.no_prescription = st.no_prescription
  JOIN planilogix.propriete_client pc ON pc.id = p.propriete_id
  WHERE pc.producteur_id IS NOT NULL
    AND st.subvention IS NOT NULL
    AND st.annee_execution ~ '^[0-9]{4}$'
    AND st.annee_execution::int >= $1
    -- Exclut RTF / PRTF / '$$' (programmes année civile) : sinon double-compte.
    AND COALESCE(btrim(st.programme),'') NOT IN ('$$','PRTF','RTF')
)
SELECT producteur_id,
       ROUND(SUM(valeur), 0)              AS total_valeur,
       ROUND(SUM(aide), 0)                AS total_aide,
       ROUND(SUM(valeur) - SUM(aide), 0)  AS total_part,
       ROUND(SUM(superficie), 2)          AS superficie_ha,
       COUNT(*)                           AS nb_traitements,
       MIN(annee)                         AS annee_min,
       MAX(annee)                         AS annee_max
FROM src
GROUP BY producteur_id
HAVING SUM(valeur) > 0;
`;

const pgClient = new pg.Client({
  connectionString: PLANILOGIX_DB_URL.replace(/[?&]sslmode=[^&]*/gi, ""),
  ssl: { rejectUnauthorized: false },
});
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  await pgClient.connect();
  const cibles = process.argv.slice(2).map(Number).filter(Boolean);

  const { rows } = await pgClient.query(SQL, [ANNEE_MIN]);
  const filtres = cibles.length ? rows.filter((r) => cibles.includes(r.producteur_id)) : rows;
  console.log(`${filtres.length} producteur(s) avec des travaux depuis ${ANNEE_MIN}.`);

  let ok = 0, erreurs = 0;
  for (const r of filtres) {
    const { error } = await supabase.from("bilan_investissement").upsert(
      {
        producteur_id: r.producteur_id,
        total_valeur: Number(r.total_valeur),
        total_aide: Number(r.total_aide),
        total_part: Number(r.total_part),
        superficie_ha: Number(r.superficie_ha),
        nb_traitements: Number(r.nb_traitements),
        annee_min: Number(r.annee_min),
        annee_max: Number(r.annee_max),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "producteur_id" },
    );
    if (error) { erreurs++; console.error(`  producteur ${r.producteur_id}: ${error.message}`); }
    else ok++;
  }
  console.log(`Terminé. ${ok} bilan(s) écrit(s), ${erreurs} erreur(s).`);
  await pgClient.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
