"""
Client de démonstration de l'espace client : « Jean Tremblay », Lyster.

Crée (ou remet à neuf) un dossier de démonstration dans le projet Supabase de
l'espace client, pour présenter le portail avec une forêt qui a l'air vraie.

Ce qui est RÉEL (public) : deux lots du cadastre à Lyster et les peuplements de
l'inventaire écoforestier du Ministère (planilogix.eco_pee) découpés à leurs
limites, avec les cours d'eau (planilogix.hydro_lits_lidar). Ce qui est INVENTÉ :
le propriétaire, son numéro, les prescriptions, travaux, montants, plans et les
10 PDF (mention « exemple fictif », aucune vraie signature). Aucune donnée tirée
du dossier du vrai propriétaire de ces lots.

Ne crée PAS de compte de connexion : un humain le crée dans Supabase
(Authentication > Users > Add user, « Auto Confirm User »), puis on le relie au
dossier avec --relier <courriel>.

    python scripts/client-demo/creer_client_demo.py                 # crée / remet à neuf
    python scripts/client-demo/creer_client_demo.py --relier x@y.ca # relie le compte

Identifiants 900001 et plus : très au-dessus des vrais, jamais touchés par
sync-documents, export-cartes ni export-bilans. Lit SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY et PLANILOGIX_DB_URL dans scripts/.env.
"""
import json
import pathlib
import sys

import fitz  # PyMuPDF
import psycopg2
import requests

RACINE = pathlib.Path(__file__).resolve().parents[2]
ENV = dict(
    l.split("=", 1) for l in (RACINE / "scripts/.env").read_text(encoding="utf-8").splitlines()
    if "=" in l and not l.startswith("#")
)
URL = ENV["SUPABASE_URL"].rstrip("/")
CLE = ENV["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": CLE, "Authorization": f"Bearer {CLE}"}
LOGO = RACINE / "public/signature/logo-cfrq-sombre.png"

PID = 900001
NOM, NO_PROD = "TREMBLAY JEAN", "TREJ00002041"
AGENCE = "17199"  # préfixe fictif des numéros de prescription et de plan (aucune agence réelle)
MUNICIPALITE, MRC, REGION = "Lyster", "L'Érable", "Centre-du-Québec"
# (no_propriete, lot du cadastre). Lots publics ; leur vrai propriétaire n'est jamais nommé.
LOTS_REELS = [("01", "5 833 738"), ("02", "5 835 396")]


def fmt_ha(v: float) -> str:
    return f"{v:.1f} ha".replace(".", ",")


# ------------------------------------------------------------ données réelles
SQL_LOT = """
select round((st_area(geom)/10000)::numeric, 2),
       st_asgeojson(st_transform(geom, 4326), 6),
       st_asgeojson(st_transform(st_envelope(geom), 4326), 6)
from planilogix.cadastre where no_lot = %s limit 1"""

# Peuplements découpés au lot. eco_pee contient des polygones qui se chevauchent :
# chaque morceau est amputé de ce que les plus grands couvrent déjà, pour ne jamais
# compter deux fois le même hectare. Certains polygones sont invalides : st_makevalid
# d'abord, sinon la soustraction laisse passer des chevauchements.
SQL_PEUP = """
with l as (select geom from planilogix.cadastre where no_lot = %s limit 1),
c as (
  select e.gr_ess, e.cl_dens, e.cl_haut, e.cl_age, e.type_eco, e.origine, e.an_origine,
         e.perturb, e.an_perturb, e.cl_drai, e.region_eco,
         st_collectionextract(st_intersection(st_makevalid(e.geom), l.geom), 3) as g
  from planilogix.eco_pee e, l where st_intersects(e.geom, l.geom)),
r as (select *, row_number() over (order by st_area(g) desc) as rang from c where st_area(g) > 500),
d as (
  select r.*, coalesce(st_difference(r.g, (select st_union(r2.g) from r r2 where r2.rang < r.rang)), r.g) as piece
  from r)
select gr_ess, cl_dens, cl_haut, cl_age, type_eco, origine, an_origine, perturb, an_perturb, cl_drai, region_eco,
       round((st_area(piece)/10000)::numeric, 2) as ha,
       st_asgeojson(st_transform(st_multi(piece), 4326), 6) as geo
from d where st_area(piece) > 500 order by ha desc"""

