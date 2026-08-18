// Redirections des URL de l'ancien site WordPress vers le nouveau site.
//
// Source : le sitemap WordPress de cfrq.ca relevé le 2026-08-18
// (wp-sitemap-posts-page-1.xml et wp-sitemap-posts-private-page-1.xml).
// Toute URL indexée par Google qui n'existe plus telle quelle doit figurer ici,
// sinon elle tombe en 404 et le référencement acquis est perdu.
//
// Ces redirections sont générées par Astro sous forme de pages `meta refresh`
// (GitHub Pages est un hébergeur statique, il ne sait pas répondre 301).
// Cloudflare étant devant le domaine, on double ces règles par de vraies 301
// côté Cloudflare : voir MISE_EN_PROD.md. Les deux sont complémentaires, la
// version Astro restant le filet si une règle Cloudflare disparaît.

/** URL de l'ancien site volontairement laissées en 404, décision du 2026-08-18.
 *  Elles aboutissent sur la page 404 sur mesure, qui oriente vers les services
 *  et les coordonnées. Documenté ici pour que ce soit un choix, pas un oubli.
 *
 *  - /assistant-reg-for/  Assistant de réglementation forestière. C'était une
 *    extension WordPress (galogix-assistant 0.1.10) : impossible à porter telle
 *    quelle sur un site statique, et l'outil n'est plus offert.
 *  - /login  Connexion WordPress, disparaît avec l'ancien site. Aucune valeur SEO.
 */

/** Fiches d'utilisateur WordPress, publiées dans le sitemap mais fermées au
 *  public (« Vous n'avez pas la permission de voir cette page ! »).
 *  Aucune valeur SEO, mais elles sont connues de Google : on les renvoie vers
 *  la page d'équipe plutôt que de les laisser en 404. */
const FICHES_PRIVATE_PAGE = [
  "administrateur-cfrq",
  "cedric-maheu",
  "christian-dumont",
  "claude-mcp-claude-mcp",
  "dominique-denis",
  "felix-antoine-gingras",
  "imedia-firme-creative",
  "jean-benois-girard",
  "jean-chrystophe-gingras",
  "joseph-moffet",
  "louis-chabot",
  "martin-nadeau",
  "mbiadmin",
  "michel-gagnon",
  "pierre-cadorette",
  "ray",
  "raynald-gingras",
  "remy-gingras",
  "sebastien-rioux",
  "simon-proulx",
  "victor-haccoun-desgagne",
];

/**
 * Construit la table de redirections attendue par `astro.config.mjs`.
 * Astro ne préfixe pas la base aux destinations : on le fait à la main pour que
 * l'aperçu GitHub Pages (base /website-cfrq) fonctionne aussi.
 *
 * @param {string} base valeur de SITE_BASE ("/" ou "/website-cfrq")
 */
export function redirectionsHeritees(base = "/") {
  const prefixe = base.replace(/\/$/, "");
  const vers = (chemin) => `${prefixe}${chemin}`;

  /** @type {Record<string, string>} */
  const table = {
    // Service retiré (2026-08) : on préserve l'URL WordPress historique.
    "/service-aux-entrepreneurs-en-travaux-sylvicoles/": vers("/services/"),
    // Ancienne page du relevé forestier (Supabase + liens Stripe encore en mode
    // test, donc aucune vente en cours). Le calculateur de valeur du bois tient
    // la même promesse, en mieux : c'est la destination la plus proche.
    "/mon-releve/": vers("/calculateur-valeur-bois/"),
  };

  for (const slug of FICHES_PRIVATE_PAGE) {
    table[`/private-page/${slug}/`] = vers("/notre-equipe/");
  }

  return table;
}

export { FICHES_PRIVATE_PAGE };
