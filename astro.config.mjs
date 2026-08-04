// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Base et site pilotés par variables d'environnement.
// Local + futur domaine cfrq.ca : base '/'.
// Aperçu page de projet GitHub Pages : la CI met SITE_BASE=/website-cfrq.
export default defineConfig({
  site: process.env.SITE_URL || 'https://cfrq.ca',
  base: process.env.SITE_BASE || '/',
  // Slash final systematique pour coller aux URLs WordPress historiques
  // (ex. /amenagement/) et preserver le referencement acquis.
  trailingSlash: 'always',
  // Service retire (2026-08) : on preserve l'ancienne URL WordPress au lieu de la laisser en 404.
  // La destination doit porter la base a la main : Astro ne la prefixe pas aux redirections.
  redirects: {
    '/service-aux-entrepreneurs-en-travaux-sylvicoles/':
      `${(process.env.SITE_BASE || '').replace(/\/$/, '')}/services/`,
  },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
