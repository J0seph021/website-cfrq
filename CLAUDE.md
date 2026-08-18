# Instructions pour Claude Code — website-cfrq

## Montrer les changements à Joseph : toujours via preview.cfrq.ca, jamais via localhost

Dès qu'une tâche touchant des fichiers du site est terminée, **committer et
pousser sur la branche `preview`** — sans demander la permission, c'est le
comportement par défaut. Cloudflare Pages reconstruit
`https://preview.cfrq.ca` en 1 à 2 minutes.

**Pourquoi :** Joseph ne veut pas dépendre d'un serveur local (`npm run dev`)
pour voir un changement — le localhost ne fonctionne pas de façon fiable chez
lui. Il préfère attendre deux minutes et regarder sur preview.cfrq.ca.

**Comment appliquer :**
- Démarrer un serveur local pour ses propres vérifications internes (avant de
  livrer) reste correct et même recommandé, mais ça ne remplace pas le push :
  une tâche n'est vraiment terminée que quand `preview` a été mis à jour.
- Committer et `git push origin preview` fait partie de la definition of done
  de toute tâche qui modifie le site — pas une étape à part qu'il faut demander.
- Cloudflare Access protège preview.cfrq.ca (connexion par courriel
  `@cfrq.ca`) : c'est normal, Joseph a déjà accès.

**Ne jamais pousser ni fusionner sur `main` sans demande explicite de
Joseph.** `main` se déploie directement en production sur cfrq.ca (site
public, indexé par Google). Une poussée sur `main` est visible par les
clients en quelques minutes. Ne pas interpréter « ça a l'air bon » ou
« parfait » comme un feu vert pour `main` : il faut une demande claire de
mise en ligne. Une fois autorisé :

```bash
git switch main
git merge preview
git push origin main
```

Détails complets du flux (Cloudflare Pages, noindex, Cloudflare Access) dans
`PREPROD.md` à la racine du dépôt.
