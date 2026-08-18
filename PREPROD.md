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
site. Trois verrous, tous automatiques, tous vérifiés par `npm run verifier` :

1. **`noindex` sur chaque page**, dès que `SITE_URL` n'est pas `https://cfrq.ca`.
2. **`robots.txt` en `Disallow: /`**, généré au build (`src/pages/robots.txt.ts`).
3. **Aucune mesure d'audience** : GTM et le bandeau de consentement ne se
   chargent qu'en production, donc les essais ne polluent pas les statistiques.

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

## Configurer Cloudflare Pages

Dans le tableau de bord Cloudflare : **Workers & Pages → Create → Pages →
Connect to Git**, puis choisir le dépôt `J0seph021/website-cfrq`.

**Réglages de build :**

| Champ | Valeur |
|---|---|
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Production branch | **`preview`** |

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

**Éviter les builds inutiles :** dans *Settings → Builds → Branch control*,
mettre les *preview branches* à **None**. Sans ça, Cloudflare reconstruit aussi
à chaque poussée sur `main`, qui n'a rien à faire là.

---

## Attacher preview.cfrq.ca

⚠️ **Possible seulement une fois la zone Cloudflare active**, donc après la
bascule des serveurs de noms (voir `MISE_EN_PROD.md`, étape 4.4). Tant que la
zone est « En attente », Cloudflare ne peut pas créer le sous-domaine.

En attendant, le projet est accessible sur son adresse `*.pages.dev`, qui
fonctionne immédiatement. Mettre alors `SITE_URL` à cette adresse-là : dans les
deux cas la préproduction reste en `noindex`, puisque la seule adresse
considérée comme production est `https://cfrq.ca`.

Une fois la zone active : **projet Pages → Custom domains → Set up a custom
domain → `preview.cfrq.ca`**. Cloudflare crée l'enregistrement DNS tout seul.
Repasser ensuite `SITE_URL` à `https://preview.cfrq.ca`.

---

## Verrouiller l'accès (recommandé)

`noindex` empêche Google d'indexer, mais n'empêche personne d'ouvrir l'adresse.
Pour une préproduction qui montre des travaux en cours, **Cloudflare Access**
(gratuit jusqu'à 50 personnes) met une authentification par courriel devant le
site : **Zero Trust → Access → Applications → Add an application → Self-hosted**,
domaine `preview.cfrq.ca`, avec une règle qui n'autorise que les adresses
`@cfrq.ca`.

C'est la protection la plus solide : ce qui n'est pas accessible ne peut pas
être indexé, ni tomber sous les yeux d'un client au mauvais moment.

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
