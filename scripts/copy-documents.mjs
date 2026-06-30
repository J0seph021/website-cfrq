/**
 * Copie les PDF livrables d'un producteur (prescriptions + rapports d'exécution)
 * depuis le projet Supabase PlaniLogix vers le bucket privé `documents` du site,
 * dans un dossier {producteur_id}/ protégé par RLS, et renseigne la table
 * public.documents (reference = no_prescription) pour l'affichage côté client.
 *
 * Sécurité: les PDF sont servis par le projet du site via la connexion du client
 * (RLS sur current_producteur_id()). La clé PlaniLogix ne sert qu'au transfert
 * hors-ligne et n'est jamais exposée au navigateur.
 *
 * Pré-requis (.env): PLANILOGIX_DB_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *                    PLANI_URL, PLANI_STORAGE_KEY, PLANI_DOC_BUCKET
 * Usage: node --env-file=scripts/.env scripts/copy-documents.mjs 2546 [autres ids...]
 */
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

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

// Prescriptions d'un producteur (intersection spatiale avec sa propriété).
const SQL_PRESC = `
SELECT DISTINCT pc.no_prescription
FROM planilogix.v_prescription_carte pc,
     (SELECT ST_Union(geom) g FROM planilogix.v_proprietes WHERE producteur_id = $1 AND geom IS NOT NULL) prop
WHERE ST_Intersects(pc.geom, prop.g) AND pc.no_prescription IS NOT NULL`;

// Objets PDF dans centre_documentaire pour un numéro: prs_ (prescription), rap_ (rapport).
async function objetsPour(no) {
  const { rows } = await pgc.query(
    `SELECT name FROM storage.objects
     WHERE bucket_id = $2 AND (name = 'prs_'||$1||'.pdf' OR name ~ ('^rap_'||$1||'_[0-9]+\\.pdf$'))`,
    [no, PLANI_DOC_BUCKET]
  );
  return rows.map((r) => r.name);
}

const typeDe = (name) =>
  name.startsWith("prs_") ? "prescription" : name.startsWith("rap_") ? "rapport" : "document";
const dossierDe = (type) => (type === "prescription" ? "prescriptions" : "rapports");

async function traiterProducteur(id) {
  const { rows: prescs } = await pgc.query(SQL_PRESC, [id]);
  // Idempotence: on repart propre pour ce producteur.
  await site.from("documents").delete().eq("producteur_id", id).in("type_document", ["prescription", "rapport"]);

  let copies = 0, sansPdf = 0, erreurs = 0;
  for (const { no_prescription: no } of prescs) {
    const objs = await objetsPour(no);
    if (!objs.length) { sansPdf++; continue; }
    for (const name of objs) {
      try {
        const type = typeDe(name);
        const dl = await plani.storage.from(PLANI_DOC_BUCKET).download(name);
        if (dl.error) throw new Error("download: " + dl.error.message);
        const buf = Buffer.from(await dl.data.arrayBuffer());
        const dest = `${id}/${dossierDe(type)}/${name}`;
        const up = await site.storage.from("documents").upload(dest, buf, {
          contentType: "application/pdf", upsert: true,
        });
        if (up.error) throw new Error("upload: " + up.error.message);
        const { error: dbErr } = await site.from("documents").upsert({
          producteur_id: id,
          type_document: type,
          reference: no,
          nom_document: type === "prescription" ? `Prescription ${no}` : `Rapport d'exécution ${no}`,
          storage_path: dest,
          taille: `${Math.round(buf.length / 1024)} Ko`,
        }, { onConflict: "storage_path" });
        if (dbErr) throw new Error("db: " + dbErr.message);
        copies++;
      } catch (e) {
        erreurs++;
        console.error(`  ${name}: ${e.message}`);
      }
    }
  }
  console.log(`Producteur ${id}: ${copies} PDF copié(s), ${sansPdf} prescription(s) sans PDF, ${erreurs} erreur(s).`);
}

async function main() {
  const ids = process.argv.slice(2).map(Number).filter(Boolean);
  if (!ids.length) { console.error("usage: copy-documents.mjs <producteur_id> [...]"); process.exit(1); }
  await pgc.connect();
  for (const id of ids) await traiterProducteur(id);
  await pgc.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
