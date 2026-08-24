// Contrôle du site RÉELLEMENT EN LIGNE, à lancer après la bascule DNS.
//
// Le script verifier-build.mjs contrôle le dossier `dist` avant publication.
// Celui-ci contrôle ce que voit un visiteur : redirections effectives, codes
// HTTP, certificat, sitemap servi, portail client bien fermé.
//
// Usage : node scripts/verifier-en-ligne.mjs [https://cfrq.ca]

import { redirectionsHeritees } from '../src/data/redirections-heritees.mjs';

const BASE = (process.argv[2] || 'https://cfrq.ca').replace(/\/$/, '');

const erreurs = [];
const echec = (m) => erreurs.push(m);

/** Suit les redirections HTTP *et* les redirections par méta-refresh. */
async function resoudre(chemin, sauts = 0) {
  if (sauts > 5) return { code: 'BOUCLE', final: chemin, corps: '' };
  const r = await fetch(BASE + chemin, { redirect: 'manual' });
  if (r.status >= 300 && r.status < 400) {
    const cible = new URL(r.headers.get('location'), BASE + chemin);
    return resoudre(cible.pathname + cible.search, sauts + 1);
  }
  const corps = await r.text();
  const meta = corps.match(/http-equiv=["']?refresh["']?\s+content=["'][^;]*;\s*url=([^"']+)/i);
  if (r.status === 200 && meta) {
    const cible = new URL(meta[1], BASE + chemin);
    return resoudre(cible.pathname + cible.search, sauts + 1);
  }
  return { code: r.status, final: chemin, corps, entetes: r.headers };
}

const ligne = (marque, code, chemin, note = '') =>
  console.log(`  ${marque}  ${String(code).padEnd(4)} ${chemin.padEnd(52)} ${note}`);

// --- 1. Les URL de l'ancien site doivent aboutir sur une vraie page ---------

// Les URL conservées à l'identique, plus toutes les redirections déclarées dans
// src/data/redirections-heritees.mjs, pour que les deux ne puissent pas diverger.
const HERITEES = {
  '/': '/',
  '/a-propos-de-nous/': '/a-propos-de-nous/',
  '/amenagement/': '/amenagement/',
  '/arboriculture-et-foresterie-urbaine/': '/arboriculture-et-foresterie-urbaine/',
  '/demande-des-plants-non-subventionnes/': '/demande-des-plants-non-subventionnes/',
  '/erabliere/': '/erabliere/',
  '/evaluation-forestiere/': '/evaluation-forestiere/',
  '/operation-forestieres/': '/operation-forestieres/',
  '/politique-de-confidentialite-et-sur-les-cookies/': '/politique-de-confidentialite-et-sur-les-cookies/',
  '/termes-et-conditions/': '/termes-et-conditions/',
  '/territoire-desservi/': '/territoire-desservi/',
  ...redirectionsHeritees('/'),
};

// URL de l'ancien site volontairement abandonnées : elles DOIVENT répondre 404,
// et servir la page 404 du site (pas celle de GitHub).
const ABANDONNEES = ['/assistant-reg-for/', '/login'];

console.log(`\n=== URL DE L'ANCIEN SITE (${Object.keys(HERITEES).length}) ===`);
for (const [depart, attendu] of Object.entries(HERITEES)) {
  const r = await resoudre(depart);
  if (r.code !== 200) {
    echec(`${depart} répond ${r.code} (attendu 200 sur ${attendu}).`);
    ligne('XX', r.code, depart, 'ÉCHEC');
  } else if (r.final !== attendu) {
    echec(`${depart} aboutit sur ${r.final} au lieu de ${attendu}.`);
    ligne('XX', r.code, depart, `→ ${r.final}, attendu ${attendu}`);
  } else {
    ligne('ok', r.code, depart, depart === attendu ? '' : `→ ${r.final}`);
  }
}

console.log(`\n=== URL ABANDONNÉES VOLONTAIREMENT (doivent répondre 404) ===`);
for (const c of ABANDONNEES) {
  const r = await fetch(BASE + c, { redirect: 'manual' });
  if (r.status !== 404) {
    echec(`${c} répond ${r.status} : cette URL devait être abandonnée en 404.`);
    ligne('XX', r.status, c, 'ÉCHEC');
  } else ligne('ok', r.status, c, 'abandonnée, conforme');
}

// --- 2. Variantes sans slash final -----------------------------------------
// L'ancien site répondait 301 vers la version avec slash. GitHub Pages fait de
// même : ce contrôle vérifie que le comportement est bien conservé.

// `astro preview` ne fait pas cette redirection de répertoire, contrairement à
// GitHub Pages : sur un serveur local le contrôle est signalé, pas bloquant.
const enLigne = BASE.startsWith('https://');
console.log(`\n=== URL SANS SLASH FINAL (doivent rediriger, pas tomber en 404) ===`);
for (const c of ['/services', '/amenagement', '/notre-equipe', '/contact', '/erabliere']) {
  const r = await resoudre(c);
  if (r.code !== 200) {
    if (enLigne) echec(`${c} répond ${r.code} : la variante sans slash final ne redirige pas.`);
    ligne(enLigne ? 'XX' : '~~', r.code, c, enLigne ? 'ÉCHEC' : 'normal sur astro preview, à revérifier en ligne');
  } else ligne('ok', r.code, c, `→ ${r.final}`);
}

// --- 3. L'espace client : la vitrine en ligne, le portail fermé ------------
// /espace-client/ doit répondre : c'est la page qui explique l'espace client et
// annonce qu'il est en construction, celle où mène le bouton du menu. Le
// tableau de bord, lui, ne doit pas être joignable.

console.log('\n=== ESPACE CLIENT ===');
const vitrine = await fetch(BASE + '/espace-client/', { redirect: 'manual' });
const vitrineTexte = vitrine.status === 200 ? await vitrine.text() : '';
if (vitrine.status !== 200) {
  echec(`/espace-client/ répond ${vitrine.status} : le bouton « Espace client » du menu tombe dans le vide.`);
  ligne('XX', vitrine.status, '/espace-client/', 'MANQUANTE');
} else if (!/En construction/i.test(vitrineTexte)) {
  echec("/espace-client/ ne dit plus que l'espace client est en construction : le portail est-il ouvert par erreur ?");
  ligne('XX', vitrine.status, '/espace-client/', 'CONTENU INATTENDU');
} else {
  ligne('ok', vitrine.status, '/espace-client/', 'page « en construction », conforme');
}

for (const c of ['/espace-client/tableau-de-bord/']) {
  const r = await fetch(BASE + c, { redirect: 'manual' });
  if (r.status === 200) {
    echec(`${c} est accessible en ligne alors qu'il ne doit pas être publié.`);
    ligne('XX', r.status, c, 'PUBLIÉ PAR ERREUR');
  } else ligne('ok', r.status, c, 'inaccessible, conforme');
}

// --- 4. Fichiers de référencement ------------------------------------------

console.log('\n=== RÉFÉRENCEMENT ===');
const robots = await fetch(BASE + '/robots.txt');
const robotsTexte = robots.ok ? await robots.text() : '';
if (!robots.ok) echec(`robots.txt répond ${robots.status}.`);
else if (!robotsTexte.includes('sitemap-index.xml')) echec("robots.txt n'annonce pas le sitemap.");
ligne(robots.ok ? 'ok' : 'XX', robots.status, '/robots.txt');

const smi = await fetch(BASE + '/sitemap-index.xml');
const smiTexte = smi.ok ? await smi.text() : '';
if (!smi.ok) echec(`sitemap-index.xml répond ${smi.status}.`);
ligne(smi.ok ? 'ok' : 'XX', smi.status, '/sitemap-index.xml');

// Le sitemap contient toujours les URL absolues de production. Quand on lance
// le script sur un serveur local, on les rejoue sur ce serveur plutôt que
// d'aller interroger le vrai cfrq.ca.
const surBase = (u) => BASE + new URL(u).pathname;

let urlsSitemap = [];
for (const enfant of [...smiTexte.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
  const r = await fetch(surBase(enfant));
  if (!r.ok) {
    echec(`${enfant} répond ${r.status}.`);
    continue;
  }
  const xml = await r.text();
  urlsSitemap.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
}
console.log(`  ok       ${String(urlsSitemap.length).padEnd(3)} URL annoncées par le sitemap`);
if (urlsSitemap.length === 0) echec("Le sitemap n'annonce aucune URL.");

// Toutes les URL annoncées doivent répondre 200 sans redirection.
for (const u of urlsSitemap) {
  if (!u.startsWith('https://cfrq.ca')) {
    echec(`Le sitemap annonce ${u}, hors du domaine https://cfrq.ca.`);
    continue;
  }
  const r = await fetch(surBase(u), { redirect: 'manual' });
  if (r.status !== 200) echec(`Le sitemap annonce ${u}, qui répond ${r.status}.`);
}

// --- 5. Page 404 -----------------------------------------------------------

console.log('\n=== PAGE 404 ===');
const perdue = await fetch(BASE + '/cette-page-nexiste-pas-du-tout/');
const corps404 = await perdue.text();
if (perdue.status !== 404) echec(`Une URL inconnue répond ${perdue.status} au lieu de 404.`);
if (!corps404.includes("Cette page n'existe plus")) {
  echec("La page 404 servie n'est pas celle du site (page générique de GitHub ?).");
}
ligne(perdue.status === 404 ? 'ok' : 'XX', perdue.status, '/cette-page-nexiste-pas-du-tout/',
  corps404.includes("Cette page n'existe plus") ? 'page 404 CFRQ' : 'page 404 étrangère');

// --- 6. HTTPS et domaine canonique -----------------------------------------

// Sans objet quand on pointe le script sur un serveur local.
const variantesDomaine = BASE === 'https://cfrq.ca' ? ['http://cfrq.ca/', 'https://www.cfrq.ca/'] : [];
if (variantesDomaine.length) console.log('\n=== HTTPS ET DOMAINE ===');
for (const u of variantesDomaine) {
  try {
    const r = await fetch(u, { redirect: 'follow' });
    const versApex = new URL(r.url).origin === 'https://cfrq.ca';
    if (!versApex) echec(`${u} aboutit sur ${r.url} au lieu de https://cfrq.ca/.`);
    ligne(versApex ? 'ok' : 'XX', r.status, u, `→ ${r.url}`);
  } catch (e) {
    echec(`${u} inaccessible : ${e.message}`);
    ligne('XX', 'ERR', u, e.message.slice(0, 50));
  }
}

// --- Verdict ---------------------------------------------------------------

if (erreurs.length) {
  console.error(`\nÉCHEC, ${erreurs.length} problème(s) :`);
  for (const e of erreurs) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('\nSite en ligne conforme : aucune URL perdue, aucun problème détecté.');
