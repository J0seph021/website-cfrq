# Lexique des traitements recommandés — espace client

Objectif : dans le bloc « Ce que votre forêt demande » du portail, n'afficher que les
définitions des traitements réellement présents dans le PAF du client, au lieu du lexique
fixe de trois cartes.

Source des valeurs : `planilogix.v_peuplements_complets.traitements_rec`, 29 valeurs
distinctes, 7 379 peuplements avec un traitement recommandé (relevé du 2026-08-05).

Colonne « Source » :

- **CRT** = Cahier de références techniques en forêt privée, MRNF, mise à jour juin 2023
  (définition officielle du PAMVFP, reprise mot pour mot ou resserrée).
- **TF** = Travaux forestiers, définitions et illustrations, MRNF, 2022-01-07.
- **à valider** = aucune définition officielle trouvée dans ces deux documents. Le texte
  proposé vient de l'usage courant. **Joseph doit le corriger ou le confirmer.**

---

## 1. Traitements commerciaux (récolte)

| # | Valeur en base | n | Définition proposée (client) | Source |
|---|---|---|---|---|
| 1 | Coupe d'assainissement | 1167 | On récolte les arbres malades, dépérissants ou endommagés pour protéger la santé du reste du peuplement. | à valider (le CRT ne le nomme pas; TF mentionne l'assainissement comme un effet possible d'une coupe partielle) |
| 2 | Éclaircie commerciale | 1074 | On récolte une partie des arbres de dimension marchande pour accélérer la croissance de ceux qui restent et améliorer la qualité du peuplement. | CRT 4.1 |
| 3 | Coupe de jardinage | 945 | Des coupes périodiques dans un peuplement de tous les âges, pour l'amener vers une structure équilibrée et laisser s'installer de nouveaux semis. | CRT 4.3 |
| 4 | Coupe avec protection de la régénération et des sols | 708 | On récolte les arbres matures en protégeant les jeunes tiges déjà en place et les sols, pour que la forêt reparte d'elle-même. | TF (famille « coupe de régénération ») |
| 5 | Récolte des tiges matures | 555 | On récolte les arbres arrivés à maturité, ceux qui ne gagnent plus de valeur, et on laisse la place aux plus jeunes. | à valider |
| 6 | Coupe progressive | 535 | La récolte se fait en plusieurs passages étalés dans le temps, sous le couvert des arbres semenciers, pour installer la nouvelle génération avant de retirer l'ancienne. | CRT 4.2 |
| 7 | Coupe d'amélioration | 444 | On retire les arbres de moindre qualité ou d'essences moins désirées pour concentrer la croissance sur les meilleurs. | à valider |
| 8 | Coupe de récupération | 188 | Après un chablis, une épidémie, un verglas ou un feu, on récolte les arbres marchands d'un peuplement qui se détériore, avant de perdre leur valeur. | CRT 4.4 |
| 9 | Coupe de succession | 84 | On récolte le peuplement en place pour laisser la place à l'essence qui lui succède naturellement sur le site. | à valider |
| 10 | Coupe avec protection des petites tiges marchandes | 39 | On récolte les gros arbres en préservant les petites tiges déjà marchandes, qui formeront le prochain peuplement. | TF (famille « coupe de régénération ») |
| 11 | Éclaircie intermédiaire | 87 | Une éclaircie faite entre deux interventions majeures, pour maintenir la croissance du peuplement. | à valider |
| 12 | Récupération des tiges résiduelles | 11 | On récolte les tiges marchandes laissées sur place après une intervention antérieure. | à valider |

## 2. Remise en production

| # | Valeur en base | n | Définition proposée (client) | Source |
|---|---|---|---|---|
| 13 | Préparation de terrain et reboisement | 144 | On prépare le sol pour donner aux jeunes plants un endroit où s'enraciner, puis on met les plants en terre. | CRT 1.1 et 1.2.1, TF |
| 14 | Reboisement | 49 | On met en terre des plants forestiers pour accélérer l'établissement du nouveau peuplement. | TF |
| 15 | Regarni | 12 | On plante dans les trous d'un peuplement ou d'une plantation où la régénération n'a pas suffi, pour occuper tout le terrain. | CRT 1.2.2, TF |
| 16 | Enrichissement | 15 | On introduit ou on réintroduit une essence rare ou de plus grande valeur, pour enrichir le peuplement ou sa biodiversité. | CRT 1.2.3, TF |

## 3. Entretien et éducation

