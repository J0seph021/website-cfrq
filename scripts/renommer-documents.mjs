// Renomme les documents de l'espace client avec la même logique que sync-documents
// (supabase/functions/sync-documents/nommer.ts), pour que les noms déjà en base
// soient distincts sans devoir recopier les 6 000 fichiers.
//
//   node --env-file=scripts/.env scripts/renommer-documents.mjs              (à blanc)
//   node --env-file=scripts/.env scripts/renommer-documents.mjs --appliquer  (écrit)
//
// Node 24 lit nommer.ts directement (syntaxe TypeScript effaçable).
import { createClient } from "@supabase/supabase-js";
import { nommerDocuments } from "../supabase/functions/sync-documents/nommer.ts";

const APPLIQUER = process.argv.includes("--appliquer");
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (scripts/.env).");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CODE = { prescription: "prs", rapport: "rap", paf: "paf", rtf: "rtf" };

// Tout lire, par pages de 1000.
const docs = [];
for (let de = 0; ; de += 1000) {
  const { data, error } = await sb.from("documents").select("*").order("id").range(de, de + 999);
  if (error) throw new Error(error.message);
  docs.push(...data);
  if (data.length < 1000) break;
}

const parProducteur = new Map();
for (const d of docs) parProducteur.set(d.producteur_id, [...(parProducteur.get(d.producteur_id) ?? []), d]);

// Doublons tels que le client les voit : même titre ET même numéro affiché.
const titreAffiche = (d) => d.type_document === "prescription" ? "Prescription sylvicole"
  : d.type_document === "rapport" ? "Rapport d'exécution"
  : d.type_document === "rtf" ? "Rapport de taxes foncières" : d.nom_document;
const annee = (d) => String(d.date_document ?? "").match(/(19|20)\d{2}/)?.[0] ?? "";
function doublons(lignes, titre) {
  const vus = new Map();
  for (const d of lignes) {
    const k = `${d.producteur_id}|${titre(d)}|${annee(d)}|${d.reference ?? ""}`;
    vus.set(k, (vus.get(k) ?? 0) + 1);
  }
  return [...vus.values()].filter((n) => n > 1).reduce((s, n) => s + n, 0);
}

const changements = [];
for (const lignes of parProducteur.values()) {
  const noms = nommerDocuments(lignes.map((d) => ({
    code: CODE[d.type_document] ?? "paf",
    fichier: String(d.storage_path ?? "").split("/").pop(),
    annee: d.date_document,
  })));
  lignes.forEach((d, i) => { if (d.nom_document !== noms[i]) changements.push({ ...d, nom_document: noms[i] }); });
}

const apres = docs.map((d) => changements.find((c) => c.id === d.id) ?? d);
console.log(`Documents : ${docs.length}, producteurs : ${parProducteur.size}`);
console.log(`Doublons vus par le client, avant : ${doublons(docs, titreAffiche)}`);
console.log(`Doublons avec les nouveaux noms   : ${doublons(apres, (d) => d.nom_document)}`);
console.log(`Noms à changer : ${changements.length}`);
const exemples = new Map();
for (const c of changements) {
  const t = c.type_document;
  if ((exemples.get(t) ?? []).length < 4) exemples.set(t, [...(exemples.get(t) ?? []), `${c.nom_document}   <- ${String(c.storage_path).split("/").pop()}`]);
}
for (const [t, ex] of exemples) console.log(`\n${t} :\n  ` + ex.join("\n  "));

if (!APPLIQUER) {
  console.log("\nÀ blanc : rien n'a été écrit. Relancer avec --appliquer.");
  process.exit(0);
}
for (let i = 0; i < changements.length; i += 500) {
  const lot = changements.slice(i, i + 500);
  const { error } = await sb.from("documents").upsert(lot, { onConflict: "id" });
  if (error) throw new Error(`lot ${i}: ${error.message}`);
}
console.log(`\n${changements.length} noms écrits.`);
