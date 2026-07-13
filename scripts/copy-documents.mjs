/**
 * Copie les documents signés d'un producteur (prescriptions, rapports d'exécution,
 * PAF) depuis le projet Supabase PlaniLogix vers le bucket privé `documents` du site,
 * dans un dossier {producteur_id}/ protégé par RLS, et renseigne public.documents
 * pour l'affichage côté client.
 *
 * Source = le MAPPING PlaniLogix (planilogix.centre_doc_fichier.producteur_id), résolu
 * par numéro/prescription/nom (migrations 016-018). Couvre prs/rap/PAF, y compris les
 * dossiers sans géométrie (l'ancienne sélection spatiale les ratait + ignorait les PAF).
 *
 * Sécurité: les PDF sont servis par le projet du site via la session du client
 * (RLS sur current_producteur_id()). La clé PlaniLogix ne sert qu'au transfert
 * hors-ligne et n'est jamais exposée au navigateur.
 *
 * Pré-requis (.env): PLANILOGIX_DB_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *                    PLANI_URL, PLANI_STORAGE_KEY, PLANI_DOC_BUCKET
 * Usage:
 *   node --env-file=scripts/.env scripts/copy-documents.mjs 2546 2499   # producteurs précis
 *   node --env-file=scripts/.env scripts/copy-documents.mjs --all        # tous (lié à >=1 doc)
 */
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Filigrane (watermark) pour le mode --incremental : dernier maj_le poussé.
const WM_PATH = fileURLToPath(new URL("./.copy-watermark", import.meta.url));

const {
  PLANILOGIX_DB_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  PLANI_URL, PLANI_STORAGE_KEY, PLANI_DOC_BUCKET = "centre_documentaire",
} = process.env;
if (!PLANILOGIX_DB_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !PLANI_URL || !PLANI_STORAGE_KEY) {
  console.error("Variables manquantes (voir scripts/.env.example).");
  process.exit(1);
}

const pgc = new pg.Client({
  connectionString: PLANILOGIX_DB_URL.replace(/[?&]sslmode=[^&]*/gi, ""),
  ssl: { rejectUnauthorized: false },
});
const site = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const plani = createClient(PLANI_URL, PLANI_STORAGE_KEY, { auth: { persistSession: false } });

// Types de documents montrés au client (deliverables). On exclut les contrats (ctr)
// par prudence (à activer si souhaité). rtf = rapport de remboursement de taxes
// foncières (décision JM 2026-07-13).
const TYPES = ["prs", "rap", "paf", "rtf"];

// Documents signés d'un producteur, depuis le mapping centre_doc_fichier.
const SQL_DOCS = `
SELECT storage_key, nom_fichier, sp_type_code, no_prescription, taille_octets, sp_annee
FROM planilogix.centre_doc_fichier
WHERE producteur_id = $1 AND statut = 'uploaded' AND sp_type_code = ANY($2)
ORDER BY sp_type_code, no_prescription NULLS LAST, nom_fichier`;

const META = {
  prs: { type: "prescription", dossier: "prescriptions" },
  rap: { type: "rapport", dossier: "rapports" },
  paf: { type: "paf", dossier: "plans" },
  rtf: { type: "rtf", dossier: "taxes" },
};

function nomLisible(tcode, no, annee) {
  if (tcode === "prs") return `Prescription ${no ?? ""}`.trim();
  if (tcode === "rap") return `Rapport d'exécution ${no ?? ""}`.trim();
  if (tcode === "rtf") return `Rapport de taxes foncières${annee ? " " + String(annee).replace(/\.0$/, "") : ""}`;
  return `Plan d'aménagement forestier${annee ? " " + String(annee).replace(/\.0$/, "") : ""}`;
}

