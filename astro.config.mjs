// @ts-check
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { redirectionsHeritees } from './src/data/redirections-heritees.mjs';

// Base et site pilotés par variables d'environnement.
// Production cfrq.ca : SITE_URL=https://cfrq.ca et base '/'.
// Aperçu page de projet GitHub Pages : SITE_BASE=/website-cfrq.
const SITE_URL = process.env.SITE_URL || 'https://cfrq.ca';
const SITE_BASE = process.env.SITE_BASE || '/';

// Seule cfrq.ca est de la production. Doit rester aligné sur estProduction()
// dans src/data/flags.ts.
const estProduction = SITE_URL === 'https://cfrq.ca';

// L'espace client est terminé mais pas encore ouvert au public. `/espace-client`
// existe quand même, dans les deux cas : quand le portail est publié l'adresse
// sert la vraie page de connexion (et le tableau de bord s'ajoute), sinon elle
// sert la page qui explique ce que sera l'espace client et dit qu'il est en
// construction. Le code du portail reste dans le dépôt (src/routes-differees/),
// il n'est simplement pas publié.
//
// La règle : ouvert partout SAUF sur cfrq.ca. La préproduction et le poste
// local servent à retravailler le portail, ils le montrent donc d'office ;
// seule la production attend l'ordre explicite PUBLIER_ESPACE_CLIENT=1, donné
// dans .github/workflows/deploy.yml le jour de l'ouverture au public.
// Doit rester aligné sur PUBLIER_ESPACE_CLIENT dans src/data/flags.ts.
const publierEspaceClient = estProduction ? process.env.PUBLIER_ESPACE_CLIENT === '1' : true;

/** Pages volontairement absentes du sitemap : redirections et pages noindex. */
const horsSitemap = [/\/private-page\//, /\/service-aux-entrepreneurs-en-travaux-sylvicoles\//, /\/espace-client/];

export default defineConfig({
  site: SITE_URL,
  base: SITE_BASE,
  // Slash final systematique pour coller aux URLs WordPress historiques
  // (ex. /amenagement/) et preserver le referencement acquis.
  trailingSlash: 'always',
  // Toutes les URL de l'ancien site WordPress qui n'existent plus telles quelles.
  redirects: redirectionsHeritees(SITE_BASE),
  integrations: [
    react(),
    sitemap({
      filter: (page) => !horsSitemap.some((motif) => motif.test(page)),
    }),
    {
      // Hors production, poser un en-tête HTTP `X-Robots-Tag: noindex` sur tout
      // le site, via le fichier `_headers` que lit Cloudflare Pages.
      //
      // Pourquoi un en-tête en plus du `noindex` en balise meta : Cloudflare
      // réécrit le `robots.txt` de la zone (option « Robots.txt géré » d'AI
      // Crawl Control) et y injecte un `User-agent: * / Allow: /` AVANT le
      // nôtre. À longueur de chemin égale, le moins restrictif gagne, donc
      // notre `Disallow: /` de préproduction se fait neutraliser. Un en-tête
      // HTTP, lui, ne peut pas être contredit par un robots.txt, et il couvre
      // aussi les fichiers non HTML (PDF, XML).
      //
      // GitHub Pages ignore `_headers`, mais le fichier n'est de toute façon
      // écrit que hors production : la production ne peut pas se noindexer par
      // accident, même si elle déménageait un jour chez Cloudflare Pages.
      name: 'cfrq-entetes-preprod',
      hooks: {
        'astro:build:done': ({ dir, logger }) => {
          if (estProduction) return;
          const chemin = fileURLToPath(new URL('_headers', dir));
          writeFileSync(chemin, `# Préproduction (${SITE_URL}) : jamais d'indexation.\n/*\n  X-Robots-Tag: noindex\n`, 'utf8');
          logger.info(`_headers écrit : X-Robots-Tag: noindex sur tout ${SITE_URL}`);
        },
      },
    },
    {
      name: 'cfrq-routes-differees',
      hooks: {
        'astro:config:setup': ({ injectRoute }) => {
          if (!publierEspaceClient) {
            // Portail fermé : l'adresse reste vivante, mais elle explique le
            // projet au lieu d'offrir une connexion qui ne mènerait nulle part.
            injectRoute({ pattern: '/espace-client', entrypoint: './src/routes-differees/espace-client/a-venir.astro' });
            return;
          }
          injectRoute({ pattern: '/espace-client', entrypoint: './src/routes-differees/espace-client/index.astro' });
          injectRoute({
            pattern: '/espace-client/tableau-de-bord',
            entrypoint: './src/routes-differees/espace-client/tableau-de-bord.astro',
          });
        },
      },
    },
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
