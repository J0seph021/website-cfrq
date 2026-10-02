/**
 * Edge Function `sync-documents` — couche 2. Logique de copie identique à
 * scripts/copy-documents.mjs (prs/rap/paf, dest {id}/{prescriptions|rapports|plans}/,
 * safeName, upsert onConflict storage_path). Bornée par lot, filigrane dans public.sync_state.
 *
 * Curseur KEYSET (maj_le, producteur_id). PRÉCISION : maj_le a une précision microseconde ;
 * on manipule donc l'horodatage en TEXTE de bout en bout (max(maj_le)::text côté source,
 * last_maj_le lu/écrit tel quel) — JAMAIS via `new Date()` qui tronque à la milliseconde et
 * ferait que `maj_le > filigrane` reste vrai indéfiniment (recopie perpétuelle du début).
 * Avance systématique => progrès garanti même si un fichier échoue (PDF trop gros journalisé).
 * Lecture du filigrane fail-closed (vide/erreur = abandon, jamais epoch).
 *
 * RAPPROCHEMENT (v17, 2026-10-02). Le curseur ne voit que les producteurs dont un document
 * a bougé ; il ne voit pas celui qui en PERD un. Un document rattaché à un autre producteur
 * (N° corrigé dans le centre doc : PAF de Serge Fournier sorti chez « Serge et Jean »)
 * restait donc aussi dans l'ancien espace, pour toujours. Et un fichier dont la copie avait
 * échoué (Bad Gateway, connexion coupée) n'était jamais retenté. À chaque passage, on
 * compare donc la source au portail :
 *  - document que la source rattache à un AUTRE producteur => retiré de l'ancien espace ;
 *    un document devenu « non rattaché » (homonymes en double dans PlaniLogix) reste en
 *    place, on ne fait pas disparaître un document sur une incertitude ;
 *  - document attendu mais absent du portail => recopié (au plus MAX_TENTATIVES fois).
 *
 * Secrets: PLANILOGIX_DB_URL, PLANI_URL, PLANI_STORAGE_KEY, [PLANI_DOC_BUCKET], SYNC_SECRET.
 * SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement.
 */
import pg from "npm:pg@8";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { nommerDocuments } from "./nommer.ts";

type PgClient = InstanceType<typeof pg.Client>;

const {
  PLANILOGIX_DB_URL,
  PLANI_URL,
  PLANI_STORAGE_KEY,
  PLANI_DOC_BUCKET = "centre_documentaire",
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SYNC_SECRET,
  MAX_PRODUCERS = "15",
  TIME_BUDGET_MS = "25000",
} = Deno.env.toObject();

const TYPES = ["prs", "rap", "paf", "rtf"];

const META: Record<string, { type: string; dossier: string }> = {
  prs: { type: "prescription", dossier: "prescriptions" },
  rap: { type: "rapport", dossier: "rapports" },
  paf: { type: "paf", dossier: "plans" },
  rtf: { type: "rtf", dossier: "taxes" },
};
const TYPES_PORTAIL = Object.values(META).map((m) => m.type);

// Client de démonstration (scripts/client-demo) : absent de PlaniLogix, jamais rapproché.
const PRODUCTEUR_DEMO_MIN = 900000;
// Au-delà, un retrait massif trahit un problème de source plutôt qu'une correction : on
// n'enlève rien et on le signale dans le résumé.
const MAX_RETRAITS = 200;
// Fichiers manquants recopiés par passage, et tentatives par fichier avant d'abandonner.
const MAX_REPRISES = 10;
const MAX_TENTATIVES = 3;

const SQL_DOCS = `
SELECT storage_key, nom_fichier, sp_type_code, no_prescription, taille_octets, sp_annee
FROM planilogix.centre_doc_fichier
WHERE producteur_id = $1 AND statut = 'uploaded' AND sp_type_code = ANY($2)
ORDER BY sp_type_code, no_prescription NULLS LAST, nom_fichier`;

