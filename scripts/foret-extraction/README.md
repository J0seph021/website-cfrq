# Extraction des données publiques forestières

Scripts Python qui convertissent deux publications officielles du MRNF (domaine
public) en JSON consommés par `src/lib/foret/`. Ré-exécutables pour tracer
l'origine de chaque nombre (aucune valeur inventée).

## Sources (PDF officiels)

- **Pothier & Savard (1998), Tables de production** :
  https://mrnf.gouv.qc.ca/documents/forets/recherche/actualisation_tables_production_pothier_savard.pdf
- **Laflèche et al. (2013), IQS par type écologique** :
  https://mrnf.gouv.qc.ca/documents/forets/inventaire/indices-qualite.pdf

## Exécution

```bash
pip install pypdf pdfplumber
# placer les 2 PDF dans le dossier courant sous les noms :
#   pothier_savard_1998.pdf   iqs_types_eco_2013.pdf
python extract_pothier.py   # -> pothier_savard.json  (87 tables, validées)
python extract_iqs.py       # -> iqs_type_eco.json    (438 records IQS)
# puis copier les .json dans src/lib/foret/data/ (pothier-savard.json, iqs-type-eco.json)
```

## Robustesse

Les PDF comportent des coquilles OCR (virgules parasites, colonne d'âge). Les
extracteurs : détectent les colonnes par position, reconstruisent l'âge par pas
de 5 ans, filtrent les pics (Hampel) et réparent les erreurs de virgule de façon
directionnelle. Chaque table est validée (courbe croît puis décroît, âge de
maturité concordant à ±2 ans avec la valeur publiée).
