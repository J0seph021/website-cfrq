// @ts-check
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

// L'espace client est terminé mais pas encore ouvert au public : ses routes ne
// sont injectées que si PUBLIER_ESPACE_CLIENT=1. Le code reste dans le dépôt
// (src/routes-differees/), il n'est simplement pas publié.
const publierEspaceClient = process.env.PUBLIER_ESPACE_CLIENT === '1';

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
      name: 'cfrq-routes-differees',
      hooks: {
        'astro:config:setup': ({ injectRoute }) => {
          if (!publierEspaceClient) return;
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
