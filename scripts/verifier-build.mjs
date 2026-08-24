// Contrôle du dossier `dist` avant publication.
//
// Ce script est le garde-fou de la mise en ligne : il échoue (code 1) si une
// URL de l'ancien site WordPress tombe en 404, si un lien interne est cassé, si
// le portail client se retrouve publié par accident, ou s'il manque une balise
// indispensable au référencement. Il tourne dans la CI (voir deploy.yml) juste
// avant l'envoi vers GitHub Pages.
//
// Usage : node scripts/verifier-build.mjs [dossier=dist]

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, posix } from 'node:path';
import { FICHES_PRIVATE_PAGE } from '../src/data/redirections-heritees.mjs';

const DIST = process.argv[2] || 'dist';
const PUBLIER_ESPACE_CLIENT = process.env.PUBLIER_ESPACE_CLIENT === '1';
const SITE_URL = process.env.SITE_URL || 'https://cfrq.ca';
// Un build de preproduction (preview.cfrq.ca) doit etre integralement en
// noindex : les controles d'indexation s'inversent donc selon la cible.
const EST_PRODUCTION = SITE_URL === 'https://cfrq.ca';

const erreurs = [];
const avertissements = [];
const echec = (m) => erreurs.push(m);
const alerte = (m) => avertissements.push(m);

if (!existsSync(DIST)) {
  console.error(`Dossier « ${DIST} » introuvable : lancer « npm run build » d'abord.`);
  process.exit(1);
}

// --- Inventaire du build ----------------------------------------------------

function parcourir(dossier, acc = []) {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) parcourir(chemin, acc);
    else acc.push(chemin);
  }
  return acc;
}

const versUrl = (f) => '/' + f.split('\\').join('/').slice(DIST.length + 1);

const fichiers = parcourir(DIST);
const pagesHtml = fichiers.filter((f) => f.endsWith('.html'));
const ressources = new Set(fichiers.map(versUrl));
const pages = new Map(pagesHtml.map((f) => [versUrl(f).replace(/index\.html$/, ''), readFileSync(f, 'utf8')]));

const existe = (url) => pages.has(url) || pages.has(url + '/') || ressources.has(url);

// --- 1. Les URL de l'ancien site doivent toutes répondre --------------------
// Chaque entrée est une URL publiée par le sitemap WordPress de cfrq.ca.
// « page » : la même URL existe sur le nouveau site.
// « redirection » : l'URL n'existe plus, mais une redirection prend le relais.

const URLS_HERITEES = [
  ['/', 'page'],
  ['/a-propos-de-nous/', 'page'],
  ['/amenagement/', 'page'],
  ['/arboriculture-et-foresterie-urbaine/', 'page'],
  ['/demande-des-plants-non-subventionnes/', 'page'],
  ['/erabliere/', 'page'],
  ['/evaluation-forestiere/', 'page'],
  ['/operation-forestieres/', 'page'],
  ['/politique-de-confidentialite-et-sur-les-cookies/', 'page'],
  ['/termes-et-conditions/', 'page'],
  ['/territoire-desservi/', 'page'],
  ['/service-aux-entrepreneurs-en-travaux-sylvicoles/', 'redirection'],
  ...FICHES_PRIVATE_PAGE.map((slug) => [`/private-page/${slug}/`, 'redirection']),
];