SQL_HYDRO = """
with l as (select geom from planilogix.cadastre where no_lot = %s limit 1)
select h.classe, h.type_element,
       st_asgeojson(st_transform(st_collectionextract(st_intersection(st_makevalid(h.geom), l.geom), 2), 4326), 6)
from planilogix.hydro_lits_lidar h, l
where st_intersects(h.geom, l.geom) and h.classe <> '1. Zone_interm'
  and st_length(st_intersection(st_makevalid(h.geom), l.geom)) > 40"""
# Mêmes règles que scripts/export-cartes.mjs : zones intermittentes exclues, type tel quel.

NOMS = {"SB": "sapin baumier", "EO": "érable rouge", "ES": "érable à sucre", "BG": "bouleau gris",
        "BP": "bouleau à papier", "BJ": "bouleau jaune", "EN": "épinette noire", "EB": "épinette blanche",
        "EU": "épinette rouge", "ML": "mélèze laricin", "PT": "peuplier faux-tremble", "TO": "thuya",
        "PB": "pin blanc", "PU": "pruche"}
BASE = {"SB": "Sapinière", "EO": "Érablière rouge", "ES": "Érablière", "EN": "Pessière noire",
        "EB": "Pessière blanche", "ML": "Mélézin", "BG": "Boulaie grise", "BP": "Boulaie à papier",
        "PT": "Tremblaie", "TO": "Cédrière", "FI": "Peuplement de feuillus intolérants",
        "FX": "Jeune peuplement feuillu", "RX": "Peuplement résineux", "RZ": "Peuplement résineux"}
RESINEUX = {"SB", "EN", "EB", "EU", "ML", "RX", "RZ", "PB", "PU", "TO"}


def codes(gr_ess):
    return [gr_ess[i:i + 2] for i in range(0, len(gr_ess or ""), 2)]


def appellation(p) -> str:
    cs = codes(p["gr_ess"])
    if not cs:
        return "Aire en régénération après coupe" if p["origine"] in ("CPR", "CT") else "Terrain non forestier"
    if p["origine"] == "P":
        base = "Plantation d'épinette blanche" if cs[0] == "EB" else "Plantation résineuse"
    else:
        base = BASE.get(cs[0], "Peuplement mixte")
    autres = []
    for c in cs[1:]:
        if c in NOMS and c != cs[0] and NOMS[c] not in autres:
            autres.append(NOMS[c])
    return base + (" à " + " et ".join(autres[:2]) if autres else "")


def essences(p) -> str:
    vus = []
    for c in codes(p["gr_ess"]):
        nom = NOMS.get(c, {"FX": "feuillus (jeunes)", "FI": "feuillus intolérants", "RX": "résineux", "RZ": "résineux"}.get(c))
        if nom and nom not in vus:
            vus.append(nom)
    return " / ".join(n[:1].upper() + n[1:] for n in vus)


def age_lisible(cl_age):
    return {"JIN": "Jeune inéquienne", "JIR": "Jeune irrégulière"}.get(cl_age, f"{cl_age} ans" if cl_age else None)


def recommandation(p) -> str:
    cs, age = codes(p["gr_ess"]), p["cl_age"]
    if not cs:
        return "Suivi de la régénération"
    if p["origine"] == "P":
        return "Éclaircie précommerciale" if age == "10" else "Éclaircie commerciale"
    if age == "10":
        return "Dégagement de la régénération"
    if cs[0] in RESINEUX and age in ("50", "70"):
        return "Éclaircie commerciale"
    if age in ("JIN", "JIR"):
        return "Coupe de jardinage"
    return "Éclaircie commerciale"


