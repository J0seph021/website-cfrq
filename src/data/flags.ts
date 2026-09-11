// Interrupteurs de publication, lus au build (Node), jamais expédiés au client.

/** La seule adresse qui a le droit d'être indexée et mesurée. */
export const SITE_PRODUCTION = "https://cfrq.ca";

/**
 * Vrai uniquement sur le site de production. Tout le reste (préproduction
 * preview.cfrq.ca, aperçu GitHub Pages, poste local) en est exclu.
 *
 * Une copie du site qui se fait indexer est pire que pas de préproduction du
 * tout : Google y voit du contenu dupliqué et peut classer la copie à la place
 * de cfrq.ca. D'où une règle unique, partagée par le `noindex`, le `robots.txt`
 * et la mesure d'audience, pour qu'elles ne puissent pas diverger.
 *
 * @param siteOrigin origine de `Astro.site` (ex. "https://cfrq.ca")
 */
export function estProduction(siteOrigin: string): boolean {
  return siteOrigin === SITE_PRODUCTION;
}

/**
 * Identifiant de mesure d'audience. **Vide = aucune mesure**, ni balise ni
 * bandeau de consentement.
 *
 * Propriété GA4 « CFRQ » (compte 267159722, propriété 550578747, flux
 * « Site cfrq.ca »), créée le 2026-08-18 et contrôlée par CFRQ.
 *
 * Elle remplace le conteneur `GTM-PW8SP69` repris de l'ancien site, qui
 * alimentait la propriété `G-6JE2CNCNNM` d'un tiers non identifié : CFRQ n'en
 * recevait aucune donnée, et le bandeau promettait aux visiteurs une mesure
 * « par CFRQ » qui partait ailleurs.
 */
export const ID_MESURE = "G-80JJK0XLVZ";

/**
 * Mesure d'audience et bandeau de consentement : production seulement, et
 * seulement si un identifiant de mesure est configuré. Sans identifiant, aucun
 * témoin non essentiel n'est déposé, donc il n'y a rien à consentir et le
 * bandeau n'a pas lieu d'être.
 */
export function analytiqueActive(siteOrigin: string): boolean {
  return import.meta.env.PROD && estProduction(siteOrigin) && ID_MESURE !== "";
}

/**
 * L'espace client existe et fonctionne, mais il n'est pas encore ouvert au
 * public : tant que le portail n'est pas publié, la connexion et le tableau de
 * bord ne sont pas routés, et /espace-client sert à la place une page qui
 * explique l'espace client et annonce qu'il est en construction.
 *
 * Le bouton « Espace client » du menu et du pied de page, lui, reste toujours
 * visible : il mène à cette page-là avant l'ouverture, à la connexion après.
 * Ce drapeau ne masque donc plus que les sections des pages Accueil et
 * Services qui invitent à « accéder » au portail.
 *
 * La règle : le portail est ouvert partout SAUF sur cfrq.ca. La préproduction
 * (preview.cfrq.ca) et le poste local servent justement à le retravailler, ils
 * le montrent donc d'office, sans réglage à faire dans le tableau de bord
 * Cloudflare. Seule la production attend l'ordre explicite
 * PUBLIER_ESPACE_CLIENT=1, donné dans .github/workflows/deploy.yml le jour de
 * l'ouverture au public.
 *
 * Conséquence assumée : la préproduction ne montre plus exactement ce que voit
 * le public, elle montre le site avec le portail ouvert. Pour contrôler le
 * rendu public avant une mise en ligne, c'est le build de production qui fait
 * foi (`npm run verifier` sur un build SITE_URL=https://cfrq.ca).
 *
 * Doit rester aligné sur `publierEspaceClient` dans astro.config.mjs, qui
 * décide du routage, et sur scripts/verifier-build.mjs, qui le contrôle.
 */
const SITE_URL_COURANT = process.env.SITE_URL || SITE_PRODUCTION;
export const PUBLIER_ESPACE_CLIENT = estProduction(SITE_URL_COURANT)
  ? process.env.PUBLIER_ESPACE_CLIENT === "1"
  : true;
