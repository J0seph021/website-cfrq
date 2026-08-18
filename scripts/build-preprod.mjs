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

const env = {
  ...process.env,
  SITE_URL: process.env.SITE_URL || 'https://preview.cfrq.ca',
  SITE_BASE: '/',
  PUBLIER_ESPACE_CLIENT: process.env.PUBLIER_ESPACE_CLIENT || '0',
};

console.log(`Build de préproduction : ${env.SITE_URL} (espace client : ${env.PUBLIER_ESPACE_CLIENT === '1' ? 'publié' : 'masqué'})\n`);

for (const [cmd, args] of [
  ['astro', ['build']],
  ['node', ['scripts/verifier-build.mjs']],
]) {
  const r = spawnSync(cmd, args, { env, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