def lire_foret():
    cx = psycopg2.connect(ENV["PLANILOGIX_DB_URL"])
    cur = cx.cursor()
    lots, stands, hydros = [], [], []
    for no_prop, no_lot in LOTS_REELS:
        cur.execute(SQL_LOT, (no_lot,))
        ha, geo, env = cur.fetchone()
        lots.append({"no_propriete": no_prop, "no_lot": no_lot, "ha": float(ha), "geo": json.loads(geo), "env": json.loads(env)})
        cur.execute(SQL_PEUP, (no_lot,))
        cols = [d[0] for d in cur.description]
        for i, row in enumerate(cur.fetchall(), 1):
            p = dict(zip(cols, row))
            p.update(no_propriete=no_prop, no_lot=no_lot, no_peup=f"{i:02d}", ha=float(p["ha"]), geo=json.loads(p["geo"]))
            stands.append(p)
        cur.execute(SQL_HYDRO, (no_lot,))
        for classe, type_el, geo in cur.fetchall():
            hydros.append({"classe": classe, "type": type_el, "geo": json.loads(geo)})
    cx.close()
    return lots, stands, hydros


LOTS_GEO, STANDS, HYDROS = lire_foret()


def boise(p) -> bool:
    return bool(p["gr_ess"]) or p["origine"] in ("CPR", "CT", "P")


def premier(filtre):
    return next(p for p in STANDS if filtre(p))


# Interventions FICTIVES posées sur de vrais peuplements du lot 01.
S_EPC = premier(lambda p: p["origine"] == "P" and p["no_propriete"] == "01")
S_EC = premier(lambda p: codes(p["gr_ess"])[:1] == ["SB"] and p["cl_age"] == "50" and p["no_propriete"] == "01")
S_JARD = premier(lambda p: codes(p["gr_ess"])[:1] == ["EO"] and p["cl_age"] in ("JIN", "JIR") and p["no_propriete"] == "01")


def no_presc(annee2: str, rang: int) -> str:
    return f"{AGENCE}80{annee2}{rang:04d}"


PRS_EPC, PRS_EC, PRS_JARD = no_presc("24", 7), no_presc("25", 12), no_presc("26", 3)
PRESCRIPTIONS = [
    (PRS_EPC, "2024", "réalisée", "ÉCLAIRCIE PRÉCOMMERCIALE - PLANTATION RÉSINEUSE", S_EPC, "2024-06-18"),
    (PRS_EC, "2025", "réalisée", "ÉCLAIRCIE COMMERCIALE - SAPINIÈRE", S_EC, "2025-08-26"),
    (PRS_JARD, "2026", "demande", "COUPE DE JARDINAGE - ÉRABLIÈRE ROUGE", S_JARD, "2026-09-10"),
]

# ------------------------------------------------------------------- carte
features = []
for l in LOTS_GEO:
    features.append({"type": "Feature", "geometry": l["geo"], "properties": {"couche": "propriete"}})
for p in STANDS:
    props = {"couche": "peuplement", "source": "eco", "no_peup": p["no_peup"], "appellation": appellation(p).upper(),
             "essences": essences(p), "gr_ess": p["gr_ess"], "cl_dens": p["cl_dens"],
             "densite": {"A": "80-100%", "B": "60-80%", "C": "40-60%", "D": "25-40%"}.get(p["cl_dens"]),
             "hauteur_m": {"1": "24", "2": "19", "3": "15", "4": "10", "5": "6", "6": "3"}.get(p["cl_haut"]),
             "classe_age": age_lisible(p["cl_age"]), "cl_age_eco": p["cl_age"], "type_eco": p["type_eco"],
             "region_eco": p["region_eco"], "an_origine": int(p["an_origine"]) if p["an_origine"] else None,
             "perturbation": {"P": "Plantation", "CT": "Coupe totale", "CPR": "Coupe avec protection de la régénération"}.get(p["origine"]),
             "traitements_rec": recommandation(p), "superficie_ha": p["ha"], "hectares": p["ha"],
             "peuplement_heterogene": False, "analyse_absente": False}
    features.append({"type": "Feature", "geometry": p["geo"], "properties": {k: v for k, v in props.items() if v is not None}})