for (const [url, genre] of URLS_HERITEES) {
  const html = pages.get(url);
  if (!html) {
    echec(`URL de l'ancien site absente du build (elle tomberait en 404) : ${url}`);
    continue;
  }
  const estRedirection = /http-equiv=["']?refresh/i.test(html);
  if (genre === 'redirection' && !estRedirection) {
    echec(`${url} devrait être une redirection, or la page est servie telle quelle.`);
  }
  if (genre === 'page' && estRedirection) {
    echec(`${url} devrait être une vraie page, or c'est une redirection.`);
  }
}

// --- 2. Aucun lien ni aucune ressource interne cassés ----------------------

for (const [url, html] of pages) {
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const brut = m[1];
    if (/^(https?:|mailto:|tel:|javascript:|data:|#)/i.test(brut)) continue;
    const propre = brut.split('#')[0].split('?')[0];
    if (!propre) continue;
    const absolu = propre.startsWith('/') ? propre : posix.normalize(posix.join(url, propre));
    if (!existe(absolu)) echec(`Lien interne cassé : ${url} pointe vers ${brut}`);
  }
}

// --- 3. L'espace client : la vitrine oui, le portail non -------------------
// Tant que PUBLIER_ESPACE_CLIENT ne vaut pas 1, /espace-client/ doit exister
// mais servir uniquement la page « en construction » : ni page de connexion,
// ni tableau de bord, ni lien vers eux.

const pagesEspace = [...pages.keys()].filter((u) => u.startsWith('/espace-client'));
if (!PUBLIER_ESPACE_CLIENT) {
  const vitrine = pages.get('/espace-client/');
  if (!vitrine) {
    echec("/espace-client/ est absente du build : le bouton « Espace client » du menu tomberait en 404.");
  } else if (!/En construction/i.test(vitrine)) {
    echec("/espace-client/ ne dit plus que l'espace client est en construction : le portail a-t-il pris sa place ?");
  }
  for (const u of pagesEspace.filter((u) => u !== '/espace-client/')) {
    echec(`Le portail n'est pas censé être publié, or ${u} est dans le build.`);
  }
  for (const [url, html] of pages) {
    if (/href="[^"]*\/espace-client\/tableau-de-bord/.test(html)) {
      echec(`${url} contient un lien vers le tableau de bord, qui n'est pas publié.`);
    }
  }
} else {
  for (const u of ['/espace-client/', '/espace-client/tableau-de-bord/']) {
    if (!pages.has(u)) echec(`PUBLIER_ESPACE_CLIENT=1 mais ${u} n'a pas été construite.`);
  }
}

// --- 4. Fichiers indispensables à la mise en ligne -------------------------

for (const f of ['/CNAME', '/robots.txt', '/sitemap-index.xml', '/.nojekyll', '/404.html']) {
  if (!ressources.has(f)) echec(`Fichier manquant dans le build : ${f}`);
}

// GitHub Pages ne sert la page d'erreur que si elle est à la racine sous ce nom
// exact. Avec trailingSlash 'always', un /404/index.html ne serait jamais servi.
if (pages.has('/404/')) echec('La page 404 a été générée dans /404/ au lieu de /404.html.');

if (ressources.has('/CNAME')) {
  const domaine = readFileSync(join(DIST, 'CNAME'), 'utf8').trim();
  if (domaine !== 'cfrq.ca') echec(`CNAME devrait contenir « cfrq.ca », il contient « ${domaine} ».`);
}

// --- 4b. Les pages légales doivent porter leur contenu ---------------------
// Elles allaient autrefois chercher leur texte sur l'API WordPress de cfrq.ca :
// une fois l'ancien site éteint, elles se vidaient sans prévenir. Le contenu est
// désormais figé dans src/contenu-legal/, ce contrôle empêche la régression.

for (const [url, minimum] of [
  ['/termes-et-conditions/', 3000],
  ['/politique-de-confidentialite-et-sur-les-cookies/', 3000],
]) {
  const html = pages.get(url);
  if (!html) {
    echec(`Page légale absente du build : ${url}`);
    continue;
  }
  const texte = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ');
  if (texte.length < minimum) {
    echec(`${url} ne contient que ${texte.length} caractères de texte : le contenu légal a disparu.`);
  }
  if (/en cours de r[ée]vision/i.test(html)) {
    echec(`${url} affiche le texte de repli « en cours de révision » au lieu du vrai contenu.`);
  }
}

// --- 5. Le sitemap ne liste que des pages réelles et indexables -------------

if (ressources.has('/sitemap-index.xml')) {
  const index = readFileSync(join(DIST, 'sitemap-index.xml'), 'utf8');
  const enfants = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const listees = [];
  for (const enfant of enfants) {
    const nom = enfant.split('/').pop();
    if (!ressources.has('/' + nom)) {
      echec(`Le sitemap-index référence ${nom}, absent du build.`);
      continue;
    }
    const xml = readFileSync(join(DIST, nom), 'utf8');
    listees.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  }

  if (listees.length === 0) echec('Le sitemap ne contient aucune URL.');

  for (const loc of listees) {
    const chemin = new URL(loc).pathname;
    const html = pages.get(chemin);
    if (!html) {
      echec(`Le sitemap annonce ${loc}, or cette page n'existe pas dans le build.`);
      continue;
    }
    if (EST_PRODUCTION && /name=["']robots["'][^>]*noindex/i.test(html)) {
      echec(`Le sitemap annonce ${loc}, or la page est en noindex.`);
    }
    if (/http-equiv=["']?refresh/i.test(html)) {
      echec(`Le sitemap annonce ${loc}, or c'est une redirection.`);
    }
  }
}

// --- 6. Balises SEO sur chaque vraie page ----------------------------------

const canoniquesVues = new Map();

for (const [url, html] of pages) {
  if (/http-equiv=["']?refresh/i.test(html)) continue; // redirections : hors sujet
  const titre = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
  const desc = html.match(/<meta name="description" content="([^"]*)"/i)?.[1]?.trim();
  const canon = html.match(/<link rel="canonical" href="([^"]*)"/i)?.[1]?.trim();

  if (!titre) echec(`Titre <title> manquant : ${url}`);
  if (!desc) echec(`Meta description manquante : ${url}`);
  if (!canon) {
    echec(`Balise canonical manquante : ${url}`);
  } else {
    if (!canon.startsWith(SITE_URL)) {
      echec(`Canonical hors domaine sur ${url} : ${canon} (attendu sous ${SITE_URL})`);
    }
    const dejaVue = canoniquesVues.get(canon);
    if (dejaVue) echec(`Canonical en double : ${url} et ${dejaVue} déclarent tous deux ${canon}`);
    else canoniquesVues.set(canon, url);
  }
  if (titre && titre.length > 65) alerte(`Titre un peu long (${titre.length} car.) sur ${url} : « ${titre} »`);
  if (desc && (desc.length < 70 || desc.length > 165)) {
    alerte(`Meta description de ${desc.length} caractères sur ${url} (viser 70 à 165).`);
  }
}

// --- 7. Mesure d'audience et consentement (Loi 25) -------------------------
// Uniquement sur un build de production : en développement et sur l'aperçu
// GitHub Pages, rien n'est chargé, donc il n'y a rien à contrôler.

// L'identifiant de mesure est lu dans la source : vide = aucune mesure attendue.
const ID_MESURE =
  readFileSync('src/data/flags.ts', 'utf8').match(/ID_MESURE\s*=\s*["']([^"']*)["']/)?.[1] ?? '';

if (EST_PRODUCTION && ID_MESURE === '') {
  // Mesure coupée : il ne doit rester aucune balise, et donc aucun bandeau de
  // consentement, puisqu'il n'y a plus rien à consentir.
  for (const [url, html] of pages) {
    if (/googletagmanager\.com|GTM-[A-Z0-9]+|gtag\/js/i.test(html)) {
      echec(`${url} charge encore une balise de mesure alors que ID_MESURE est vide.`);
    }
    if (html.includes('banniere-temoins')) {
      echec(`${url} affiche le bandeau de consentement alors qu'aucune mesure n'est chargée.`);
    }
  }
}

if (EST_PRODUCTION && ID_MESURE !== '') {
  for (const [url, html] of pages) {
    if (/http-equiv=["']?refresh/i.test(html)) continue; // redirections : pas de mesure

    if (!html.includes(ID_MESURE)) {
      echec(`Balise de mesure ${ID_MESURE} absente de ${url}.`);
      continue;
    }
    if (!html.includes('banniere-temoins')) {
      echec(`Bandeau de consentement absent de ${url}, alors que la mesure y est chargée.`);
    }

    // Loi 25 : l'état « refusé par défaut » doit être poussé AVANT le script de
    // mesure, sinon un témoin peut être déposé avant que la personne ait choisi.
    // Vaut pour GTM (gtm.js) comme pour GA4 en direct (gtag/js).
    const iDefaut = html.search(/["']consent["'],\s*["']default["']/);
    const iBalise = html.search(/googletagmanager\.com\/(gtm\.js|gtag\/js)/);
    if (iDefaut === -1) {
      echec(`${url} charge la mesure sans état de consentement par défaut.`);
    } else if (iBalise !== -1 && iDefaut > iBalise) {
      echec(`${url} pousse le consentement par défaut APRÈS le script de mesure.`);
    }
    if (!/analytics_storage:\s*["']denied["']/.test(html)) {
      echec(`${url} ne refuse pas analytics_storage par défaut.`);
    }
  }
}

// --- 8. Étanchéité de la préproduction -------------------------------------
// Une copie du site qui se fait indexer est pire que pas de préproduction du
// tout : Google y verrait du contenu dupliqué et pourrait classer la copie à la
// place de cfrq.ca. Hors production, tout doit être fermé aux moteurs.

const robotsTexte = ressources.has('/robots.txt')
  ? readFileSync(join(DIST, 'robots.txt'), 'utf8')
  : '';

if (EST_PRODUCTION) {
  if (!/^\s*Allow:\s*\/\s*$/m.test(robotsTexte)) {
    echec("robots.txt de production : la directive « Allow: / » est absente.");
  }
  if (/^\s*Disallow:\s*\/\s*$/m.test(robotsTexte)) {
    echec("robots.txt de production interdit tout le site (« Disallow: / »).");
  }
  if (!robotsTexte.includes('sitemap-index.xml')) {
    echec("robots.txt de production n'annonce pas le sitemap.");
  }
  // La production ne doit jamais porter l'en-tête noindex de la préproduction.
  if (ressources.has('/_headers') && /noindex/i.test(readFileSync(join(DIST, '_headers'), 'utf8'))) {
    echec('Le build de production contient un `_headers` avec noindex : il se retirerait de Google.');
  }
} else {
  if (!/^\s*Disallow:\s*\/\s*$/m.test(robotsTexte)) {
    echec(`robots.txt hors production (${SITE_URL}) doit contenir « Disallow: / », sinon la préproduction s'indexe.`);
  }

  // Verrou principal de la préproduction. Le `robots.txt` ne suffit pas : le
  // « Robots.txt géré » de Cloudflare y injecte un « Allow: / » qui gagne sur
  // notre « Disallow: / ». Un en-tête HTTP est insensible à cette réécriture.
  if (!ressources.has('/_headers')) {
    echec("Fichier `_headers` manquant : la préproduction n'a pas d'en-tête X-Robots-Tag.");
  } else {
    const entetes = readFileSync(join(DIST, '_headers'), 'utf8');
    if (!/X-Robots-Tag:\s*noindex/i.test(entetes)) {
      echec('`_headers` ne pose pas « X-Robots-Tag: noindex » sur la préproduction.');
    }
    if (!/^\/\*\s*$/m.test(entetes)) {
      echec("`_headers` ne cible pas tout le site (motif « /* » attendu).");
    }
  }
  for (const [url, html] of pages) {
    if (/http-equiv=["']?refresh/i.test(html)) continue; // redirections : déjà noindex
    if (!/name=["']robots["'][^>]*noindex/i.test(html)) {
      echec(`${url} n'est pas en noindex alors que le build cible ${SITE_URL}.`);
    }
  }
  if (pages.size && [...pages.values()].some((h) => h.includes('GTM-PW8SP69'))) {
    echec(`Google Tag Manager est chargé sur un build hors production (${SITE_URL}).`);
  }
}

// --- Verdict ---------------------------------------------------------------

const vraiesPages = [...pages.keys()].filter((u) => !/http-equiv=["']?refresh/i.test(pages.get(u)));
console.log(`Build vérifié : ${vraiesPages.length} pages, ${pages.size - vraiesPages.length} redirections, ${fichiers.length} fichiers.`);

if (avertissements.length) {
  console.log(`\nAvertissements (${avertissements.length}) :`);
  for (const a of avertissements) console.log('  · ' + a);
}

if (erreurs.length) {
  console.error(`\nÉCHEC, ${erreurs.length} problème(s) bloquant(s) :`);
  for (const e of erreurs) console.error('  ✗ ' + e);
  process.exit(1);
}

console.log('\nAucun problème bloquant. Le build est publiable.');
