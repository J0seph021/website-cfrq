/**
 * map-syndicats.mjs — Assigne à CHAQUE producteur son syndicat de mise en marché
 * =============================================================================
 * Remplit `public.producteurs.syndicat_guid` (portail « Relevés forestiers ») pour
 * TOUS les producteurs, par jointure spatiale : les lots du producteur
 * (planilogix.v_proprietes) contre les territoires syndicaux (planilogix.syndicats,
 * colonne NM_SYN_OPF), pondérée par l'aire d'intersection -> syndicat DOMINANT.
 * Le GUID choisi est celui de la grille de prix (src/lib/valeur/prix_resolu.json) :
 * le calculateur B3 lit ce GUID pour charger les bons prix régionaux.
 *
 * Reproduit la logique de outils/clip_ecoforestier_db.py::syndicat_du_wkt (aire, pas
 * centroïde) mais en batch. Ré-exécutable / idempotent : relancer après l'ajout de
 * nouveaux producteurs.
 *
 * Usage :
 *   node --env-file=scripts/.env scripts/map-syndicats.mjs            # DRY-RUN (n'écrit rien)
 *   node --env-file=scripts/.env scripts/map-syndicats.mjs --apply    # applique au portail
 */
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const { PLANILOGIX_DB_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!PLANILOGIX_DB_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Manque PLANILOGIX_DB_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY dans scripts/.env");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");

// Crosswalk SOURCE DE VÉRITÉ : NM_SYN_OPF (planilogix.syndicats, MAJUSCULES) -> GUID de
// la grille prixbois (clé de prix_resolu.json). Les 13 syndicats couvrant le Québec.
//  - 6 ont des producteurs CFRQ (validé par jointure spatiale 2026-07-12) ;
//  - 4 priced mais sans producteur actuel (garde-fou si un futur producteur y tombe) ;
//  - 3 sans grille de prix (Laurentides-Outaouais, Gatineau, Gaspésie) -> null =>
//    le calculateur retombe sur le socle provincial. Aucun producteur CFRQ n'y est.
const NM_TO_GUID = {
  "SYNDICAT DES PROPRIETAIRES FORESTIERS DE LA REGION DE QUEBEC": "72de7ada-3148-4af7-b688-9f741a0859fe",
  "ASSOCIATION DES PROPRIETAIRES DE BOISES DE LA BEAUCE":         "b81d45a2-2166-4df6-b2f3-9f518986ac55",
  "SYNDICAT DES PRODUCTEURS DE BOIS DU CENTRE-DU-QUEBEC":         "fb4ad168-e123-4695-abb4-dbd030d04c29",
  "SYNDICAT DES PRODUCTEURS DE BOIS DE LA COTE-DU-SUD":           "589c63d3-002a-4df4-a089-a177c9e3ac6c",
  "SYNDICAT DES PRODUCTEURS FORESTIERS DU SUD DU QUEBEC":         "5c5cf934-7148-42cb-aaf0-fef7f8176118",
  "SYNDICAT DES PRODUCTEURS DE BOIS DE LA MAURICIE":              "dd177b4e-23c8-4204-af69-25d3bb6c8775",
  // Priced, sans producteur actuel :
  "OFFICE DES PRODUCTEURS DE BOIS DE PONTIAC":                    "b54bed2c-9ef9-43e2-820b-f9bfee057449",
  "SYNDICAT DES PRODUCTEURS DE BOIS D'ABITIBI-TEMISCAMINGUE":     "faec178b-9775-4fe1-b6ac-2228b613f8e5",
  "SYNDICAT DES PRODUCTEURS DE BOIS DU SAGUENAY-LAC-SAINT-JEAN":  "efb709a4-34c8-4a44-a8a9-b1fdc0340a5b",
  "SYNDICAT DES PRODUCTEURS FORESTIERS DU BAS-SAINT-LAURENT":     "b5924967-053f-4343-b47d-4e6d7c980e40",
  // Sans grille de prix (null volontaire) :
  "ALLIANCE DES PROPRIÉTAIRES FORESTIERS LAURENTIDES-OUTAOUAIS":  null,
  "OFFICE DES PRODUCTEURS DE BOIS DE LA GATINEAU":                null,
  "SYNDICAT DES PRODUCTEURS DE BOIS DE LA GASPESIE":              null,
};

