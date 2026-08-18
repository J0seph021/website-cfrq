# Préproduction : voir les changements avant qu'ils soient publics

Deux environnements, deux branches :

| Branche | Où ça sort | Hébergeur | Indexé par Google |
|---|---|---|---|
| `main` | https://cfrq.ca | GitHub Pages | oui |
| `preview` | https://preview.cfrq.ca | Cloudflare Pages | **non, jamais** |

Le flux de travail : je pousse sur `preview` → je regarde → si c'est bon, je
fusionne dans `main` → ça part en production.

---

## Avant tout : le local reste le plus rapide

Pour écrire du texte ou ajuster du design, ne pas passer par la préproduction.

```bash
npm run dev
```

`http://localhost:4321`, rechargement instantané à chaque sauvegarde, aucun
commit, aucune attente de build. La préproduction sert à **montrer** (à un
collègue, à un client) et à **valider sur un vrai appareil**, pas à itérer.

Pour reproduire en local exactement le build de la préproduction :

```bash
npm run build:preprod
```

---

## Étanchéité : pourquoi la préproduction ne doit jamais s'indexer

La préproduction sert le même contenu que cfrq.ca. Si Google l'indexait, il
verrait deux copies du site et pourrait classer la copie à la place du vrai
site. Quatre verrous, tous automatiques, tous vérifiés par `npm run verifier` :

1. **En-tête HTTP `X-Robots-Tag: noindex`** sur tout le site, via le fichier
   `_headers` écrit au build et lu par Cloudflare Pages. **C'est le verrou
   principal**, parce que c'est le seul qu'on ne peut pas contredire ailleurs.
2. **`noindex` en balise meta sur chaque page**, dès que `SITE_URL` n'est pas
   `https://cfrq.ca`.
3. **`robots.txt` en `Disallow: /`**, généré au build (`src/pages/robots.txt.ts`).
   ⚠️ Verrou le plus faible : l'option **« Robots.txt géré »** d'AI Crawl Control
   réécrit le `robots.txt` de la zone et y injecte un `User-agent: * / Allow: /`
   **avant** le nôtre. À longueur de chemin égale, le moins restrictif gagne,
   donc ce `Disallow: /` est neutralisé tant que cette option est active. D'où le
   verrou n° 1, qu'aucun `robots.txt` ne peut annuler.
4. **Aucune mesure d'audience** : GTM et le bandeau de consentement ne se
   chargent qu'en production, donc les essais ne polluent pas les statistiques.

Le contrôle vérifie aussi l'inverse : un build de **production** qui porterait un
`_headers` avec `noindex` est refusé, pour que cfrq.ca ne puisse pas se retirer
de Google par accident.

Le contrôle **refuse un build de préproduction** dont une seule page ne serait
pas en `noindex`, ou dont le `robots.txt` serait ouvert. La règle est unique
(`estProduction()` dans `src/data/flags.ts`), les trois verrous ne peuvent pas
diverger.

---

## Créer la branche `preview`

Une fois le travail committé sur `main` :

```bash
git push origin main:preview
```

Cette commande crée la branche `preview` sur GitHub, au même commit que `main`.
Pour travailler dessus ensuite :

```bash
git switch -c preview origin/preview
```

---

## Configuration Cloudflare Pages (FAITE le 2026-08-18)

Projet **`cfrq-preprod`** dans le compte Cloudflare `J.moffet@cfrq.ca`, connecté
au dépôt `J0seph021/website-cfrq`. Adresses : **https://preview.cfrq.ca** et
`cfrq-preprod.pages.dev`.

**Réglages en place :**

| Champ | Valeur |
|---|---|
| Infrastructure prédéfinie | `Aucun` |
| Commande de build | `npm run build` |
| Répertoire de sortie | `dist` |
| Répertoire racine | `/` |
| Branche en production | **`preview`** |

Le préréglage est laissé à `Aucun` volontairement : il ne sert qu'à préremplir
les deux champs suivants, qui sont déjà remplis à la main. Un préréglage en moins
est une source de surprise en moins si Cloudflare change ses valeurs par défaut.

> La *production branch* du projet Cloudflare est bien `preview`, pas `main`.
> C'est la branche que Cloudflare servira sur l'adresse principale du projet.
> `main`, lui, part sur GitHub Pages : les deux hébergeurs ne se croisent jamais.

**Variables d'environnement** (onglet *Settings → Environment variables*,
environnement *Production*) :

| Nom | Valeur |
|---|---|
| `SITE_URL` | `https://preview.cfrq.ca` |
| `SITE_BASE` | `/` |
| `PUBLIER_ESPACE_CLIENT` | `0` |
| `NODE_VERSION` | `20` |

