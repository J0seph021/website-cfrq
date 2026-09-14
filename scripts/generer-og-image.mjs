// Génère public/og-cfrq.jpg, l'image d'aperçu partagée sur Facebook, LinkedIn,
// Messenger, Teams, iMessage et Slack (balise `og:image` posée par Base.astro).
//
// Pourquoi un script plutôt qu'un fichier déposé à la main : l'image doit
// rester régénérable quand la photo ou le logo changent, et rester exactement
// à 1200 x 630 px, le format que tous les réseaux recadrent sans rogner.
//
// Aucun texte n'est incrusté, volontairement : les réseaux affichent déjà le
// titre et la description à côté de l'image, et un texte gravé se retrouve
// illisible sur les vignettes de fil d'actualité. La photo et le logo suffisent
// à identifier CFRQ.
//
// Usage : node scripts/generer-og-image.mjs

import sharp from 'sharp';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const racine = new URL('../', import.meta.url);
const chemin = (p) => fileURLToPath(new URL(p, racine));

const LARGEUR = 1200;
const HAUTEUR = 630;

// Voile sombre concentré dans le bas de l'image : la photo reste lisible,
// et le logo se détache sans que toute la vignette vire au vert.
const voile = Buffer.from(`<svg width="${LARGEUR}" height="${HAUTEUR}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bas" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#0d2410" stop-opacity="0.92"/>
      <stop offset="28%" stop-color="#14331a" stop-opacity="0.62"/>
      <stop offset="62%" stop-color="#14331a" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#14331a" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gauche" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0d2410" stop-opacity="0.34"/>
      <stop offset="55%" stop-color="#0d2410" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${LARGEUR}" height="${HAUTEUR}" fill="url(#gauche)"/>
  <rect width="${LARGEUR}" height="${HAUTEUR}" fill="url(#bas)"/>
  <rect x="0" y="${HAUTEUR - 12}" width="${LARGEUR}" height="12" fill="#5abd2a"/>
</svg>`);

const logo = await sharp(chemin('public/signature/logo-cfrq-sombre.png'))
  .resize({ width: 420 })
  .toBuffer();

await sharp(chemin('src/assets/photos/boise-sentier.jpg'))
  .resize(LARGEUR, HAUTEUR, { fit: 'cover', position: 'attention' })
  .composite([
    { input: voile, top: 0, left: 0 },
    { input: logo, left: 72, top: HAUTEUR - 147 - 84 },
  ])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(chemin('public/og-cfrq.jpg'));

const { size } = statSync(chemin('public/og-cfrq.jpg'));
console.log(`public/og-cfrq.jpg écrit : ${LARGEUR}x${HAUTEUR}, ${(size / 1024).toFixed(0)} ko`);