for h in HYDROS:
    features.append({"type": "Feature", "geometry": h["geo"], "properties": {
        "couche": "hydro", "classe": h["classe"], "type": h["type"]}})
for no, an, statut, trait, s, date in PRESCRIPTIONS:
    features.append({"type": "Feature", "geometry": s["geo"], "properties": {
        "couche": "prescription", "no_prescription": no, "annee": an, "statut": statut, "traitement": trait,
        "lots": s["no_lot"].replace(" ", ""), "hectares": s["ha"], "date_rapport": date}})
for no, an, statut, trait, s, date in PRESCRIPTIONS[:2]:
    features.append({"type": "Feature", "geometry": s["geo"], "properties": {
        "couche": "travaux", "no_prescription": no, "annee": an, "traitement": trait, "hectares": s["ha"]}})

lons = [c[0] for l in LOTS_GEO for c in l["env"]["coordinates"][0]]
lats = [c[1] for l in LOTS_GEO for c in l["env"]["coordinates"][0]]
BBOX = [min(lons), min(lats), max(lons), max(lats)]

# ---------------------------------------------------------- tables du portail
def ha_boise(no_prop):
    return round(sum(p["ha"] for p in STANDS if p["no_propriete"] == no_prop and boise(p)), 2)


PROPRIETES = [
    {"id": 900001 + i, "producteur_id": PID, "no_propriete": l["no_propriete"], "municipalite": MUNICIPALITE,
     "mrc": MRC, "region": REGION, "superficie_totale": l["ha"], "superficie_boisee": ha_boise(l["no_propriete"])}
    for i, l in enumerate(LOTS_GEO)
]
LOTS = [
    {"id": 900001 + i, "propriete_id": 900001 + i, "no_lot": l["no_lot"], "municipalite": MUNICIPALITE,
     "mrc": MRC, "superficie_totale": l["ha"], "superficie_boisee": ha_boise(l["no_propriete"])}
    for i, l in enumerate(LOTS_GEO)
]
PAF = [
    {"id": 900001 + i, "propriete_id": 900001 + i, "no_plan": f"{AGENCE}8021{5 + i:04d}", "date_plan": "2021-05-12",
     "date_echeance": "2031-05-12", "statut_courant": "À jour", "progression": 52 if i == 0 else 30}
    for i in range(len(LOTS_GEO))
]
TRAVAUX = [
    {"id": 900001, "producteur_id": PID, "type_travaux": "Éclaircie précommerciale", "no_lot": S_EPC["no_lot"],
     "surface": fmt_ha(S_EPC["ha"]), "date_travaux": "Septembre 2024", "statut": "Terminé"},
    {"id": 900002, "producteur_id": PID, "type_travaux": "Éclaircie commerciale", "no_lot": S_EC["no_lot"],
     "surface": fmt_ha(S_EC["ha"]), "date_travaux": "Octobre 2025", "statut": "Terminé"},
    {"id": 900003, "producteur_id": PID, "type_travaux": "Coupe de jardinage", "no_lot": S_JARD["no_lot"],
     "surface": fmt_ha(S_JARD["ha"]), "date_travaux": "Hiver 2026-2027", "statut": "Planifié"},
]
BILAN = {"producteur_id": PID, "total_valeur": 21840, "total_aide": 17950, "total_part": 3890,
         "superficie_ha": round(S_EPC["ha"] + S_EC["ha"], 2), "nb_traitements": 4, "annee_min": 2023, "annee_max": 2025}

