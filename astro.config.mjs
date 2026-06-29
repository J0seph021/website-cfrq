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
  trailingSlash: 'ignore',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
