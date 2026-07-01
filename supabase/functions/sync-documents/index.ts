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
 * Secrets: PLANILOGIX_DB_URL, PLANI_URL, PLANI_STORAGE_KEY, [PLANI_DOC_BUCKET], SYNC_SECRET.
 * SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement.
 */
import pg from "npm:pg@8";
import { createClient } from "npm:@supabase/supabase-js@2";

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

const TYPES = ["prs", "rap", "paf"];

const META: Record<string, { type: string; dossier: string }> = {
  prs: { type: "prescription", dossier: "prescriptions" },
  rap: { type: "rapport", dossier: "rapports" },
  paf: { type: "paf", dossier: "plans" },
};

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

function nomLisible(tcode: string, no: string | null, annee: unknown) {
  if (tcode === "prs") return `Prescription ${no ?? ""}`.trim();
  if (tcode === "rap") return `Rapport d'exécution ${no ?? ""}`.trim();
  return `Plan d'aménagement forestier${annee ? " " + String(annee).replace(/\.0$/, "") : ""}`;
}

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

Deno.serve(async (req) => {
  if (SYNC_SECRET && req.headers.get("x-sync-secret") !== SYNC_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!PLANILOGIX_DB_URL || !PLANI_URL || !PLANI_STORAGE_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "secrets manquants" }, 500);
  }

  const started = Date.now();
  const maxProducers = Math.max(1, parseInt(MAX_PRODUCERS, 10) || 15);
  const timeBudget = parseInt(TIME_BUDGET_MS, 10) || 25000;

  const site = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const plani = createClient(PLANI_URL, PLANI_STORAGE_KEY, { auth: { persistSession: false } });

  const pgc = new pg.Client({
    connectionString: PLANILOGIX_DB_URL.replace(/[?&]sslmode=[^&]*/gi, ""),
    ssl: { rejectUnauthorized: false },
  });

  let processedProducers = 0, copies = 0, erreurs = 0, total = 0;
  const errFiles: string[] = [];
  let newWmTs: string | null = null;
  let newWmId = 0;

  try {
    await pgc.connect();

    // Filigrane : last_maj_le lu tel quel (chaîne pleine précision via PostgREST), fail-closed.
    const { data: st, error: stErr } = await site.from("sync_state")
      .select("last_maj_le,last_producteur_id").eq("key", "documents").maybeSingle();
    if (stErr) throw new Error("lecture sync_state: " + stErr.message);
    if (!st) throw new Error("sync_state 'documents' introuvable — abandon (anti-recopie)");
    const wmTs: string = st.last_maj_le;
    const wmId: number = st.last_producteur_id ?? 0;

    const { rows: batch } = await pgc.query(SQL_BATCH, [TYPES, wmTs, wmId, maxProducers]);

    for (const b of batch) {
      if (Date.now() - started > timeBudget) break;
      const id = b.producteur_id;
      const { rows: docs } = await pgc.query(SQL_DOCS, [id, TYPES]);

      await site.from("documents").delete()
        .eq("producteur_id", id).in("type_document", ["prescription", "rapport", "paf"]);

      for (const r of docs) {
        const meta = META[r.sp_type_code];
        if (!meta) continue;
        try {
          const dl = await plani.storage.from(PLANI_DOC_BUCKET).download(r.storage_key);
          if (dl.error) throw new Error("download: " + dl.error.message);
          const buf = new Uint8Array(await dl.data.arrayBuffer());
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
          if (errFiles.length < 50) errFiles.push(`${id}/${r.nom_fichier}: ${(e as Error).message}`);
          console.error(`producteur ${id} / ${r.nom_fichier}: ${(e as Error).message}`);
        }
      }
      total += docs.length;
      processedProducers++;
      // Avance en gardant la précision (chaîne ::text de pmax, pas de new Date()).
      newWmTs = b.pmax;
      newWmId = b.producteur_id;
    }

    if (processedProducers > 0 && newWmTs) {
      await site.from("sync_state").upsert({
        key: "documents",
        last_maj_le: newWmTs,
        last_producteur_id: newWmId,
        last_run: new Date().toISOString(),
        last_summary: { processedProducers, copies, erreurs, total, errFiles },
      }, { onConflict: "key" });
    } else {
      await site.from("sync_state").update({ last_run: new Date().toISOString() }).eq("key", "documents");
    }
  } catch (e) {
    return json({ error: (e as Error).message, processedProducers, copies, erreurs }, 500);
  } finally {
    await pgc.end().catch(() => {});
  }

  return json({
    ok: true,
    processedProducers,
    copies,
    erreurs,
    total,
    advancedWatermarkTo: newWmTs ? { last_maj_le: newWmTs, last_producteur_id: newWmId } : null,
    errFiles,
    elapsedMs: Date.now() - started,
  });
});