DOCUMENTS = [
    (f"paf_{PAF[0]['no_plan']}.pdf", "plans", "paf", f"Plan d'aménagement forestier 2021 (nº {PAF[0]['no_plan']})", "2021", None, "paf0"),
    (f"paf_{PAF[1]['no_plan']}.pdf", "plans", "paf", f"Plan d'aménagement forestier 2021 (nº {PAF[1]['no_plan']})", "2021", None, "paf1"),
    (f"prs_{PRS_EPC}.pdf", "prescriptions", "prescription", "Prescription sylvicole 2024", "2024", PRS_EPC, "prs0"),
    (f"prs_{PRS_EC}.pdf", "prescriptions", "prescription", "Prescription sylvicole 2025", "2025", PRS_EC, "prs1"),
    (f"prs_{PRS_EC}_v2.pdf", "prescriptions", "prescription", "Prescription sylvicole 2025 (version 2)", "2025", PRS_EC, "prs1v2"),
    (f"prs_{PRS_JARD}.pdf", "prescriptions", "prescription", "Prescription sylvicole 2026", "2026", PRS_JARD, "prs2"),
    (f"rap_{PRS_EPC}_24101.pdf", "rapports", "rapport", "Rapport d'exécution, octobre 2024", "2024", PRS_EPC, "rap0"),
    (f"rap_{PRS_EC}_25111.pdf", "rapports", "rapport", "Rapport d'exécution, novembre 2025", "2025", PRS_EC, "rap1"),
    (f"rtf_{NO_PROD.lower()}_2024.pdf", "taxes", "rtf", "Rapport de taxes foncières 2024", "2024", None, "rtf2024"),
    (f"rtf_{NO_PROD.lower()}_2025.pdf", "taxes", "rtf", "Rapport de taxes foncières 2025", "2025", None, "rtf2025"),
]

# ---------------------------------------------------------------------- PDF
VERT = (20 / 255, 51 / 255, 26 / 255)
GRIS = (0.35, 0.38, 0.34)
FICTIF = "Exemple fictif, à des fins de démonstration de l'espace client CFRQ. Propriétaire et interventions inventés."


def page_type(doc, titre, sous_titre):
    p = doc.new_page(width=612, height=792)
    p.draw_rect(fitz.Rect(0, 0, 612, 64), color=None, fill=VERT)
    if LOGO.exists():
        p.insert_image(fitz.Rect(36, 14, 146, 52), filename=str(LOGO))
    p.insert_text((380, 30), "Conseillers Forestiers de la", fontsize=8.5, color=(1, 1, 1), fontname="helv")
    p.insert_text((380, 42), "Région de Québec inc.", fontsize=8.5, color=(1, 1, 1), fontname="helv")
    p.insert_text((36, 100), titre, fontsize=19, color=VERT, fontname="hebo")
    p.insert_text((36, 120), sous_titre, fontsize=10.5, color=GRIS, fontname="helv")
    p.draw_line((36, 132), (576, 132), color=(0.8, 0.85, 0.78), width=0.8)
    p.insert_text((36, 770), FICTIF, fontsize=7.5, color=(0.55, 0.55, 0.55), fontname="helv")
    return p


def lignes(p, y, paires, x_val=190):
    for cle, val in paires:
        p.insert_text((36, y), cle, fontsize=10, color=GRIS, fontname="helv")
        p.insert_text((x_val, y), str(val), fontsize=10, color=(0.1, 0.1, 0.1), fontname="helv")
        y += 17
    return y


def tableau(p, y, entetes, rangees, largeurs):
    x = 36
    p.draw_rect(fitz.Rect(36, y - 12, 576, y + 5), color=None, fill=(0.93, 0.96, 0.91))
    for h, w in zip(entetes, largeurs):
        p.insert_text((x + 3, y), h, fontsize=8.5, color=VERT, fontname="hebo")
        x += w
    y += 17
    for r in rangees:
        x = 36
        for v, w in zip(r, largeurs):
            p.insert_textbox(fitz.Rect(x + 3, y - 10, x + w - 3, y + 12), str(v), fontsize=8, fontname="helv")
            x += w
        p.draw_line((36, y + 7), (576, y + 7), color=(0.9, 0.9, 0.9), width=0.5)
        y += 20
    return y


