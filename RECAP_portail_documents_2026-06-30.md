# Récap pour le projet portail (website-cfrq) — Documents & synchro
### 2026-06-30 — fait côté PlaniLogix, ce qui change pour le portail, et ce qu'il reste à faire ICI

> À lire par la session Claude qui travaille sur **website-cfrq**. Le travail décrit
> a été fait dans l'autre projet (PlaniLogix). Ça concerne directement le portail :
> les documents de l'espace client viennent maintenant d'un **mapping fiable**, et
> il reste **une** chose à automatiser **de ce côté-ci**.

---

## 1. Ce qui a changé côté PlaniLogix (contexte)

Le mapping documentaire a été refondu et **validé sur 60 PDF réels** (vision) :
- `planilogix.centre_doc_fichier.producteur_id` est désormais résolu de façon fiable
  (numéro normalisé zéros/casse → prescription → nom), **92 % des docs liés**, PAF inclus.
- `planilogix.centre_doc_fichier.no_prescription` est rempli pour prs/rap (parsé du nom de fichier, **100 % juste** sur l'échantillon).
- Nouvelle vue **`planilogix.v_documents`** : UNION du centre doc (PDF signés) et du
  répertoire (fichiers de travail), keyée `producteur_id` + `no_prescription`.
- Taux de bon lien producteur : **97,6 %** ; 1 faux lien rare = metadata SharePoint erronée.

**Pour le portail, la source d'or = `planilogix.centre_doc_fichier` (par `producteur_id`).**

---

## 2. Ce qui a déjà été modifié DANS ce repo (website-cfrq)

Commits sur `main` (préprod GitHub Pages) :

| Fichier | Changement |
|---|---|
| `scripts/copy-documents.mjs` | Source = `centre_doc_fichier.producteur_id` (au lieu de l'intersection spatiale). Couvre **prs + rap + PAF** (avant : prs/rap seulement, PAF manquants). Options **`--all`** et **`--incremental`**. Robustesse (try/catch par producteur). |
| `src/components/EspaceClient.tsx` | La carte **« Plan d'aménagement »** affiche les vrais PAF (`type_document='paf'`) avec lien d'ouverture, au lieu de « Aucun plan ». Les PAF sont retirés de la liste « Documents » (dédup). |
| `.gitignore` | `scripts/.copy-watermark` (filigrane du mode incrémental). |

**En cours au moment d'écrire ceci** : `node --env-file=scripts/.env scripts/copy-documents.mjs --all`
copie ~1 180 producteurs / ~5 000 PDF / ~12-15 Go vers le bucket `documents` du portail.
(Vérifié bout-en-bout sur VOYER 2546 = 19 docs, SAVARD 2499 = 10 docs.)

### Sécurité (inchangée, confirmée)
- `public.documents` : RLS SELECT `producteur_id = current_producteur_id()`.
- bucket `documents` : RLS SELECT `foldername(name)[1] = current_producteur_id()::text`,
  chemin `{producteur_id}/{prescriptions|rapports|plans}/{fichier}.pdf`.
- La clé service PlaniLogix (`PLANI_STORAGE_KEY`) ne sert qu'au **transfert hors-ligne**,
  jamais exposée au navigateur. Le client lit via sa session (clé publishable + RLS).

---

## 3. ⭐ CE QUI RESTE À FAIRE ICI : automatiser la couche portail

**Objectif (demande de JM) : chaque fois qu'un doc est ajouté (SharePoint ou répertoire),
tout est synchronisé partout.**

La chaîne complète :

```
SharePoint / Répertoire T:\PPFP
        │  (AUTOMATIQUE : plugin PlaniLogix, au démarrage de QGIS, throttle 6h)
        ▼
PlaniLogix : Storage (buckets repertoire + centre_documentaire) + mapping centre_doc_fichier
        │  ◄── ICI : couche à automatiser CÔTÉ PORTAIL
        ▼
Portail (Relevés forestiers) : bucket documents + public.documents
        │  (déjà servi au client par RLS)
        ▼
Espace client web
```

**La couche 1 (sources → PlaniLogix) est déjà automatique** (le plugin le fait).
**La couche 2 (PlaniLogix → portail) est le travail de CE projet.** L'outil est prêt :
`copy-documents.mjs --incremental` ne pousse que les producteurs dont un document a
changé depuis le dernier passage (filigrane `maj_le` dans `scripts/.copy-watermark`).

### Option recommandée (toujours-active, pas de machine allumée requise)
**pg_cron + Edge Function dans le projet portail** :
1. Edge Function `sync-documents` (Deno) qui reproduit la logique de `copy-documents.mjs`
   (lit le delta depuis `centre_doc_fichier` via la connexion PlaniLogix, download du
   bucket `centre_documentaire`, upload vers `documents`, upsert `public.documents`,
   met à jour un filigrane stocké dans une table `public.sync_state`).
   Secrets de la fonction : `PLANILOGIX_DB_URL`, `PLANI_URL`, `PLANI_STORAGE_KEY`
   (déjà dans `scripts/.env`).
2. `pg_cron` qui appelle la fonction toutes les 15-30 min (`select cron.schedule(...)`
   + `net.http_post` vers l'Edge Function).

### Option simple immédiate (stopgap)
**Tâche planifiée Windows** sur le poste de JM (ou un GitHub Action cron avec les secrets) :
`node --env-file=scripts/.env scripts/copy-documents.mjs --incremental` toutes les heures.
Inconvénient : dépend d'une machine/CI allumée.

> Note réalité : « chaque fois qu'un doc est ajouté » = en pratique un **incrémental
> fréquent** (15-30 min), pas un webhook temps réel. Un vrai temps réel exigerait des
> abonnements Graph (SharePoint) + un endpoint hébergé — surdimensionné pour le besoin.

---

## 4. Détails utiles pour implémenter l'Edge Function

Requête du delta (sur la BD PlaniLogix) :
```sql
SELECT storage_key, nom_fichier, sp_type_code, no_prescription, taille_octets, sp_annee, producteur_id
FROM planilogix.centre_doc_fichier
WHERE producteur_id IS NOT NULL AND statut='uploaded'
  AND sp_type_code IN ('prs','rap','paf')
  AND maj_le > :filigrane
ORDER BY producteur_id;
```
Mapping type → dossier/libellé (déjà dans `copy-documents.mjs`) :
- `prs` → `prescriptions/` — « Prescription {no} »
- `rap` → `rapports/` — « Rapport d'exécution {no} »
- `paf` → `plans/`, `type_document='paf'` — « Plan d'aménagement forestier {année} »

`public.documents` (colonnes) : `producteur_id, type_document, reference (=no_prescription),
nom_document, storage_path, taille, date_document`. Upsert `onConflict: storage_path`.
Idempotence : supprimer les lignes du producteur pour ces types avant de réinsérer
(comme `copy-documents.mjs`), ou upsert pur.

---

## 5. État / chiffres de référence

- Projet portail Supabase : `sfzcslpbysabsiszcpqm` (« Relevés forestiers »).
- Projet PlaniLogix Supabase : `bpxzznykbikbqbvraqxj` (source, lecture seule côté portail).
- `public.documents` avant : 11 lignes (VOYER seul). Après `--all` : ~5 000 lignes / ~1 180 producteurs.
- Le front-end est **générique** : il affiche toute ligne `documents` via `storage_path` → signed URL. Aucun changement requis pour de nouveaux types.

## 6. Limites connues (pour info, pas bloquant)
- **Module PAF** pas encore construit dans PlaniLogix → la carte « Plan d'aménagement »
  montre le **document** PAF, pas un plan structuré (statut/échéance/progression/programmes).
  Quand le module PAF existera, alimenter `public.paf` et la carte affichera le plan riche.
- **Trou 2019-2021** dans `planilogix.prescription` (ère MAGIC jamais importée) : certaines
  prescriptions n'existent que comme PDF (centre doc) — elles remontent quand même comme
  documents, mais sans enregistrement structuré.
- 1 faux lien producteur ~/60 possible (metadata SharePoint erronée) ; neutralisé quand la
  prescription est en BD avec sa propriété.

---

*Généré le 2026-06-30 par la session PlaniLogix. Colle/lis ce fichier au début de la
session portail pour le contexte complet. La seule action requise ici = §3 (automatiser
la couche 2).*
