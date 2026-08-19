# website-cfrq

Site Web du CFRQ, bâti avec Astro et publié par GitHub Pages sur
[cfrq.ca](https://cfrq.ca). Le flux de déploiement (préproduction, bascule DNS,
retour en arrière) est décrit dans `PREPROD.md` et `MISE_EN_PROD.md`.

## Fichiers à URL stable

Astro hache le nom des fichiers qu'il traite lui-même : une image importée
depuis `src/` devient `logo.BcPpLeo9_15VniQ.webp`, et ce nom change à chaque
reconstruction. Une URL de ce genre ne peut donc pas être collée dans une
signature de courriel ou dans un annuaire : elle casserait au déploiement
suivant.

Ce qui est déposé dans `public/` échappe à ce traitement : Astro le copie
verbatim à la racine du site. **Ces adresses sont donc permanentes, et des
choses extérieures au dépôt en dépendent. Ne pas les renommer ni les
supprimer.**

| Fichier | URL publique | Sert à |
|---|---|---|
| `public/signature/logo-cfrq.png` | `https://cfrq.ca/signature/logo-cfrq.png` | Signatures de courriel. 600 × 210, **fond blanc opaque**. |
| `public/signature/logo-cfrq-transparent.png` | `https://cfrq.ca/signature/logo-cfrq-transparent.png` | Même logo, fond transparent. Fonds pâles seulement. |
| `public/signature/logo-cfrq-sombre.png` | `https://cfrq.ca/signature/logo-cfrq-sombre.png` | Version pour fonds sombres : lettrage en `#eaf4e0`, feuille inchangée, fond transparent. |
| `public/logo-courriel.png` | `https://cfrq.ca/logo-courriel.png` | Ancien logo de courriel, 480 × 168, fond transparent. Conservé parce que des signatures déjà distribuées pointent peut-être dessus. |
| `public/favicon.svg` | `https://cfrq.ca/favicon.svg` | Icône du site. Doit rester **carrée** : Google et les annuaires l'inscrivent dans un rond, un fichier non carré s'affiche étiré. |

### Pourquoi un fond blanc pour la signature

Le logo est composé de lettres noires. Sur fond transparent, elles deviennent
invisibles dès qu'un client courriel passe en mode sombre — un cas fréquent
dans Outlook. Le fond blanc opaque garantit le même rendu partout.

### Les trois variantes, et laquelle choisir

Le logo est fait de lettres noires et d'une feuille verte. Aucune version ne
fonctionne partout, il faut choisir selon le fond :

- **`logo-cfrq.png`, fond blanc opaque** — le choix par défaut pour une
  signature de courriel. Il s'affiche identiquement partout, y compris dans les
  clients en mode sombre, où il apparaît comme une carte blanche.
- **`logo-cfrq-sombre.png`** — lettrage pâle, fond transparent, pour les fonds
  sombres. Illisible sur fond pâle : le lettrage y disparaît.
- **`logo-cfrq-transparent.png`** — lettrage noir, fond transparent, pour les
  fonds pâles autres que le blanc.

Les trois sont générées depuis `src/assets/logo/CFRQ.svg`, donc sans perte. Les
lettres sont les tracés sans attribut `fill` du fichier source; la feuille est
le seul tracé qui porte `fill="#5ABD2A"`, et elle n'est jamais recolorée.

Pour servir automatiquement la bonne variante selon le thème du lecteur, il
faut une règle `prefers-color-scheme` dans le HTML du courriel. **Outlook pour
Windows ne la comprend pas** et affichera toujours la variante par défaut :
c'est la raison pour laquelle `logo-cfrq.png` a un fond blanc opaque plutôt
que transparent.

### Taille d'affichage

Le fichier fait 600 × 210 pixels et doit être affiché à **300 × 105**, soit la
moitié. Les écrans à haute densité utilisent alors toute la définition
disponible, au lieu d'une image floue.

```html
<img src="https://cfrq.ca/signature/logo-cfrq.png"
     width="300" height="105" alt="CFRQ">
```

Les attributs `width` et `height` en pixels, dans le HTML et non en CSS :
Outlook ignore une bonne partie des feuilles de style.

## Développement

```bash
npm install
npm run dev        # serveur local
npm run build      # build de production
npm run verifier   # contrôles sur le build (canonical, robots, métadonnées)
```