def signature(p, y):
    p.insert_text((36, y), "Préparé par : Conseillers Forestiers de la Région de Québec inc.", fontsize=10, fontname="helv")
    p.insert_text((36, y + 17), "Ingénieur forestier : (signature, exemple fictif)", fontsize=10, color=GRIS, fontname="helv")


def pdf_paf(i):
    prop, paf = PROPRIETES[i], PAF[i]
    peups = [p for p in STANDS if p["no_propriete"] == prop["no_propriete"]]
    doc = fitz.open()
    p = page_type(doc, "Plan d'aménagement forestier", f"Plan nº {paf['no_plan']}  ·  en vigueur du 12 mai 2021 au 12 mai 2031")
    y = lignes(p, 160, [
        ("Propriétaire", "Jean Tremblay"), ("Numéro de producteur", NO_PROD),
        ("Propriété", f"{prop['no_propriete']}, {MUNICIPALITE} (MRC de {MRC})"),
        ("Lot", LOTS[i]["no_lot"]), ("Superficie totale", fmt_ha(prop["superficie_totale"])),
        ("Superficie boisée", fmt_ha(prop["superficie_boisee"])),
        ("Objectifs du propriétaire", "Production de bois de qualité, mise en valeur de l'érablière rouge, protection des cours d'eau"),
    ])
    p.insert_text((36, y + 20), "Description des peuplements", fontsize=13, color=VERT, fontname="hebo")
    rangees = [(s["no_peup"], appellation(s), f"{s['ha']:.1f}".replace(".", ","), age_lisible(s["cl_age"]) or "-",
                s["cl_dens"] or "-", recommandation(s)) for s in peups[:16]]
    y = tableau(p, y + 48, ["Nº", "Appellation", "Ha", "Âge", "Dens.", "Recommandation"], rangees, [26, 214, 38, 92, 36, 134])
    if i == 0:
        p2 = page_type(doc, "Plan d'aménagement forestier", f"Plan nº {paf['no_plan']}  ·  plan des interventions")
        y2 = tableau(p2, 170, ["Période", "Intervention", "Peuplement"], [
            ("2023-2024", "Éclaircie précommerciale", S_EPC["no_peup"]), ("2025", "Éclaircie commerciale", S_EC["no_peup"]),
            ("2026-2027", "Coupe de jardinage", S_JARD["no_peup"]), ("2028-2031", "Dégagement des jeunes peuplements", "au besoin")],
            [110, 280, 150])
        signature(p2, y2 + 40)
    else:
        signature(p, y + 30)
    return doc


def pdf_prescription(no, traitement, s, annee, version=None, ha=None):
    doc = fitz.open()
    p = page_type(doc, "Prescription sylvicole", f"Nº {no}" + (f"  ·  {version}" if version else ""))
    y = lignes(p, 160, [
        ("Propriétaire", "Jean Tremblay"), ("Numéro de producteur", NO_PROD), ("Lot", s["no_lot"]),
        ("Peuplement", f"{s['no_peup']} : {appellation(s)}"), ("Traitement prescrit", traitement),
        ("Superficie", fmt_ha(ha or s["ha"])), ("Année d'exécution prévue", annee),
        ("Programme", "Programme d'aide à la mise en valeur des forêts privées"),
    ])
    p.insert_text((36, y + 20), "Diagnostic et objectifs", fontsize=13, color=VERT, fontname="hebo")
    p.insert_textbox(fitz.Rect(36, y + 32, 576, y + 140),
                     "Peuplement dense dont la croissance ralentit par la compétition entre les tiges. Le traitement vise "
                     "à retirer les tiges de moindre qualité pour concentrer la croissance sur les meilleures, en conservant "
                     "une bande de protection de 20 m le long des cours d'eau." + (" Version révisée : ajustement de la "
                     "superficie après martelage." if version else ""), fontsize=10, fontname="helv")
    signature(p, y + 170)
    return doc