// Clé Storage : Supabase refuse accents/apostrophes/virgules/() dans la clé d'objet
// ("Invalid key"). On translittère (NFKD), on retire le non-ASCII, puis on remplace tout
// caractère hors [A-Za-z0-9._-] par "_". Le libellé affiché vient de nomLisible(), donc
// l'accentuation reste visible côté client; seule la clé interne est assainie.
function safeName(name) {
  return name
    .normalize("NFKD").replace(/[^\x00-\x7F]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_");
}

async function traiterProducteur(id) {
  const { rows: docs } = await pgc.query(SQL_DOCS, [id, TYPES]);
  // Idempotence: on repart propre pour ce producteur (types gérés ici).
  await site.from("documents").delete()
    .eq("producteur_id", id).in("type_document", ["prescription", "rapport", "paf", "rtf"]);

  let copies = 0, erreurs = 0;
  for (const r of docs) {
    const meta = META[r.sp_type_code];
    if (!meta) continue;
    try {
      const dl = await plani.storage.from(PLANI_DOC_BUCKET).download(r.storage_key);
      if (dl.error) throw new Error("download: " + dl.error.message);
      const buf = Buffer.from(await dl.data.arrayBuffer());
      const dest = `${id}/${meta.dossier}/${safeName(r.nom_fichier)}`;
      const up = await site.storage.from("documents").upload(dest, buf, {
        contentType: "application/pdf", upsert: true,
      });
      if (up.error) throw new Error("upload: " + up.error.message);
      const { error: dbErr } = await site.from("documents").upsert({
        producteur_id: id,
        type_document: meta.type,
        reference: r.no_prescription,
        nom_document: nomLisible(r.sp_type_code, r.no_prescription, r.sp_annee),
        storage_path: dest,
        taille: `${Math.round(r.taille_octets / 1024)} Ko`,
        date_document: r.sp_annee ? String(r.sp_annee).replace(/\.0$/, "") : null,
      }, { onConflict: "storage_path" });
      if (dbErr) throw new Error("db: " + dbErr.message);
      copies++;
    } catch (e) {
      erreurs++;
      console.error(`  ${r.nom_fichier}: ${e.message}`);
    }
  }
  console.log(`Producteur ${id}: ${copies}/${docs.length} document(s) copié(s), ${erreurs} erreur(s).`);
  return { copies, erreurs, total: docs.length };
}

async function main() {
  await pgc.connect();
  const incremental = process.argv.includes("--incremental");
  let ids = process.argv.slice(2).filter((a) => !a.startsWith("--")).map(Number).filter(Boolean);
  let newWatermark = null;

  if (process.argv.includes("--all")) {
    const { rows } = await pgc.query(
      `SELECT DISTINCT producteur_id FROM planilogix.centre_doc_fichier
       WHERE producteur_id IS NOT NULL AND statut='uploaded' AND sp_type_code = ANY($1)
       ORDER BY producteur_id`, [TYPES]);
    ids = rows.map((r) => r.producteur_id);
    console.log(`--all : ${ids.length} producteurs avec au moins un document.`);
  } else if (incremental) {
    // Seulement les producteurs dont un document a changé depuis le dernier passage.
    let wm = "1970-01-01T00:00:00Z";
    try { wm = fs.readFileSync(WM_PATH, "utf8").trim() || wm; } catch { /* premier run */ }
    const max = await pgc.query(`SELECT max(maj_le) m FROM planilogix.centre_doc_fichier`);
    newWatermark = max.rows[0]?.m ? new Date(max.rows[0].m).toISOString() : wm;
    const { rows } = await pgc.query(
      `SELECT DISTINCT producteur_id FROM planilogix.centre_doc_fichier
       WHERE producteur_id IS NOT NULL AND statut='uploaded' AND sp_type_code = ANY($1)
         AND maj_le > $2::timestamptz ORDER BY producteur_id`, [TYPES, wm]);
    ids = rows.map((r) => r.producteur_id);
    console.log(`--incremental : ${ids.length} producteur(s) modifié(s) depuis ${wm}.`);
    if (!ids.length) {
      if (newWatermark) fs.writeFileSync(WM_PATH, newWatermark);
      console.log("Rien à synchroniser.");
      await pgc.end();
      return;
    }
  }
  if (!ids.length) { console.error("usage: copy-documents.mjs <producteur_id...> | --all | --incremental"); process.exit(1); }

  let tot = { copies: 0, erreurs: 0, total: 0 };
  for (let i = 0; i < ids.length; i++) {
    try {
      const r = await traiterProducteur(ids[i]);
      tot.copies += r.copies; tot.erreurs += r.erreurs; tot.total += r.total;
    } catch (e) {
      tot.erreurs++;
      console.error(`Producteur ${ids[i]} ABANDONNE: ${e.message}`);
    }
    if (ids.length > 5 && (i + 1) % 25 === 0) console.log(`--- ${i + 1}/${ids.length} producteurs ---`);
  }
  console.log(`\nTOTAL: ${tot.copies} copiés / ${tot.total} (${tot.erreurs} erreurs) sur ${ids.length} producteurs.`);
  if (incremental && newWatermark) fs.writeFileSync(WM_PATH, newWatermark);
  await pgc.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
