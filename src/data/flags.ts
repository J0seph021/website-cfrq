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
 * public : tant que PUBLIER_ESPACE_CLIENT ne vaut pas "1", la connexion et le
 * tableau de bord ne sont pas routés, et /espace-client sert à la place une
 * page qui explique l'espace client et annonce qu'il est en construction.
 *
 * Le bouton « Espace client » du menu et du pied de page, lui, reste toujours
 * visible : il mène à cette page-là avant l'ouverture, à la connexion après.
 * Ce drapeau ne masque donc plus que les sections des pages Accueil et
 * Services qui invitent à « accéder » au portail.
 *
 * Pour le retravailler en local :  PUBLIER_ESPACE_CLIENT=1 npm run dev
 * Pour le voir en préproduction : mettre la variable à "1" dans les variables
 * d'environnement du projet Cloudflare Pages.
 * Pour l'ouvrir au public : la mettre à "1" dans .github/workflows/deploy.yml.
 */
export const PUBLIER_ESPACE_CLIENT = process.env.PUBLIER_ESPACE_CLIENT === "1";