def pdf_rapport(no, traitement, s, mois):
    doc = fitz.open()
    p = page_type(doc, "Rapport d'exécution", f"Prescription nº {no}  ·  travaux terminés en {mois}")
    y = lignes(p, 160, [
        ("Propriétaire", "Jean Tremblay"), ("Lot", s["no_lot"]), ("Traitement réalisé", traitement),
        ("Superficie réalisée", fmt_ha(s["ha"])), ("Conformité", "Conforme à la prescription"),
        ("Vérification terrain", f"Effectuée en {mois}"),
    ])
    signature(p, y + 30)
    return doc


def pdf_rtf(annee, depenses, taxes):
    doc = fitz.open()
    p = page_type(doc, "Rapport de taxes foncières", f"Année d'imposition {annee}  ·  remboursement des taxes foncières des producteurs forestiers")
    remb = round(min(depenses, taxes) * 0.85)
    y = lignes(p, 160, [
        ("Producteur forestier reconnu", f"Jean Tremblay ({NO_PROD})"),
        ("Taxes foncières admissibles", f"{taxes:,} $".replace(",", " ")),
        ("Dépenses d'aménagement admissibles", f"{depenses:,} $".replace(",", " ")),
        ("Remboursement (85 %)", f"{remb:,} $".replace(",", " ")),
    ], x_val=250)
    signature(p, y + 30)
    return doc


def generer(cle):
    return {
        "paf0": lambda: pdf_paf(0), "paf1": lambda: pdf_paf(1),
        "prs0": lambda: pdf_prescription(PRS_EPC, "Éclaircie précommerciale, plantation résineuse", S_EPC, "2024"),
        "prs1": lambda: pdf_prescription(PRS_EC, "Éclaircie commerciale, sapinière", S_EC, "2025", ha=S_EC["ha"] + 0.6),
        "prs1v2": lambda: pdf_prescription(PRS_EC, "Éclaircie commerciale, sapinière", S_EC, "2025", "version 2"),
        "prs2": lambda: pdf_prescription(PRS_JARD, "Coupe de jardinage, érablière rouge", S_JARD, "2026-2027"),
        "rap0": lambda: pdf_rapport(PRS_EPC, "Éclaircie précommerciale, plantation résineuse", S_EPC, "octobre 2024"),
        "rap1": lambda: pdf_rapport(PRS_EC, "Éclaircie commerciale, sapinière", S_EC, "novembre 2025"),
        "rtf2024": lambda: pdf_rtf("2024", 6120, 1480),
        "rtf2025": lambda: pdf_rtf("2025", 9340, 1530),
    }[cle]()


# --------------------------------------------------------------------- Supabase
def rest(methode, table, **kw):
    r = requests.request(methode, f"{URL}/rest/v1/{table}", headers={**H, "Content-Type": "application/json",
                         "Prefer": "resolution=merge-duplicates,return=minimal"}, timeout=60, **kw)
    if r.status_code >= 300:
        raise SystemExit(f"{methode} {table} : {r.status_code} {r.text[:300]}")
    return r


def vider():
    ids_prop = ",".join(str(900001 + i) for i in range(4))
    for table, filtre in [("documents", f"producteur_id=eq.{PID}"), ("travaux", f"producteur_id=eq.{PID}"),
                          ("paf", f"propriete_id=in.({ids_prop})"), ("lots", f"propriete_id=in.({ids_prop})"),
                          ("cartes", f"producteur_id=eq.{PID}"), ("bilan_investissement", f"producteur_id=eq.{PID}"),
                          ("proprietes", f"producteur_id=eq.{PID}")]:
        rest("DELETE", f"{table}?{filtre}")
    r = requests.post(f"{URL}/storage/v1/object/list/documents", headers=H, timeout=60, json={"prefix": f"{PID}/", "limit": 1000})
    for dossier in [o["name"] for o in r.json()]:
        r2 = requests.post(f"{URL}/storage/v1/object/list/documents", headers=H, timeout=60,
                           json={"prefix": f"{PID}/{dossier}/", "limit": 1000})
        chemins = [f"{PID}/{dossier}/{o['name']}" for o in r2.json()]
        if chemins:
            requests.delete(f"{URL}/storage/v1/object/documents", headers=H, json={"prefixes": chemins}, timeout=60)


