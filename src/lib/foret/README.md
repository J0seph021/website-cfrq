# Moteur « courbe de maturité / capital forestier » — Phase 0

Fondation du **constat 1** du focus group (E1 courbe de maturité, E2 capital en
croissance/décroissance, E3 projection). Ce module transforme les attributs d'un
peuplement en une **courbe de volume selon l'âge**, un **âge de maturité** et un
**statut croissance / maturité / décroissance**.

Principe directeur : **aucune donnée inventée.** On ne fait que combiner et
interpoler deux jeux de données publiques du gouvernement du Québec.

## Données publiques (dans `data/`)

| Fichier | Source | Contenu |
|---|---|---|
| `pothier-savard.json` | Pothier & Savard (1998), *Tables de production*, MRNF, 183 p. (domaine public) | 87 tables (7 essences × 3 densités × classes d'IQS) : `âge → volume marchand brut (m³/ha)`, âge de maturité biologique (culmination de l'AAM) et âge du sommet de volume (début de la décroissance). |
| `iqs-type-eco.json` | Laflèche, Bernier, Saucier, Gagné (2013), *IQS par type écologique du Québec méridional*, MRNF, 115 p. (domaine public) | IQS (hauteur dominante potentielle) par essence et type écologique, résumé + détail par région. |

Les scripts d'extraction (à partir des PDF officiels) sont dans
`scripts/foret-extraction/` avec les URL sources. Ils sont ré-exécutables et
documentent exactement comment les nombres ont été tirés des PDF.

## API

```ts
import { analyserPeuplement } from "@/lib/foret";

const a = analyserPeuplement({
  grEss: "ENEN",     // eco_pee.gr_ess (composition)
  typeEco: "RS20",   // eco_pee.type_eco (clé IQS)
  clDens: "B",       // eco_pee.cl_dens (A/B/C/D)
  anOrigine: 1955,   // eco_pee.an_origine  (sinon clAge)
  vmbHaReel: 144.7,  // eco_dendro.vmb_ha  (ancre « vous êtes ici »)
  anneeCourante: 2026,
});
// a.courbe.points -> [{age, volume}]  (E1)
// a.statutCapital / a.couleur -> croissance|maturite|decroissance / vert|jaune|rouge  (E2)
// a.maturiteBio, a.picVolumeAge -> repères de la cloche  (E1/E3)
// a.fiabilite / a.iqsNiveau -> qualité de la correspondance
```

## Branchement PlaniLogix

Tout provient de `planilogix.eco_pee` (attributs carte écoforestière) et
`planilogix.eco_dendro` (compilation dendrométrique), jointes sur
`feuillet + geocode` :

- `gr_ess` → essence Pothier-Savard (2 lettres dominantes, voir `especes.ts`)
- `type_eco` → IQS (via `iqs.ts`)
- `cl_dens` → densité (A→FORTE, D→FAIBLE, sinon MOYENNE)
- `an_origine` (ou `cl_age`) → âge courant
- `eco_dendro.vmb_ha` → volume réel mesuré, pour **ancrer** le point actuel

## Limites connues (Phase 0)

1. **Ancrage plutôt que prédiction.** La courbe Pothier-Savard décrit un peuplement
   équienne pur théorique ; le `vmb_ha` réel (souvent mixte) diffère. Le point
   « vous êtes ici » doit s'**ancrer sur `vmb_ha`** ; la courbe ne sert qu'à la
   trajectoire et aux âges de maturité. Un écart prédit/réel est normal.
2. **Essences proxy.** Les essences sans table propre (érable, mélèze, pruche, pin
   blanc…) empruntent une essence voisine (`confiance: "proxy"`).
3. **Repli IQS.** Si le couple (essence, type écologique) n'a pas été échantillonné,
   on retombe sur la moyenne du groupe de végétation (`iqsNiveau`).
4. **Région écologique non utilisée.** L'IQS est moyenné sur les régions ; brancher
   la région (via SIGGA) affinerait la valeur.
5. **Peuplements équiennes.** Adapté aux peuplements réguliers résineux (≈90 % du
   territoire). Les structures irrégulières/jardinées sortent du cadre Pothier-Savard.

## Vérification

```
node src/lib/foret/__verify.ts
```
Contrôle les points publiés (SAB IQS12) et 13 peuplements réels de PlaniLogix.

## Suite (hors Phase 0)

Phase 1 : couche valeur $ (migration de produit pâte→sciage→déroulage par diamètre).
Phase 2 : projections « avec/sans intervention » via Natura-2014 (E3).
Phase 3 : indice biodiversité ordinal (E1 courbe rouge).