// Syndicat dominant (aire d'intersection) par producteur ayant de la géométrie.
const SQL = `
WITH lot AS (
  SELECT producteur_id, ST_MakeValid(geom) AS geom
  FROM planilogix.v_proprietes
  WHERE geom IS NOT NULL AND producteur_id IS NOT NULL
),
hit AS (
  SELECT l.producteur_id, s."NM_SYN_OPF" AS nm,
         SUM(ST_Area(ST_Intersection(ST_MakeValid(s.geom), l.geom))) AS a
  FROM lot l JOIN planilogix.syndicats s ON ST_Intersects(s.geom, l.geom)
  GROUP BY 1, 2
),
ranked AS (
  SELECT producteur_id, nm,
         ROW_NUMBER() OVER (PARTITION BY producteur_id ORDER BY a DESC) AS rn,
         a / NULLIF(SUM(a) OVER (PARTITION BY producteur_id), 0) AS part
  FROM hit
)
SELECT producteur_id, nm, round(part::numeric, 3) AS part
FROM ranked WHERE rn = 1 ORDER BY producteur_id`;

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function main() {
  // On retire un éventuel sslmode de l'URL (sinon pg le force en verify-full) et on
  // tolère la chaîne auto-signée du pooler Supabase (comme export-cartes.mjs).
  const pgc = new pg.Client({
    connectionString: PLANILOGIX_DB_URL.replace(/[?&]sslmode=[^&]*/gi, ""),
    ssl: { rejectUnauthorized: false },
  });
  await pgc.connect();
  const { rows } = await pgc.query(SQL);
  await pgc.end();
  console.log(`Jointure spatiale : ${rows.length} producteurs avec géométrie.`);

  // producteur_id -> guid (via crosswalk). Signale tout NM_SYN_OPF inconnu du dict.
  const parGuid = new Map();       // guid -> [producteur_id]
  const inconnus = new Set(), sansPrix = [];
  const nmComptes = {};
  for (const r of rows) {
    nmComptes[r.nm] = (nmComptes[r.nm] || 0) + 1;
    if (!(r.nm in NM_TO_GUID)) { inconnus.add(r.nm); continue; }
    const guid = NM_TO_GUID[r.nm];
    if (guid === null) { sansPrix.push(r.producteur_id); continue; }
    if (!parGuid.has(guid)) parGuid.set(guid, []);
    parGuid.get(guid).push(r.producteur_id);
  }

  console.log("\nRépartition par syndicat (jointure spatiale) :");
  for (const [nm, n] of Object.entries(nmComptes).sort((a, b) => b[1] - a[1])) {
    const g = NM_TO_GUID[nm];
    console.log(`  ${String(n).padStart(4)}  ${nm}${g === null ? "  [SANS PRIX -> provincial]" : g === undefined ? "  [!! INCONNU DU CROSSWALK]" : ""}`);
  }
  if (inconnus.size) { console.error(`\n[ABANDON] ${inconnus.size} syndicat(s) hors crosswalk :`, [...inconnus]); process.exit(2); }
  if (sansPrix.length) console.log(`\n${sansPrix.length} producteur(s) en zone sans grille de prix -> laissés à NULL (socle provincial).`);

  const total = [...parGuid.values()].reduce((s, a) => s + a.length, 0);
  console.log(`\n${total} producteurs -> ${parGuid.size} syndicats avec prix.`);
  if (!APPLY) { console.log("\nDRY-RUN — rien écrit. Relancer avec --apply pour appliquer au portail."); return; }

  // Écriture portail : UPDATE ciblé par lot d'ids (jamais upsert -> ne touche que les
  // lignes existantes, n'insère pas de producteur fantôme, ne nulle aucune autre colonne).
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let maj = 0, absents = 0;
  for (const [guid, ids] of parGuid) {
    for (const lot of chunk(ids, 200)) {
      const { data, error } = await sb.from("producteurs").update({ syndicat_guid: guid }).in("id", lot).select("id");
      if (error) { console.error(`Erreur update ${guid}:`, error.message); process.exit(3); }
      maj += data.length;
      absents += lot.length - data.length;
    }
  }
  console.log(`\nAppliqué : ${maj} lignes mises à jour au portail.`);
  if (absents) console.log(`${absents} producteur(s) PlaniLogix absents du portail (non synchronisés) — ignorés.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
