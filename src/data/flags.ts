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
 * Mesure d'audience (GTM) et bandeau de consentement : production seulement.
 * Ailleurs, rien n'est chargé, donc aucun témoin non essentiel n'est déposé et
 * les statistiques ne sont pas polluées par les essais.
 */
export function analytiqueActive(siteOrigin: string): boolean {
  return import.meta.env.PROD && estProduction(siteOrigin);
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
