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
 * Les comptes sont passés en argument, jamais écrits dans ce fichier. Le dépôt est
 * PUBLIC : un mot de passe de client committé ici est lisible par n'importe qui, et
 * l'historique Git en garde une copie même après suppression. Deux comptes de
 * démonstration y sont restés du 2026-08-18 au 2026-09-15 ; leurs mots de passe ont
 * dû être changés. Ne jamais remettre de valeur par défaut.
 *
 * Usage :
 *   node --env-file=scripts/.env scripts/provision-portail.mjs courriel@x.ca:3127:MotDePasse
 *     (chaque argument = courriel:producteur_id:mot_de_passe)
 *   Le mot de passe peut être omis (courriel@x.ca:3127) : il est alors tiré au hasard
 *   et affiché à la fin, ce qui évite les mots de passe devinables.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Variables manquantes (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). Voir scripts/.env.");
  process.exit(1);
}

const comptes = process.argv.slice(2).map((a) => {
  const [email, pid, password] = a.split(":");
  if (!email || !pid) {
    console.error(`Argument invalide : « ${a} ». Attendu : courriel:producteur_id[:mot_de_passe]`);
    process.exit(1);
  }
  // Sans mot de passe fourni, on en tire un au hasard plutôt que d'en laisser choisir
  // un devinable. Il est affiché dans le récapitulatif final.
  return {
    email,
    producteur_id: Number(pid),
    password: password || randomBytes(12).toString("base64url"),
    label: email,
  };
});

if (comptes.length === 0) {
  console.error("Aucun compte demandé. Usage : provision-portail.mjs courriel@x.ca:3127[:MotDePasse] ...");
  process.exit(1);
}

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
