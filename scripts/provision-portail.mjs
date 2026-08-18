/**
 * Provisionne des comptes de l'espace client (projet Supabase "Relevés forestiers").
 *
 * Pour chaque entrée : crée l'utilisateur auth (courriel confirmé + mot de passe),
 * puis relie ce compte à son dossier producteur via public.portal_users.
 * Résultat : le client peut se connecter par LIEN MAGIQUE *ou* par mot de passe,
 * et son tableau de bord est déjà rempli (RLS via current_producteur_id()).
 *
 * Rien n'est envoyé au client : email_confirm=true ne déclenche aucun courriel.
 *
 * Usage :
 *   node --env-file=scripts/.env scripts/provision-portail.mjs
 *   node --env-file=scripts/.env scripts/provision-portail.mjs courriel@x.ca:3127:MotDePasse
 *     (chaque argument = courriel:producteur_id:mot_de_passe)
 */
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Variables manquantes (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). Voir scripts/.env.");
  process.exit(1);
}

// Comptes par défaut de la démo. Surchargés si des arguments CLI sont fournis.
const DEFAUTS = [
  { email: "pierre.g@goforestinc.com", producteur_id: 644, password: "Goforest2026", label: "GoForest" },
  { email: "anthony@meunerievicto.com", producteur_id: 3127, password: "ForetAA2026", label: "Forêt AA (Anthony)" },
];

const cli = process.argv.slice(2).map((a) => {
  const [email, pid, password] = a.split(":");
  return { email, producteur_id: Number(pid), password, label: email };
});
const comptes = cli.length ? cli : DEFAUTS;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Retrouve un utilisateur auth par courriel (l'API admin ne filtre pas: on pagine).
async function trouverParCourriel(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || "").toLowerCase() === email.toLowerCase());
    if (u) return u;
    if (data.users.length < 200) break;
  }
  return null;
}

async function provisionner({ email, producteur_id, password, label }) {
  // 1) Créer (ou récupérer) l'utilisateur auth, courriel déjà confirmé.
  let userId;
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      const u = await trouverParCourriel(email);
      if (!u) throw new Error(`existe déjà mais introuvable: ${email}`);
      userId = u.id;
      // Remettre le mot de passe connu + confirmer, au cas où.
      await sb.auth.admin.updateUserById(userId, { password, email_confirm: true });
      console.log(`  ~ ${label}: compte existant réutilisé (${email})`);
    } else {
      throw error;
    }
  } else {
    userId = data.user.id;
    console.log(`  + ${label}: compte créé (${email})`);
  }

  // 2) Relier au dossier producteur (idempotent).
  const { error: e2 } = await sb
    .from("portal_users")
    .upsert({ user_id: userId, producteur_id, actif: true }, { onConflict: "user_id" });
  if (e2) throw e2;

  // 3) Vérifier ce que la RLS exposera (nom du dossier + nb documents).
  const { data: prod } = await sb.from("producteurs").select("nom,no_prod").eq("id", producteur_id).maybeSingle();
  const { count: nbDocs } = await sb
    .from("documents")
    .select("*", { count: "exact", head: true })
    .eq("producteur_id", producteur_id);
  const { count: nbCartes } = await sb
    .from("cartes")
    .select("*", { count: "exact", head: true })
    .eq("producteur_id", producteur_id);

  console.log(
    `    relié -> dossier ${producteur_id} « ${prod?.nom ?? "?"} » | ${nbDocs ?? 0} documents | carte: ${
      nbCartes ? "oui" : "non"
    }`
  );
  return { label, email, password, producteur_id, userId };
}

async function main() {
  console.log(`Provisionnement de ${comptes.length} compte(s)...\n`);
  const faits = [];
  for (const c of comptes) {
    try {
      faits.push(await provisionner(c));
    } catch (e) {
      console.error(`  ! ${c.label}: ${e.message}`);
    }
  }

  console.log("\n=== Récapitulatif des accès (à garder pour la démo) ===");
  for (const f of faits) {
    console.log(`${f.label.padEnd(22)} ${f.email.padEnd(30)} mot de passe: ${f.password}`);
  }
  console.log("\nConnexion: /espace-client  (lien magique OU « Se connecter par mot de passe »)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