// pmax en TEXTE pour garder la précision microseconde (voir en-tête).
const SQL_BATCH = `
SELECT producteur_id, max(maj_le)::text AS pmax
FROM planilogix.centre_doc_fichier
WHERE producteur_id IS NOT NULL AND statut = 'uploaded' AND sp_type_code = ANY($1)
GROUP BY producteur_id
HAVING max(maj_le) > $2::timestamptz
    OR (max(maj_le) = $2::timestamptz AND producteur_id > $3)
ORDER BY max(maj_le) ASC, producteur_id ASC
LIMIT $4`;

// Tous les documents de la source, rattachés ou non (le rapprochement a besoin des deux).
const SQL_SOURCE = `
SELECT producteur_id, sp_type_code, nom_fichier
FROM planilogix.centre_doc_fichier
WHERE statut = 'uploaded' AND sp_type_code = ANY($1)`;

function safeName(name: string) {
  return name
    .normalize("NFKD").replace(/[^\x00-\x7F]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Bilan = { copies: number; erreurs: number; total: number; errFiles: string[] };

/**
 * Copie les documents d'un producteur vers le portail.
 * `seulement` absent : passage normal, tout est effacé puis recopié.
 * `seulement` donné : reprise, seuls ces chemins sont transférés ; les autres lignes du
 * producteur ne reçoivent que leur nom (un document ajouté peut renuméroter ses voisins).
 * Rend les chemins dont la copie a échoué.
 */
async function copierProducteur(
  pgc: PgClient, site: SupabaseClient, plani: SupabaseClient,
  id: number, bilan: Bilan, seulement?: Set<string>,
): Promise<string[]> {
  const { rows: docs } = await pgc.query(SQL_DOCS, [id, TYPES]);
  // Noms calculés sur l'ensemble des documents du producteur : distincts entre eux.
  const noms = nommerDocuments(docs.map((r) => ({
    code: r.sp_type_code, fichier: safeName(r.nom_fichier), annee: r.sp_annee,
  })));

  if (!seulement) {
    await site.from("documents").delete()
      .eq("producteur_id", id).in("type_document", TYPES_PORTAIL);
  }

  const echecs: string[] = [];
  for (const [k, r] of docs.entries()) {
    const meta = META[r.sp_type_code];
    if (!meta) continue;
    const dest = `${id}/${meta.dossier}/${safeName(r.nom_fichier)}`;
    const transferer = !seulement || seulement.has(dest);
    try {
      if (transferer) {
        const dl = await plani.storage.from(PLANI_DOC_BUCKET).download(r.storage_key);
        if (dl.error) throw new Error("download: " + dl.error.message);
        const buf = new Uint8Array(await dl.data.arrayBuffer());
        const up = await site.storage.from("documents").upload(dest, buf, {
          contentType: "application/pdf", upsert: true,
        });
        if (up.error) throw new Error("upload: " + up.error.message);
      }
      const { error: dbErr } = await site.from("documents").upsert({
        producteur_id: id,
        type_document: meta.type,
        reference: r.no_prescription,
        nom_document: noms[k],
        storage_path: dest,
        taille: `${Math.round(r.taille_octets / 1024)} Ko`,
        date_document: r.sp_annee ? String(r.sp_annee).replace(/\.0$/, "") : null,
      }, { onConflict: "storage_path" });
      if (dbErr) throw new Error("db: " + dbErr.message);
      if (transferer) bilan.copies++;
    } catch (e) {
      if (!transferer) continue;   // ligne déjà au portail : son nom attendra le prochain passage
      bilan.erreurs++;
      echecs.push(dest);
      if (bilan.errFiles.length < 50) bilan.errFiles.push(`${id}/${r.nom_fichier}: ${(e as Error).message}`);
      console.error(`producteur ${id} / ${r.nom_fichier}: ${(e as Error).message}`);
    }
  }
  bilan.total += seulement ? seulement.size : docs.length;
  return echecs;
}

/** Compare la source au portail : documents à retirer, documents manquants par producteur. */
async function rapprocher(pgc: PgClient, site: SupabaseClient) {
  const { rows } = await pgc.query(SQL_SOURCE, [TYPES]);
  const attendus = new Set<string>();
  // « dossier/fichier » -> producteurs qui l'ont dans la source (null = non rattaché).
  const rattachements = new Map<string, Set<number | null>>();
  for (const r of rows) {
    const cle = `${META[r.sp_type_code].dossier}/${safeName(r.nom_fichier)}`;
    if (!rattachements.has(cle)) rattachements.set(cle, new Set());
    rattachements.get(cle)!.add(r.producteur_id);
    if (r.producteur_id !== null) attendus.add(`${r.producteur_id}/${cle}`);
  }

  const portail: { producteur_id: number; storage_path: string }[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await site.from("documents").select("producteur_id,storage_path")
      .in("type_document", TYPES_PORTAIL).order("storage_path").range(de, de + 999);
    if (error) throw new Error("lecture documents: " + error.message);
    portail.push(...data);
    if (data.length < 1000) break;
  }

  const presents = new Set(portail.map((d) => d.storage_path));
  const retraits: string[] = [];
  let incertains = 0;
  for (const d of portail) {
    if (d.producteur_id >= PRODUCTEUR_DEMO_MIN || attendus.has(d.storage_path)) continue;
    const r = rattachements.get(d.storage_path.slice(d.storage_path.indexOf("/") + 1));
    if (r && r.size > 0 && !r.has(null)) retraits.push(d.storage_path);
    else incertains++;
  }

  const manquants = new Map<number, string[]>();
  for (const chemin of attendus) {
    if (presents.has(chemin)) continue;
    const id = Number(chemin.slice(0, chemin.indexOf("/")));
    manquants.set(id, [...(manquants.get(id) ?? []), chemin]);
  }

  // Garde-fou : une source anormalement maigre (lecture partielle) ne vide pas le portail.
  const sourceSaine = attendus.size >= portail.length * 0.5;
  return { retraits, incertains, manquants, sourceSaine, attendus: attendus.size, portail: portail.length };
}

Deno.serve(async (req) => {
  // Refus par défaut : sans SYNC_SECRET configuré, personne ne passe. Avant, un secret
  // absent faisait sauter la vérification, et la réponse (errFiles) expose des numéros
  // de producteur et des noms de fichiers.
  if (!SYNC_SECRET || req.headers.get("x-sync-secret") !== SYNC_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!PLANILOGIX_DB_URL || !PLANI_URL || !PLANI_STORAGE_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "secrets manquants" }, 500);
  }

  const started = Date.now();
  const maxProducers = Math.max(1, parseInt(MAX_PRODUCERS, 10) || 15);
  const timeBudget = parseInt(TIME_BUDGET_MS, 10) || 25000;
  // Essai à blanc : rapprochement calculé, rien n'est retiré ni copié.
  const aBlanc = new URL(req.url).searchParams.get("a_blanc") === "1";

  const site = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const plani = createClient(PLANI_URL, PLANI_STORAGE_KEY, { auth: { persistSession: false } });

  const pgc = new pg.Client({
    connectionString: PLANILOGIX_DB_URL.replace(/[?&]sslmode=[^&]*/gi, ""),
    ssl: { rejectUnauthorized: false },
  });

  let processedProducers = 0;
  const bilan: Bilan = { copies: 0, erreurs: 0, total: 0, errFiles: [] };
  let newWmTs: string | null = null;
  let newWmId = 0;
  const rappro: Record<string, unknown> = {};

  try {
    await pgc.connect();

    // Filigrane : last_maj_le lu tel quel (chaîne pleine précision via PostgREST), fail-closed.
    const { data: st, error: stErr } = await site.from("sync_state")
      .select("last_maj_le,last_producteur_id").eq("key", "documents").maybeSingle();
    if (stErr) throw new Error("lecture sync_state: " + stErr.message);
    if (!st) throw new Error("sync_state 'documents' introuvable — abandon (anti-recopie)");
    const wmTs: string = st.last_maj_le;
    const wmId: number = st.last_producteur_id ?? 0;

    // 1. Rapprochement source / portail.
    const r = await rapprocher(pgc, site);
    Object.assign(rappro, {
      attendus: r.attendus, portail: r.portail, incertains: r.incertains,
      manquants: [...r.manquants.values()].reduce((n, l) => n + l.length, 0),
      aRetirer: r.retraits.length,
    });
    if (aBlanc) {
      await pgc.end().catch(() => {});
      return json({ ok: true, aBlanc: true, ...rappro, retraits: r.retraits,
        manquants: Object.fromEntries(r.manquants) });
    }

    if (!r.sourceSaine) {
      rappro.retraitsSuspendus = "source anormalement petite";
    } else if (r.retraits.length > MAX_RETRAITS) {
      rappro.retraitsSuspendus = `${r.retraits.length} retraits > ${MAX_RETRAITS}`;
    } else if (r.retraits.length) {
      for (let i = 0; i < r.retraits.length; i += 100) {
        const lot = r.retraits.slice(i, i + 100);
        const { error } = await site.from("documents").delete().in("storage_path", lot);
        if (error) throw new Error("retrait documents: " + error.message);
        await site.storage.from("documents").remove(lot);
      }
      rappro.retires = r.retraits;
      console.log(`retirés (rattachés à un autre producteur) : ${r.retraits.join(", ")}`);
    }

    // 2. Reprise des copies manquantes, avec mémoire des tentatives.
    const { data: rep } = await site.from("sync_state")
      .select("last_summary").eq("key", "documents_reprises").maybeSingle();
    const anciennes: Record<string, number> = rep?.last_summary?.tentatives ?? {};
    const tentatives: Record<string, number> = {};
    let repris = 0;
    for (const [id, chemins] of r.manquants) {
      const essais = chemins.filter((c) => (anciennes[c] ?? 0) < MAX_TENTATIVES);
      for (const c of chemins) if (anciennes[c]) tentatives[c] = anciennes[c];
      if (!essais.length || repris >= MAX_REPRISES || Date.now() - started > timeBudget / 2) continue;
      const lot = new Set(essais.slice(0, MAX_REPRISES - repris));
      repris += lot.size;
      const echecs = await copierProducteur(pgc, site, plani, id, bilan, lot);
      for (const c of lot) {
        if (echecs.includes(c)) tentatives[c] = (anciennes[c] ?? 0) + 1;
        else delete tentatives[c];
      }
    }
    rappro.repris = repris;
    rappro.abandonnes = Object.entries(tentatives).filter(([, n]) => n >= MAX_TENTATIVES).map(([c]) => c);
    await site.from("sync_state").upsert({
      key: "documents_reprises",
      last_run: new Date().toISOString(),
      last_summary: { tentatives },
    }, { onConflict: "key" });

    // 3. Passage normal : producteurs dont un document a bougé depuis le filigrane.
    const { rows: batch } = await pgc.query(SQL_BATCH, [TYPES, wmTs, wmId, maxProducers]);

    for (const b of batch) {
      if (Date.now() - started > timeBudget) break;
      await copierProducteur(pgc, site, plani, b.producteur_id, bilan);
      processedProducers++;
      // Avance en gardant la précision (chaîne ::text de pmax, pas de new Date()).
      newWmTs = b.pmax;
      newWmId = b.producteur_id;
    }

    const resume = { processedProducers, ...bilan, rapprochement: rappro };
    if (processedProducers > 0 && newWmTs) {
      await site.from("sync_state").upsert({
        key: "documents",
        last_maj_le: newWmTs,
        last_producteur_id: newWmId,
        last_run: new Date().toISOString(),
        last_summary: resume,
      }, { onConflict: "key" });
    } else {
      await site.from("sync_state").update({ last_run: new Date().toISOString(), last_summary: resume })
        .eq("key", "documents");
    }
  } catch (e) {
    return json({ error: (e as Error).message, processedProducers, ...bilan }, 500);
  } finally {
    await pgc.end().catch(() => {});
  }

  return json({
    ok: true,
    processedProducers,
    ...bilan,
    rapprochement: rappro,
    advancedWatermarkTo: newWmTs ? { last_maj_le: newWmTs, last_producteur_id: newWmId } : null,
    elapsedMs: Date.now() - started,
  });
});
