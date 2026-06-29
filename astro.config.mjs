// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Déployé en page de projet GitHub Pages pour l'instant :
// https://j0seph021.github.io/website-cfrq
// Quand on bascule sur cfrq.ca : site = 'https://cfrq.ca', base = '/', + CNAME.
export default defineConfig({
  site: 'https://j0seph021.github.io',
  base: '/website-cfrq',
  trailingSlash: 'ignore',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
