/**
 * sync-courriels : l'empreinte du courriel de chaque dossier, de PlaniLogix vers
 * l'espace client, pour ouvrir le dossier sans approbation quand un client crée son
 * compte avec le courriel qu'on a au dossier.
 *
 * JM, 2026-10-09 : « pourquoi il a pas directement accès à son espace client si le
 * courriel fitte avec nos dossiers? » ; « pour les clients avec plusieurs
 * compagnies/propriétés on va toutes les associer à ce client ».
 *
 *   PlaniLogix (planilogix.producteur.email)
 *   ──[ce passage : SHA-256 calculé DANS PlaniLogix]──>
 *   portail (public.producteurs_courriels) ──> est_titulaire() / current_producteur_id()
 *
 * Aucune adresse ne sort de PlaniLogix en clair : la requête rend l'empreinte
 * seulement. Le portail compare l'empreinte du courriel CONFIRMÉ du compte
 * (migration 20261009160000_liaison_par_courriel.sql, même calcul).
 *
 * Un champ courriel peut en contenir plusieurs (« a@x.ca; b@y.ca ») : chacun compte.
 * Les adresses @cfrq.ca sont écartées : l'équipe a sa vue employé, et une adresse
 * de l'équipe inscrite au dossier d'un client ne doit pas lui ouvrir ce dossier.
 *
 * Appelée par pg_cron (supabase/migrations/20261009161000_sync_courriels_cron.sql),
 * gardée par `x-sync-secret` comme sync-traces : mêmes secrets (PLANILOGIX_DB_URL,
 * SYNC_SECRET), rien de nouveau à poser.
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

// Au-delà, un retrait massif trahit une panne de la source (table vide, base
// injoignable à moitié) plutôt qu'une correction : on ne retire rien et on le dit.
const MAX_RETRAITS = 100;
const LOT = 500;
// Client de démonstration (scripts/client-demo) : absent de PlaniLogix, ce passage
// n'y touche jamais (même règle que sync-documents et sync-traces).
const PRODUCTEUR_DEMO_MIN = 900000;

// Même calcul que public.courriel_empreinte() dans le portail.
const SQL_EMPREINTES = `
  SELECT DISTINCT p.id AS producteur_id,
         encode(sha256(convert_to(c, 'UTF8')), 'hex') AS courriel_hash
  FROM planilogix.producteur p
  CROSS JOIN LATERAL regexp_split_to_table(lower(trim(p.email)), '[;,[:space:]]+') AS c
  WHERE p.email IS NOT NULL
    AND c ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'
    AND c NOT LIKE '%@cfrq.ca'`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const cle = (producteurId: number, hash: string) => `${producteurId}:${hash}`;

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
    const { rows } = await pgc.query(SQL_EMPREINTES);

    // Seulement les dossiers présents dans le portail : les autres n'ont rien à
    // montrer, et leur empreinte attend le prochain passage.
    const ids = [...new Set(rows.map((r: any) => Number(r.producteur_id)))];
    const connus = new Set<number>();
    for (let i = 0; i < ids.length; i += LOT) {
      const { data, error } = await site.from("producteurs").select("id").in("id", ids.slice(i, i + LOT));
      if (error) throw new Error("lecture producteurs: " + error.message);
      for (const p of data ?? []) connus.add(Number(p.id));
    }
    const maintenant = new Date().toISOString();
    const lignes = rows
      .filter((r: any) => connus.has(Number(r.producteur_id)))
      .map((r: any) => ({
        producteur_id: Number(r.producteur_id),
        courriel_hash: String(r.courriel_hash),
        maj_le: maintenant,
      }));
    resume.source = rows.length;
    resume.dossiers_hors_portail = ids.filter((id) => !connus.has(id)).length;

    // Par pages : PostgREST rend 1 000 lignes au plus par appel.
    const deja: { producteur_id: number; courriel_hash: string }[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await site
        .from("producteurs_courriels")
        .select("producteur_id,courriel_hash")
        .order("producteur_id")
        .order("courriel_hash")
        .range(de, de + 999);
      if (error) throw new Error("lecture producteurs_courriels: " + error.message);
      for (const d of data ?? []) {
        if (Number(d.producteur_id) < PRODUCTEUR_DEMO_MIN) deja.push({ producteur_id: Number(d.producteur_id), courriel_hash: d.courriel_hash });
      }
      if (!data || data.length < 1000) break;
    }
    const garder = new Set(lignes.map((l) => cle(l.producteur_id, l.courriel_hash)));
    const retirer = deja.filter((d) => !garder.has(cle(d.producteur_id, d.courriel_hash)));
    resume.recopiees = lignes.length;
    resume.a_retirer = retirer.length;

    if (!aBlanc) {
      for (let i = 0; i < lignes.length; i += LOT) {
        const { error } = await site
          .from("producteurs_courriels")
          .upsert(lignes.slice(i, i + LOT), { onConflict: "producteur_id,courriel_hash" });
        if (error) throw new Error("écriture producteurs_courriels: " + error.message);
      }
      if (retirer.length > MAX_RETRAITS) {
        resume.retraits = `suspendus : ${retirer.length} d'un coup, plus de ${MAX_RETRAITS}`;
      } else {
        // Une à une : la clé est double, et c'est rare (un courriel changé dans PlaniLogix).
        for (const r of retirer) {
          const { error } = await site
            .from("producteurs_courriels")
            .delete()
            .eq("producteur_id", r.producteur_id)
            .eq("courriel_hash", r.courriel_hash);
          if (error) throw new Error("retrait producteurs_courriels: " + error.message);
        }
        resume.retraits = retirer.length;
      }
      // Journal des accès par courriel, et demandes d'accès devenues inutiles.
      const { data: liaisons, error: eLiaisons } = await site.rpc("portail_liaisons_courriel_maj");
      if (eLiaisons) throw new Error("journal des liaisons: " + eLiaisons.message);
      resume.liaisons = liaisons;

      await site.from("sync_state").upsert({
        key: "courriels",
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
        key: "courriels",
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