`PUBLIER_ESPACE_CLIENT` à `0` fait que la préproduction montre exactement ce que
verra le public. Le passer à `1` quand on veut retravailler l'espace client :
c'est le seul réglage à changer, et il ne touche pas à la production.

**Contrôle de branche** (*Paramètres → Contrôle de branche*) : *Aperçu de la
branche* est réglé sur **Aucun**. Seule `preview` déclenche un build ici ; une
poussée sur `main` ne construit rien côté Cloudflare, elle part sur GitHub Pages.

---

## Le domaine preview.cfrq.ca

Attaché le 2026-08-18. Cloudflare a créé tout seul l'enregistrement
`CNAME preview → cfrq-preprod.pages.dev` dans la zone cfrq.ca. Aucun
enregistrement existant n'a été touché.

Vérifié après déploiement : `robots.txt` en `Disallow: /`, `noindex` sur les
pages, aucun GTM.

---

## Cloudflare Access (FAIT le 2026-08-18)

Le `noindex` empêche Google d'indexer, mais n'empêche personne d'ouvrir
l'adresse. **Cloudflare Access** met une authentification par courriel devant la
préproduction : ce qui n'est pas accessible ne peut être ni indexé, ni tombé sous
les yeux d'un client au mauvais moment.

**En place, forfait Zero Trust Free.** Application `Préproduction CFRQ`,
politique `Équipe CFRQ` (Autoriser, e-mails se terminant par `@cfrq.ca`),
session d'une semaine, connexion par code à 6 chiffres envoyé par courriel.

**Les deux adresses sont couvertes**, `preview.cfrq.ca` et
`cfrq-preprod.pages.dev` : la brèche du `pages.dev` est donc fermée. Vérifié,
les deux répondent 302 vers `summer-cake-6a83.cloudflareaccess.com`, et la
production reste libre d'accès.

Se connecter avec une adresse **`@cfrq.ca`** : une adresse personnelle (Gmail)
ne correspond pas à la politique. Pour ouvrir l'accès à quelqu'un d'externe,
ajouter son adresse dans la politique avec *Include → E-mails*.

### Les étapes suivies, pour mémoire

1. Dans Cloudflare, aller dans **Zero Trust** (barre latérale, ou
   `one.dash.cloudflare.com`).
2. Au premier passage, Cloudflare demande un **nom d'équipe**. Mettre `cfrq` :
   ça donne `cfrq.cloudflareaccess.com`, l'adresse de la page de connexion.
   Choisir le forfait **Free**.
3. **Access → Applications → Add an application → Self-hosted**.
4. **Application name** : `Préproduction CFRQ`.
   **Session duration** : 1 semaine, pour ne pas se reconnecter sans cesse.
5. **Public hostname** : sous-domaine `preview`, domaine `cfrq.ca`.
6. **Next**, puis créer la règle :
   - *Policy name* : `Équipe CFRQ`
   - *Action* : **Allow**
   - *Include* → **Emails ending in** → `@cfrq.ca`
7. **Login methods** : laisser **One-time PIN**. Pas besoin de fournisseur
   d'identité : Cloudflare envoie un code à 6 chiffres par courriel.
8. **Save**.

Ensuite, ouvrir `preview.cfrq.ca` demande un courriel `@cfrq.ca` puis le code
reçu. Pour montrer la préproduction à quelqu'un d'externe, ajouter son adresse
dans la règle avec *Include → Emails*.

### Deux choses à savoir

**Les contrôles automatiques ne passent plus sur la préproduction.** `curl` sur
`preview.cfrq.ca` reçoit la page de connexion, pas le site. Sans conséquence
ici : `verifier-en-ligne.mjs` interroge la production. Pour contrôler un build
de préproduction, passer par `npm run build:preprod` en local.

**Ne pas retirer les autres verrous.** Access protège les deux noms d'hôte
aujourd'hui, mais l'en-tête `X-Robots-Tag` et le `noindex` restent utiles : ils
suivent le contenu, pas le nom d'hôte. Si un jour une adresse de déploiement
d'aperçu Cloudflare (`<hash>.cfrq-preprod.pages.dev`) échappait à la politique,
ils la couvriraient quand même.

---

## Au quotidien

```bash
git switch preview
```

Travailler, committer, puis :

```bash
git push origin preview
```

Cloudflare reconstruit en une à deux minutes. Quand le résultat convient :

```bash
git switch main
```

```bash
git merge preview
```

```bash
git push origin main
```

GitHub Actions relance le contrôle et publie sur cfrq.ca. Si le contrôle échoue,
rien n'est publié.