| # | Valeur en base | n | Définition proposée (client) | Source |
|---|---|---|---|---|
| 17 | Dégagement de plantation | 132 | On coupe la végétation qui étouffe les jeunes plants pour leur laisser la lumière et l'espace. | CRT 2.1 |
| 18 | Dégagement de régénération naturelle | 82 | Même travail, mais autour des jeunes arbres venus naturellement plutôt que plantés. | CRT 2.1 |
| 19 | Éclaircie précommerciale | 290 | Dans un jeune peuplement trop dense, on coupe les tiges de dimension non marchande qui nuisent aux meilleures, pour concentrer la croissance sur celles d'avenir. | CRT 3.1 |
| 20 | Éclaircie précommerciale systématique | 2 | Variante de l'éclaircie précommerciale : les tiges d'avenir sont retenues selon un espacement régulier. | CRT 3.1 |
| 21 | Éclaircie précommerciale puits de lumière | 1 | Variante de l'éclaircie précommerciale : on ouvre des puits de lumière au-dessus des tiges choisies. | CRT 3.1 |
| 22 | Élagage | 68 | On coupe les branches basses pour produire un bois plus droit, avec moins de nœuds, ou pour freiner une maladie. | TF |
| 23 | Taille de formation | 12 | On corrige la forme du jeune arbre, fourches et branches concurrentes, pour obtenir un tronc droit. | à valider |
| 24 | Taille Phytosanitaire | 3 | On coupe les parties mortes, endommagées ou infectées pour éviter que la maladie ou le parasite se propage. | CRT 2.3 (pins blancs et pins rouges) |

## 4. Suivi, protection, aucune intervention

| # | Valeur en base | n | Définition proposée (client) | Source |
|---|---|---|---|---|
| 25 | Évaluer de nouveau dans quelques années | 598 | Rien à faire pour l'instant : le peuplement sera réévalué dans quelques années. | à valider (ce n'est pas un traitement) |
| 26 | Inventaire de régénération | 32 | On mesure la jeune régénération en place pour décider si le site repart tout seul ou s'il faut l'aider. | à valider |
| 27 | Traitement de protection | 13 | Intervention visant à protéger le peuplement (à préciser). | à valider |
| 28 | Protection (aucune intervention) | 3 | Le peuplement est laissé intact, pour sa valeur écologique ou sa fragilité. | à valider |
| 29 | None | 4 | *Valeur parasite, voir plus bas.* | bogue de données |

---

## Décisions de Joseph, 2026-08-05 (implantées)

Les définitions 1 à 24 sont approuvées telles quelles. Deux fusions retenues, trois refusées.

**Fusions appliquées**

1. **Reboisement + Préparation de terrain et reboisement (13, 14)** en une entrée
   « Reboisement ». La préparation de terrain est nécessaire la plupart du temps, la
   définition la mentionne.
2. **Les trois éclaircies précommerciales (19, 20, 21)** en une entrée « Éclaircie
   précommerciale ». Systématique et puits de lumière sont les deux variantes admissibles
   du même traitement au CRT, et totalisent 3 peuplements sur 293.

**Fusions refusées**

3. **Dégagement de plantation et Dégagement de régénération naturelle (17, 18)** restent
   deux entrées distinctes, chacune avec sa propre définition. La 18 ne renvoie plus à la 17.
4. **Coupe de récupération et Récupération des tiges résiduelles (8, 12)** restent distinctes.

**Non affichés**

- **25 Évaluer de nouveau dans quelques années** : ce n'est pas un traitement. Aucune carte.
  Compté à part et mentionné dans le texte d'introduction : « X autres peuplements sont
  simplement à revoir dans quelques années, sans intervention d'ici là. »
- **26 Inventaire de régénération** et **27 Traitement de protection** : sens incertain chez
  CFRQ, donc aucune carte et exclus du compte des traitements recommandés.
- **28 Protection (aucune intervention)** : même idée que la 25, formulée autrement. Aucune carte.
- **29 None** : valeur parasite, traitée comme vide.

**Résultat : 21 définitions affichables**, choisies selon le PAF du client. Le lexique complet
vit dans `src/components/EspaceClient.tsx` (`LEXIQUE_TRAITEMENTS`). Couverture vérifiée par
requête : aucune des 29 valeurs en base n'échappe au lexique ou à la liste des non-traitements.
En moyenne un PAF déclenche 6 cartes; le plus gros dossier actuel en déclenche 21.

## Deux défauts de données à corriger à la source

1. **« Récolte des tiges matures » a une espace de trop à la fin** dans les 555 peuplements
   concernés. Sans `btrim`, tout regroupement ou toute correspondance par nom échouera un
   jour. À nettoyer dans PlaniLogix, et à protéger par un `btrim` côté portail.
2. **La chaîne littérale « None »** apparaît dans 4 peuplements. C'est le `None` de Python
   sérialisé en texte quelque part dans la chaîne d'import, pas une vraie valeur. À corriger
   à la source et à traiter comme vide côté portail.

## Sources

- MINISTÈRE DES RESSOURCES NATURELLES ET DES FORÊTS (2023). *Cahier de références
  techniques en forêt privée, mise à jour juin 2023*, Québec, Service de la forêt privée, 59 p.
- MINISTÈRE DES RESSOURCES NATURELLES ET DES FORÊTS (2022). *Travaux forestiers,
  définitions et illustrations*, 2022-01-07.
