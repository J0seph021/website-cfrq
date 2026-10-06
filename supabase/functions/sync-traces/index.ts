/**
 * sync-traces : les traces GPS des entrepreneurs, de PlaniLogix vers l'espace client.
 *
 * JM, 2026-10-06 : « on peut pas partir une routine, un cron, peu importe quoi
 * qui roule en ligne, synchronise sur notre serveur et affiche les traces dans
 * Plani et dans l'espace client ? » ; « je veux juste que le client voit les
 * traces de l'entrepreneur, pas nos choses à nous » ; « on affiche ce que
 * ForestLogix produit ».
 *
 *   ForestLogix (G.A. Logix)  ──[1. pas encore branché]──>
 *   PlaniLogix (planilogix.trace_entrepreneur, telles quelles)
 *   ──[2. ce passage]──> portail (public.traces_chantier) ──> espace client (RLS)
 *
 * 2. La vue `planilogix.v_trace_portail` (migration 103 de PlaniLogix) fait le
 *    tri : les ENTREPRENEURS seulement, coupées aux LOTS DU CLIENT, sans nom
 *    d'opérateur, de machine ni d'entrepreneur. Ce passage la recopie telle
 *    quelle, retire ce qu'elle ne donne plus, et ne fait rien d'autre.
 *
 * Appelée par pg_cron (voir supabase/migrations/20261006231000_sync_traces_cron.sql),
 * gardée par `x-sync-secret` comme `sync-documents` : mêmes secrets du projet
 * (PLANILOGIX_DB_URL, SYNC_SECRET), rien de nouveau à poser.
 * Essai à blanc, sans rien écrire : `?a_blanc=1`.
 */
import pg from "npm:pg@8";
import { createClient } from "npm:@supabase/supabase-js@2";

const {
  PLANILOGIX_DB_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SYNC_SECRET,
} = Deno.env.toObject();

// Au-delà, un retrait massif trahit une panne de la source (vue vide, base
// injoignable à moitié) plutôt qu'une correction : on ne retire rien et on le dit.
const MAX_RETRAITS = 200;
const LOT = 500;

// Simplifiée à environ 1 m (en degrés) : une journée de machine compte des
// milliers de sommets, la carte du client n'a pas besoin de plus.
const SQL_TRACES = `
  SELECT id, producteur_id, jour::text AS jour, debut, fin, longueur_m,
         ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom_wgs84, 0.00001), 6)::json AS geometrie
  FROM planilogix.v_trace_portail
  WHERE producteur_id IS NOT NULL`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // Refus par défaut : sans SYNC_SECRET configuré, personne ne passe.
  if (!SYNC_SECRET || req.headers.get("x-sync-secret") !== SYNC_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!PLANILOGIX_DB_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "secrets manquants" }, 500);
  }
  const aBlanc = new URL(req.url).searchParams.get("a_blanc") === "1";
  const site = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const pgc = new pg.Client({
    connectionString: PLANILOGIX_DB_URL.replace(/[?&]sslmode=[^&]*/gi, ""),
    ssl: { rejectUnauthorized: false },
  });
  const resume: Record<string, unknown> = { a_blanc: aBlanc };

  try {
    await pgc.connect();

    // 1. Lire chez ForestLogix : pas encore branché. JM, 2026-10-06 : « c'est
    //    moi qui s'adapte à Alex » ; on passera par une porte qui existe déjà
    //    chez G.A. Logix. D'ici là, les traces arrivent dans PlaniLogix par
    //    l'extension.
    resume.forestlogix = "lecture pas encore branchée";

    // 2. Le miroir.
    const { rows } = await pgc.query(SQL_TRACES);
    const ids = [...new Set(rows.map((r: any) => Number(r.producteur_id)))];
    // Un producteur absent du portail (pas encore poussé) attend le prochain
    // passage : la clé étrangère refuserait tout le lot.
    const connus = new Set<number>();
    for (let i = 0; i < ids.length; i += LOT) {
      const { data, error } = await site.from("producteurs").select("id").in("id", ids.slice(i, i + LOT));
      if (error) throw new Error("lecture producteurs: " + error.message);
      for (const p of data ?? []) connus.add(Number(p.id));
    }
    const lignes = rows
      .filter((r: any) => connus.has(Number(r.producteur_id)) && r.geometrie)
      .map((r: any) => ({
        id: Number(r.id),
        producteur_id: Number(r.producteur_id),
        jour: r.jour,
        debut: r.debut,
        fin: r.fin,
        longueur_m: r.longueur_m == null ? null : Number(r.longueur_m),
        geometrie: r.geometrie,
        maj_le: new Date().toISOString(),
      }));
    resume.source = rows.length;
    resume.producteurs_absents = ids.filter((id) => !connus.has(id)).length;

    // Par pages : PostgREST rend 1 000 lignes au plus par appel.
    const deja: number[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await site.from("traces_chantier").select("id").order("id").range(de, de + 999);
      if (error) throw new Error("lecture traces_chantier: " + error.message);
      for (const d of data ?? []) deja.push(Number(d.id));
      if (!data || data.length < 1000) break;
    }
    const garder = new Set(lignes.map((l) => l.id));
    const retirer = deja.filter((id) => !garder.has(id));
    resume.recopiees = lignes.length;
    resume.a_retirer = retirer.length;

    if (!aBlanc) {
      for (let i = 0; i < lignes.length; i += LOT) {
        const { error } = await site.from("traces_chantier").upsert(lignes.slice(i, i + LOT), { onConflict: "id" });
        if (error) throw new Error("écriture traces_chantier: " + error.message);
      }
      if (retirer.length > MAX_RETRAITS) {
        resume.retraits = `suspendus : ${retirer.length} d'un coup, plus de ${MAX_RETRAITS}`;
      } else if (retirer.length) {
        for (let i = 0; i < retirer.length; i += LOT) {
          const { error } = await site.from("traces_chantier").delete().in("id", retirer.slice(i, i + LOT));
          if (error) throw new Error("retrait traces_chantier: " + error.message);
        }
        resume.retraits = retirer.length;
      }
      await site.from("sync_state").upsert({
        key: "traces",
        last_run: new Date().toISOString(),
        last_summary: resume,
        updated_at: new Date().toISOString(),
      });
    }
    return json({ ok: true, ...resume });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    resume.erreur = message;
    if (!aBlanc) {
      await site.from("sync_state").upsert({
        key: "traces",
        last_run: new Date().toISOString(),
        last_summary: resume,
        updated_at: new Date().toISOString(),
      });
    }
    return json({ ok: false, ...resume }, 500);
  } finally {
    try { await pgc.end(); } catch { /* déjà fermée */ }
  }
});
