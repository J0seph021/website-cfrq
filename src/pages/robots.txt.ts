// robots.txt généré au build, et non un fichier fixe dans public/.
//
// La raison : la préproduction (preview.cfrq.ca) sert exactement le même
// contenu que cfrq.ca. Un fichier fixe autoriserait l'indexation des deux, et
// Google, voyant deux copies, pourrait classer la préproduction à la place du
// vrai site. Ici, seule la production invite les moteurs ; toute autre adresse
// leur ferme la porte.
import type { APIRoute } from "astro";
import { SITE_PRODUCTION, estProduction } from "../data/flags";

export const GET: APIRoute = ({ site }) => {
  const origine = (site ?? new URL(SITE_PRODUCTION)).origin;

  const corps = estProduction(origine)
    ? `# cfrq.ca, site statique Astro publié par GitHub Pages.
User-agent: *
Allow: /

Sitemap: ${SITE_PRODUCTION}/sitemap-index.xml
`
    : `# Préproduction (${origine}) : copie du site de production.
# Ne doit JAMAIS être indexée, sous peine de contenu dupliqué avec cfrq.ca.
User-agent: *
Disallow: /
`;

  return new Response(corps, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
