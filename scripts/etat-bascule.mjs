// Où en est la bascule de cfrq.ca ? À lancer autant de fois qu'on veut.
//
// Répond à trois questions, dans l'ordre où elles se posent :
//   1. GoDaddy pointe-t-il vers la zone Cloudflare de CFRQ ?
//   2. Quel site est réellement servi, l'ancien WordPress ou le nouveau ?
//   3. Le courriel est-il toujours intact ?
//
// Usage : node scripts/etat-bascule.mjs

import { Resolver } from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const ZONE_AGENCE = ['adele.ns.cloudflare.com', 'alexis.ns.cloudflare.com'];
const ZONE_CFRQ = ['anna.ns.cloudflare.com', 'kyle.ns.cloudflare.com'];

// Plusieurs résolveurs publics : s'ils ne disent pas tous la même chose, c'est
// que la propagation est en cours.
const RESOLVEURS = [
  ['Google', '8.8.8.8'],
  ['Cloudflare', '1.1.1.1'],
  ['Quad9', '9.9.9.9'],
  ['OpenDNS', '208.67.222.222'],
];

const ok = (t) => `  ✓  ${t}`;
const attente = (t) => `  ·  ${t}`;
const alerte = (t) => `  ✗  ${t}`;

async function ns(ip) {
  const r = new Resolver({ timeout: 5000, tries: 2 });
  r.setServers([ip]);
  try {
    return (await r.resolveNs('cfrq.ca')).map((n) => n.toLowerCase()).sort();
  } catch {
    return null;
  }
}

function quelleZone(liste) {
  if (!liste) return 'injoignable';
  const set = new Set(liste);
  if (ZONE_CFRQ.every((n) => set.has(n))) return 'cfrq';
  if (ZONE_AGENCE.every((n) => set.has(n))) return 'agence';
  return 'inconnue';
}

// --- 0. Le registre .ca ----------------------------------------------------
// Source de vérité : c'est le registre qui dit quels serveurs de noms font
// autorité. Il distingue « GoDaddy n'a pas encore poussé le changement » de
// « c'est poussé, les résolveurs publics ont encore l'ancienne réponse en
// cache ». Passe par nslookup, faute de requête non récursive dans Node.

async function delegationRegistre() {
  try {
    const { stdout } = await execFileP('nslookup', ['-type=NS', '-norecurse', 'cfrq.ca', 'c.ca-servers.ca'], {
      timeout: 15000,
    });
    const trouves = [...stdout.matchAll(/([a-z0-9-]+\.ns\.cloudflare\.com)/gi)].map((m) => m[1].toLowerCase());
    return trouves.length ? [...new Set(trouves)].sort() : null;
  } catch {
    return null;
  }
}

console.log('\n=== 0. Que dit le registre .ca (source de vérité) ? ===\n');

const registre = await delegationRegistre();
const zoneRegistre = quelleZone(registre);
if (!registre) {
  console.log(attente('Registre injoignable, on se fie aux résolveurs ci-dessous.'));
} else if (zoneRegistre === 'cfrq') {
  console.log(ok(`Le registre pointe vers la zone CFRQ : ${registre.join(', ')}`));
  console.log('     Le changement chez GoDaddy est passé. Reste la propagation dans les caches.');
} else if (zoneRegistre === 'agence') {
  console.log(attente(`Le registre pointe encore vers l'ancien fournisseur : ${registre.join(', ')}`));
  console.log("     Si GoDaddy affiche déjà anna/kyle, c'est qu'il n'a pas encore poussé le");
  console.log('     changement au registre. Compter de quelques minutes à deux heures.');
} else {
  console.log(alerte(`Délégation inattendue au registre : ${registre.join(', ')}`));
}

// --- 1. Délégation ---------------------------------------------------------

console.log('\n=== 1. Vers quelle zone Cloudflare GoDaddy pointe-t-il ? ===\n');

