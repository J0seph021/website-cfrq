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
 * Coupé le 2026-08-18 : le conteneur `GTM-PW8SP69` repris de l'ancien site
 * alimente la propriété GA4 `G-6JE2CNCNNM`, qui appartient à un tiers non
 * identifié. CFRQ n'en recevait donc aucune donnée, et le bandeau promettait
 * aux visiteurs une mesure « par CFRQ » qui partait ailleurs. À remplacer par
 * l'identifiant `G-XXXXXXXXXX` de la propriété GA4 de CFRQ.
 */
export const ID_MESURE = "";

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
 * public : ses pages ne sont pas routées et ses liens disparaissent du menu et
 * du pied de page tant que PUBLIER_ESPACE_CLIENT ne vaut pas "1".
 *
 * Pour le retravailler en local :  PUBLIER_ESPACE_CLIENT=1 npm run dev
 * Pour le voir en préproduction : mettre la variable à "1" dans les variables
 * d'environnement du projet Cloudflare Pages.
 * Pour l'ouvrir au public : la mettre à "1" dans .github/workflows/deploy.yml.
 */
export const PUBLIER_ESPACE_CLIENT = process.env.PUBLIER_ESPACE_CLIENT === "1";
