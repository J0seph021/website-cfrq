// Reproduit en local le build de la préproduction (preview.cfrq.ca), tel que
// Cloudflare Pages le fait, puis lance le contrôle.
//
// Sert à vérifier avant de pousser que la préproduction est bien étanche :
// noindex partout, robots.txt fermé, aucune mesure d'audience.
//
// Usage : npm run build:preprod
//
// Passe par Node plutôt que par une variable d'environnement en ligne de
// commande, parce que la syntaxe diffère entre bash, PowerShell et cmd.

import { spawnSync } from 'node:child_process';

// PUBLIER_ESPACE_CLIENT n'est pas repris ici : hors production le portail est
// ouvert d'office (voir PUBLIER_ESPACE_CLIENT dans src/data/flags.ts). La
// variable ne sert qu'à la production, où elle vit dans deploy.yml.
const env = {
  ...process.env,
  SITE_URL: process.env.SITE_URL || 'https://preview.cfrq.ca',
  SITE_BASE: '/',
};

console.log(`Build de préproduction : ${env.SITE_URL} (espace client : publié)\n`);

for (const [cmd, args] of [
  ['astro', ['build']],
  ['node', ['scripts/verifier-build.mjs']],
]) {
  const r = spawnSync(cmd, args, { env, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