const vues = [];
for (const [nom, ip] of RESOLVEURS) {
  const liste = await ns(ip);
  const zone = quelleZone(liste);
  vues.push(zone);
  const etiquette =
    zone === 'cfrq' ? 'zone CFRQ (anna/kyle)' :
    zone === 'agence' ? 'zone de l’ancien fournisseur (adele/alexis)' :
    zone === 'injoignable' ? 'pas de réponse' : `inattendu : ${liste?.join(', ')}`;
  console.log(`  ${nom.padEnd(12)} ${etiquette}`);
}

const tousCfrq = vues.every((v) => v === 'cfrq');
const tousAgence = vues.every((v) => v === 'agence');

console.log('');
if (tousAgence) {
  console.log(attente('Les serveurs de noms n’ont pas encore été changés chez GoDaddy.'));
  console.log('     Cloudflare restera « En attente » tant que ce sera le cas.');
  console.log('     → prochaine action : étape 4.4 de MISE_EN_PROD.md.');
} else if (tousCfrq) {
  console.log(ok('Délégation complète vers la zone CFRQ. Cloudflare doit passer « Active ».'));
} else {
  console.log(attente('Propagation en cours : les résolveurs ne répondent pas tous pareil.'));
  console.log('     C’est normal, compter de 1 à quelques heures. Aucune coupure pendant ce temps.');
}

// --- 2. Quel site est servi ? ---------------------------------------------

console.log('\n=== 2. Quel site répond sur cfrq.ca ? ===\n');

for (const adresse of ['https://cfrq.ca/', 'https://www.cfrq.ca/']) {
  try {
    const r = await fetch(adresse, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    const corps = await r.text();
    const nouveau = corps.includes('/_astro/') || corps.includes('sitemap-index.xml');
    const wordpress = corps.includes('wp-content') || corps.includes('wp-includes');
    const quoi = nouveau ? 'NOUVEAU site Astro' : wordpress ? 'ancien WordPress' : 'indéterminé';
    console.log(`  ${adresse.padEnd(26)} ${r.status}  ${quoi}${r.url !== adresse ? `  → ${r.url}` : ''}`);
  } catch (e) {
    console.log(alerte(`${adresse} injoignable : ${e.message}`));
  }
}

// --- 3. Le courriel ---------------------------------------------------------

console.log('\n=== 3. Courriel (doit rester identique du début à la fin) ===\n');

const r = new Resolver({ timeout: 5000, tries: 2 });
r.setServers(['8.8.8.8']);
try {
  const mx = await r.resolveMx('cfrq.ca');
  const attendu = 'cfrq-ca.mail.protection.outlook.com';
  const bon = mx.some((m) => m.exchange.toLowerCase() === attendu);
  console.log(bon ? ok(`MX intact : ${attendu}`) : alerte(`MX INATTENDU : ${mx.map((m) => m.exchange).join(', ')}`));

  const txt = (await r.resolveTxt('cfrq.ca')).map((t) => t.join(''));
  const spf = txt.find((t) => t.startsWith('v=spf1'));
  console.log(spf ? ok(`SPF intact : ${spf}`) : alerte('SPF ABSENT.'));
} catch (e) {
  console.log(alerte(`Lecture des enregistrements de courriel impossible : ${e.message}`));
}

// --- Verdict ---------------------------------------------------------------

console.log('\n=== Où en es-tu ? ===\n');
if (tousAgence) {
  console.log('  Étape 0 sur 2 : rien n’a encore basculé. Le site public est l’ancien WordPress.');
} else if (!tousCfrq) {
  console.log('  Étape 1 sur 2 : la bascule est lancée, la propagation suit son cours.');
  console.log('  Relancer ce script dans une heure.');
} else {
  console.log('  Étape 2 sur 2 : la délégation est faite.');
  console.log('  → Contrôler le site : node scripts/verifier-en-ligne.mjs');
}
console.log('');