def creer():
    vider()
    rest("POST", "producteurs", json=[{"id": PID, "nom": NOM, "no_prod": NO_PROD, "statut": "PRTF Oui", "type_proprio": "Particulier",
                                     "nom_salutation": "Jean Tremblay"}])
    rest("POST", "proprietes", json=PROPRIETES)
    rest("POST", "lots", json=LOTS)
    rest("POST", "paf", json=PAF)
    rest("POST", "travaux", json=TRAVAUX)
    rest("POST", "cartes", json=[{"producteur_id": PID, "geojson": {"type": "FeatureCollection", "features": features},
                                  "bbox": BBOX, "nb_features": len(features)}])
    rest("POST", "bilan_investissement", json=[BILAN])
    lignes_docs = []
    for i, (fichier, dossier, type_doc, nom, annee, ref, gen) in enumerate(DOCUMENTS):
        chemin = f"{PID}/{dossier}/{fichier}"
        contenu = generer(gen).tobytes()
        r = requests.post(f"{URL}/storage/v1/object/documents/{chemin}", data=contenu, timeout=60,
                          headers={**H, "Content-Type": "application/pdf", "x-upsert": "true"})
        if r.status_code >= 300:
            raise SystemExit(f"téléversement {chemin} : {r.status_code} {r.text[:200]}")
        lignes_docs.append({"id": 900001 + i, "producteur_id": PID, "type_document": type_doc, "nom_document": nom,
                            "date_document": annee, "reference": ref, "storage_path": chemin,
                            "taille": f"{max(1, round(len(contenu) / 1024))} Ko"})
    rest("POST", "documents", json=lignes_docs)
    print(f"Client démo prêt : {NOM} ({NO_PROD}), producteur {PID}, {MUNICIPALITE}")
    for pr, l in zip(PROPRIETES, LOTS_GEO):
        print(f"  propriété {pr['no_propriete']} : lot {l['no_lot']}, {pr['superficie_totale']} ha dont {pr['superficie_boisee']} boisés")
    print(f"  {len(STANDS)} peuplements, {len(HYDROS)} tronçons de cours d'eau, {len(features)} éléments de carte,")
    print(f"  interventions sur : {appellation(S_EPC)} ({S_EPC['ha']} ha), {appellation(S_EC)} ({S_EC['ha']} ha), {appellation(S_JARD)} ({S_JARD['ha']} ha)")
    print(f"  {len(TRAVAUX)} travaux, {len(PAF)} plans, {len(lignes_docs)} documents PDF.")


def relier(courriel):
    r = requests.get(f"{URL}/auth/v1/admin/users", headers=H, params={"per_page": 1000}, timeout=60)
    users = r.json().get("users", [])
    u = next((x for x in users if (x.get("email") or "").lower() == courriel.lower()), None)
    if not u:
        raise SystemExit(f"Aucun compte {courriel} : le créer d'abord dans Supabase (Authentication > Users > Add user).")
    rest("POST", "portal_users", json=[{"user_id": u["id"], "producteur_id": PID, "actif": True}])
    print(f"{courriel} relié au client démo ({PID}).")


if __name__ == "__main__":
    if "--relier" in sys.argv:
        relier(sys.argv[sys.argv.index("--relier") + 1])
    elif "--apercu" in sys.argv:
        dossier = pathlib.Path(sys.argv[sys.argv.index("--apercu") + 1])
        for cle in ["paf0", "prs1v2"]:
            generer(cle).save(dossier / f"demo_{cle}.pdf")
        print(json.dumps({"proprietes": [(p["no_propriete"], p["superficie_totale"], p["superficie_boisee"]) for p in PROPRIETES],
                          "peuplements": [(s["no_propriete"], s["no_peup"], appellation(s), s["ha"]) for s in STANDS],
                          "hydro": len(HYDROS), "bbox": BBOX}, ensure_ascii=False, indent=1))
    else:
        creer()
