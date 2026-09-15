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
//
// Les opacités sont réglées pour la plus petite taille d'affichage, pas pour
// l'image à 100 %. LinkedIn rend la carte autour de 470 px de large, soit 40 %
// de la taille réelle : à cette échelle la photo devient une texture, et un
// logo à empattements fins posé sur du feuillage chargé se brouille. D'où un
// bas nettement plus sombre qu'il n'en a l'air à pleine taille.
const voile = Buffer.from(`<svg width="${LARGEUR}" height="${HAUTEUR}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bas" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#0d2410" stop-opacity="0.96"/>
      <stop offset="34%" stop-color="#14331a" stop-opacity="0.78"/>
      <stop offset="66%" stop-color="#14331a" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="#14331a" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gauche" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0d2410" stop-opacity="0.55"/>
      <stop offset="62%" stop-color="#0d2410" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${LARGEUR}" height="${HAUTEUR}" fill="url(#gauche)"/>
  <rect width="${LARGEUR}" height="${HAUTEUR}" fill="url(#bas)"/>
  <rect x="0" y="${HAUTEUR - 12}" width="${LARGEUR}" height="12" fill="#5abd2a"/>
</svg>`);

// Le logo occupe 45 % de la largeur plutôt que 35 % : c'est le seul élément
// que la vignette doit rendre lisible à coup sûr, même réduite à 470 px.
const LOGO_LARGEUR = 540;
const LOGO_MARGE = 76;

const logo = await sharp(chemin('public/signature/logo-cfrq-sombre.png'))
  .resize({ width: LOGO_LARGEUR })
  .toBuffer();
const { height: logoHauteur } = await sharp(logo).metadata();

// Qualité 92 : l'image n'est téléchargée qu'une fois par chaque réseau, jamais
// par les visiteurs du site, donc son poids n'a aucun effet sur la vitesse.
// Rien ne justifie de la comprimer, et le feuillage marque vite.
await sharp(chemin('src/assets/photos/boise-sentier.jpg'))
  .resize(LARGEUR, HAUTEUR, { fit: 'cover', position: 'attention' })
  .composite([
    { input: voile, top: 0, left: 0 },
    { input: logo, left: LOGO_MARGE, top: HAUTEUR - logoHauteur - LOGO_MARGE },
  ])
  .jpeg({ quality: 92, mozjpeg: true })
  .toFile(chemin('public/og-cfrq.jpg'));

const { size } = statSync(chemin('public/og-cfrq.jpg'));
console.log(`public/og-cfrq.jpg écrit : ${LARGEUR}x${HAUTEUR}, ${(size / 1024).toFixed(0)} ko`);
