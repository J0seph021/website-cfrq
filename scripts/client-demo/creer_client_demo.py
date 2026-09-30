"""
Client de démonstration de l'espace client : Jean Tremblay, Saint-Raymond.

Crée (ou remet à neuf) un dossier ENTIÈREMENT FICTIF dans le projet Supabase de
l'espace client, pour présenter le portail avec des données qui ont l'air vraies :
producteur, 2 propriétés, lots, carte (peuplements, ruisseau, prescriptions,
travaux), plan d'aménagement, travaux, bilan des investissements et 10 PDF.

Ne crée PAS de compte de connexion : un humain le crée dans Supabase
(Authentication > Users > Add user, « Auto Confirm User »), puis on le relie au
dossier avec --relier <courriel>.

    python scripts/client-demo/creer_client_demo.py                 # crée / remet à neuf
    python scripts/client-demo/creer_client_demo.py --relier x@y.ca # relie le compte

Identifiants 900001 et plus : très au-dessus des vrais, jamais touchés par
sync-documents, export-cartes ni export-bilans (qui ne visent que les producteurs
de PlaniLogix). Lit SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans scripts/.env.
"""
import math
import pathlib
import sys

import fitz  # PyMuPDF
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
AGENCE = "12399"  # préfixe fictif des numéros de prescription (aucune agence réelle)


def no_presc(annee2: str, rang: int) -> str:
    return f"{AGENCE}80{annee2}{rang:04d}"


# --------------------------------------------------------------------- géométrie
# Coordonnées fictives au nord de Saint-Raymond. Mètres -> degrés à cette latitude.
LAT0 = 46.935
M_LAT = 111_320.0
M_LON = 111_320.0 * math.cos(math.radians(LAT0))


def pt(x_m: float, y_m: float, lon0: float, lat0: float):
    return [round(lon0 + x_m / M_LON, 6), round(lat0 + y_m / M_LAT, 6)]


def poly(sommets_m, lon0, lat0):
    anneau = [pt(x, y, lon0, lat0) for x, y in sommets_m]
    return {"type": "Polygon", "coordinates": [anneau + [anneau[0]]]}


def aire_ha(sommets_m) -> float:
    s = 0.0
    for (x1, y1), (x2, y2) in zip(sommets_m, sommets_m[1:] + sommets_m[:1]):
        s += x1 * y2 - x2 * y1
    return round(abs(s) / 2 / 10_000, 2)


# Propriété 01 (~58 ha) découpée en 5 peuplements qui partagent leurs limites.
P1 = (-71.905, LAT0)
P1_CONTOUR = [(0, 0), (520, -20), (760, 30), (780, 420), (740, 760), (300, 790), (-10, 740), (-30, 350)]
P1_PEUP = [
    ("01", [(0, 0), (520, -20), (500, 330), (-20, 350)], dict(
        appellation="ÉRABLIÈRE À BOULEAU JAUNE", gr_ess="ErBj", essences="Érable à sucre / Bouleau jaune / Hêtre",
        cl_dens="B", densite="60-80%", hauteur_m="21", an_origine=1952, classe_age="70", cl_age_eco="70",
        type_eco="FE32", perturbation=None, traitements_rec="Coupe de jardinage", priorite="2",
        vmb_ha_reel=168.4, composition={"ERS": 61.2, "BOJ": 22.4, "HEG": 9.1, "SAB": 3.8})),
    ("02", [(520, -20), (760, 30), (770, 320), (500, 330)], dict(
        appellation="PLANTATION D'ÉPINETTE BLANCHE", gr_ess="EbEb", essences="Épinette blanche",
        cl_dens="A", densite="80-100%", hauteur_m="9", an_origine=2009, classe_age="15", cl_age_eco="10",
        type_eco="MS22", perturbation="Plantation", traitements_rec="Éclaircie précommerciale", priorite="1",
        vmb_ha_reel=38.0, composition={"EPB": 88.0, "SAB": 6.5, "ERR": 5.5})),
    ("03", [(-20, 350), (500, 330), (520, 560), (0, 580)], dict(
        appellation="SAPINIÈRE À BOULEAU BLANC", gr_ess="SBb", essences="Sapin baumier / Bouleau blanc / Épinette rouge",
        cl_dens="B", densite="60-80%", hauteur_m="15", an_origine=1976, classe_age="50", cl_age_eco="50",
        type_eco="MS23", perturbation=None, traitements_rec="Éclaircie commerciale", priorite="1",
        vmb_ha_reel=142.7, composition={"SAB": 48.3, "BOP": 27.6, "EPR": 14.2, "ERR": 9.9})),
    ("04", [(500, 330), (770, 320), (740, 760), (520, 560)], dict(
        appellation="PEUPLERAIE À ÉRABLE ROUGE", gr_ess="PeEr", essences="Peuplier faux-tremble / Érable rouge",
        cl_dens="C", densite="40-60%", hauteur_m="17", an_origine=1971, classe_age="50", cl_age_eco="50",
        type_eco="MS22", perturbation=None, traitements_rec="Coupe progressive d'ensemencement", priorite="3",
        vmb_ha_reel=121.3, composition={"PET": 57.4, "ERR": 31.1, "SAB": 11.5})),
    ("05", [(0, 580), (520, 560), (740, 760), (300, 790), (-10, 740)], dict(
        appellation="AGRICOLE ABANDONNÉ", gr_ess=None, essences="Friche en régénération (aulne, épinette blanche)",
        cl_dens=None, densite=None, hauteur_m="2", an_origine=None, classe_age="0", cl_age_eco=None,
        type_eco=None, perturbation="Friche", traitements_rec="Reboisement d'enrichissement", priorite="2",
        vmb_ha_reel=None, composition=None)),
]

# Propriété 02 (~22 ha), 1,4 km à l'est, 2 peuplements.
P2 = (-71.905 + 1400 / M_LON, LAT0 + 200 / M_LAT)
P2_CONTOUR = [(0, 0), (480, 10), (470, 450), (10, 460)]
P2_PEUP = [
    ("01", [(0, 0), (480, 10), (475, 240), (5, 235)], dict(
        appellation="CÉDRIÈRE", gr_ess="Ce", essences="Thuya occidental / Sapin baumier / Frêne noir",
        cl_dens="B", densite="60-80%", hauteur_m="14", an_origine=1946, classe_age="90", cl_age_eco="90",
        type_eco="RC38", perturbation=None, traitements_rec="Maintien : milieu humide à protéger", priorite="3",
        vmb_ha_reel=131.9, composition={"THO": 71.4, "SAB": 17.2, "FRN": 11.4})),
    ("02", [(5, 235), (475, 240), (470, 450), (10, 460)], dict(
        appellation="ÉRABLIÈRE À ÉRABLE ROUGE", gr_ess="ErEr", essences="Érable rouge / Érable à sucre / Bouleau jaune",
        cl_dens="B", densite="60-80%", hauteur_m="18", an_origine=1966, classe_age="50", cl_age_eco="50",
        type_eco="MJ12", perturbation=None, traitements_rec="Éclaircie commerciale", priorite="2",
        vmb_ha_reel=139.5, composition={"ERR": 52.8, "ERS": 28.1, "BOJ": 19.1})),
]


def peuplements(contour_origine, peups):
    out = []
    for no, sommets, attr in peups:
        ha = aire_ha(sommets)
        props = {"couche": "peuplement", "source": "paf", "no_peup": no, "superficie_ha": ha,
                 "hectares": ha, "region_eco": "4d", "peuplement_heterogene": False,
                 "heterogene_nb_types": 1, "heterogene_ecart_age": 0, "analyse_absente": False,
                 "analyse_couverture_pct": 96}
        props.update({k: v for k, v in attr.items() if v is not None})
        if attr.get("vmb_ha_reel"):
            props["volume_m3_ha"] = attr["vmb_ha_reel"]
            props["volume_total_m3"] = round(attr["vmb_ha_reel"] * ha)
        out.append((props, sommets))
    return [{"type": "Feature", "geometry": poly(s, *contour_origine), "properties": p} for p, s in out]


def forest_ha(peups) -> float:
    return round(sum(aire_ha(s) for _, s, a in peups if not str(a["appellation"]).startswith("AGRICOLE")), 1)


# Prescriptions et travaux (sous-parties des peuplements).
PRS_EC_2024 = no_presc("24", 7)   # éclaircie précommerciale, plantation 02
PRS_EC_2025 = no_presc("25", 12)  # éclaircie commerciale, sapinière 03
PRS_JARD_2026 = no_presc("26", 3)  # jardinage demandé, érablière 01

features = []
features.append({"type": "Feature", "geometry": poly(P1_CONTOUR, *P1), "properties": {"couche": "propriete"}})
features.append({"type": "Feature", "geometry": poly(P2_CONTOUR, *P2), "properties": {"couche": "propriete"}})
features += peuplements(P1, P1_PEUP) + peuplements(P2, P2_PEUP)
features.append({"type": "Feature", "properties": {"couche": "hydro", "type": "Ruisseau intermittent", "classe": "2. Intermittent"},
                 "geometry": {"type": "LineString", "coordinates": [pt(x, y, *P1) for x, y in [(-30, 470), (180, 430), (330, 470), (520, 450), (700, 520), (760, 600)]]}})
features.append({"type": "Feature", "properties": {"couche": "hydro", "type": "Ruisseau permanent", "classe": "4. Permanent"},
                 "geometry": {"type": "LineString", "coordinates": [pt(x, y, *P2) for x, y in [(0, 120), (160, 150), (300, 110), (480, 140)]]}})
PRESCRIPTIONS = [
    (PRS_EC_2024, "2024", "réalisée", "ÉCLAIRCIE PRÉCOMMERCIALE - RÉSINEUX", "5 612 387", P1, [(540, 10), (740, 40), (750, 300), (530, 310)], "2024-06-18"),
    (PRS_EC_2025, "2025", "réalisée", "ÉCLAIRCIE COMMERCIALE - SAPINIÈRE", "5 612 384", P1, [(10, 370), (480, 350), (500, 540), (20, 560)], "2025-08-26"),
    (PRS_JARD_2026, "2026", "demande", "COUPE DE JARDINAGE - ÉRABLIÈRE", "5 612 384", P1, [(30, 20), (480, 10), (470, 300), (20, 320)], "2026-09-10"),
]
for no, an, statut, trait, lot, orig, som, date in PRESCRIPTIONS:
    features.append({"type": "Feature", "geometry": poly(som, *orig), "properties": {
        "couche": "prescription", "no_prescription": no, "annee": an, "statut": statut, "traitement": trait,
        "lots": lot.replace(" ", ""), "hectares": aire_ha(som), "date_rapport": date}})
for no, an, statut, trait, lot, orig, som, date in PRESCRIPTIONS[:2]:
    features.append({"type": "Feature", "geometry": poly(som, *orig), "properties": {
        "couche": "travaux", "no_prescription": no, "annee": an, "traitement": trait, "hectares": aire_ha(som)}})

tous = [c for f in features if f["geometry"]["type"] == "Polygon" for c in f["geometry"]["coordinates"][0]]
BBOX = [min(c[0] for c in tous), min(c[1] for c in tous), max(c[0] for c in tous), max(c[1] for c in tous)]

# ------------------------------------------------------------------- données
HA_P1, HA_P2 = aire_ha(P1_CONTOUR), aire_ha(P2_CONTOUR)
PROPRIETES = [
    {"id": 900001, "producteur_id": PID, "no_propriete": "01", "municipalite": "Saint-Raymond", "mrc": "Portneuf",
     "region": "Capitale-Nationale", "superficie_totale": HA_P1, "superficie_boisee": forest_ha(P1_PEUP)},
    {"id": 900002, "producteur_id": PID, "no_propriete": "02", "municipalite": "Saint-Léonard-de-Portneuf", "mrc": "Portneuf",
     "region": "Capitale-Nationale", "superficie_totale": HA_P2, "superficie_boisee": forest_ha(P2_PEUP)},
]
LOTS = [
    {"id": 900001, "propriete_id": 900001, "no_lot": "5 612 384", "municipalite": "Saint-Raymond", "mrc": "Portneuf", "superficie_totale": round(HA_P1 * 0.58, 2)},
    {"id": 900002, "propriete_id": 900001, "no_lot": "5 612 387", "municipalite": "Saint-Raymond", "mrc": "Portneuf", "superficie_totale": round(HA_P1 * 0.42, 2)},
    {"id": 900003, "propriete_id": 900002, "no_lot": "5 613 002", "municipalite": "Saint-Léonard-de-Portneuf", "mrc": "Portneuf", "superficie_totale": HA_P2},
]
PAF = [
    {"id": 900001, "propriete_id": 900001, "no_plan": f"{AGENCE}80210005", "date_plan": "2021-05-12", "date_echeance": "2031-05-12", "statut_courant": "À jour", "progression": 52},
    {"id": 900002, "propriete_id": 900002, "no_plan": f"{AGENCE}80210006", "date_plan": "2021-05-12", "date_echeance": "2031-05-12", "statut_courant": "À jour", "progression": 30},
]
TRAVAUX = [
    {"id": 900001, "producteur_id": PID, "type_travaux": "Éclaircie précommerciale", "no_lot": "5 612 387", "surface": f"{aire_ha(PRESCRIPTIONS[0][6]):.1f} ha".replace(".", ","), "date_travaux": "Septembre 2024", "statut": "Terminé"},
    {"id": 900002, "producteur_id": PID, "type_travaux": "Éclaircie commerciale", "no_lot": "5 612 384", "surface": f"{aire_ha(PRESCRIPTIONS[1][6]):.1f} ha".replace(".", ","), "date_travaux": "Octobre 2025", "statut": "Terminé"},
    {"id": 900003, "producteur_id": PID, "type_travaux": "Coupe de jardinage", "no_lot": "5 612 384", "surface": f"{aire_ha(PRESCRIPTIONS[2][6]):.1f} ha".replace(".", ","), "date_travaux": "Hiver 2026-2027", "statut": "Planifié"},
]
BILAN = {"producteur_id": PID, "total_valeur": 21840, "total_aide": 17950, "total_part": 3890,
         "superficie_ha": round(aire_ha(PRESCRIPTIONS[0][6]) + aire_ha(PRESCRIPTIONS[1][6]), 2),
         "nb_traitements": 4, "annee_min": 2023, "annee_max": 2025}

# (fichier, dossier, type, nom affiché, année, référence, générateur)
DOCUMENTS = [
    (f"paf_{AGENCE}80210005.pdf", "plans", "paf", f"Plan d'aménagement forestier 2021 (nº {AGENCE}80210005)", "2021", None, "paf1"),
    (f"paf_{AGENCE}80210006.pdf", "plans", "paf", f"Plan d'aménagement forestier 2021 (nº {AGENCE}80210006)", "2021", None, "paf2"),
    (f"prs_{PRS_EC_2024}.pdf", "prescriptions", "prescription", "Prescription sylvicole 2024", "2024", PRS_EC_2024, "prs0"),
    (f"prs_{PRS_EC_2025}.pdf", "prescriptions", "prescription", "Prescription sylvicole 2025", "2025", PRS_EC_2025, "prs1"),
    (f"prs_{PRS_EC_2025}_v2.pdf", "prescriptions", "prescription", "Prescription sylvicole 2025 (version 2)", "2025", PRS_EC_2025, "prs1v2"),
    (f"prs_{PRS_JARD_2026}.pdf", "prescriptions", "prescription", "Prescription sylvicole 2026", "2026", PRS_JARD_2026, "prs2"),
    (f"rap_{PRS_EC_2024}_24101.pdf", "rapports", "rapport", "Rapport d'exécution, octobre 2024", "2024", PRS_EC_2024, "rap0"),
    (f"rap_{PRS_EC_2025}_25111.pdf", "rapports", "rapport", "Rapport d'exécution, novembre 2025", "2025", PRS_EC_2025, "rap1"),
    (f"rtf_{NO_PROD.lower()}_2024.pdf", "taxes", "rtf", "Rapport de taxes foncières 2024", "2024", None, "rtf2024"),
    (f"rtf_{NO_PROD.lower()}_2025.pdf", "taxes", "rtf", "Rapport de taxes foncières 2025", "2025", None, "rtf2025"),
]

# ---------------------------------------------------------------------- PDF
VERT = (20 / 255, 51 / 255, 26 / 255)
GRIS = (0.35, 0.38, 0.34)
FICTIF = "Exemple fictif, à des fins de démonstration de l'espace client CFRQ. Aucune donnée réelle."


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


def lignes(p, y, paires, x_val=210):
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
            p.insert_textbox(fitz.Rect(x + 3, y - 10, x + w - 3, y + 12), str(v), fontsize=8.5, fontname="helv")
            x += w
        p.draw_line((36, y + 7), (576, y + 7), color=(0.9, 0.9, 0.9), width=0.5)
        y += 22
    return y


def signature(p, y):
    p.insert_text((36, y), "Préparé par : Conseillers Forestiers de la Région de Québec inc.", fontsize=10, fontname="helv")
    p.insert_text((36, y + 17), "Ingénieur forestier : (signature, exemple fictif)", fontsize=10, color=GRIS, fontname="helv")


def pdf_paf(propriete, lots, peups, no_plan):
    doc = fitz.open()
    p = page_type(doc, "Plan d'aménagement forestier", f"Plan nº {no_plan}  ·  en vigueur du 12 mai 2021 au 12 mai 2031")
    y = lignes(p, 160, [
        ("Propriétaire", "Jean Tremblay"), ("Numéro de producteur", NO_PROD),
        ("Propriété", f"{propriete['no_propriete']}, {propriete['municipalite']} (MRC de Portneuf)"),
        ("Lots", ", ".join(l["no_lot"] for l in lots)),
        ("Superficie totale", f"{propriete['superficie_totale']:.1f} ha".replace(".", ",")),
        ("Superficie boisée", f"{propriete['superficie_boisee']:.1f} ha".replace(".", ",")),
        ("Objectifs du propriétaire", "Mise en valeur de l'érablière, production de bois de qualité, protection du ruisseau"),
    ], x_val=190)
    p.insert_text((36, y + 20), "Description des peuplements", fontsize=13, color=VERT, fontname="hebo")
    rangees = [(no, a["appellation"].capitalize(), f"{aire_ha(s):.1f}".replace(".", ","), a.get("classe_age") or "-",
                a.get("cl_dens") or "-", a["traitements_rec"]) for no, s, a in peups]
    y = tableau(p, y + 48, ["Nº", "Appellation", "Ha", "Âge", "Dens.", "Recommandation"], rangees, [30, 180, 45, 40, 45, 200])
    p.insert_text((36, y + 20), "Plan des interventions 2021-2031", fontsize=13, color=VERT, fontname="hebo")
    y = tableau(p, y + 48, ["Période", "Intervention", "Peuplement"], [
        ("2023-2024", "Éclaircie précommerciale", "02"), ("2025", "Éclaircie commerciale", "03"),
        ("2026-2027", "Coupe de jardinage", "01"), ("2028-2030", "Reboisement d'enrichissement", "05")], [110, 280, 150])
    signature(p, y + 40)
    return doc


def pdf_prescription(no, traitement, lot, ha, annee, version=None):
    doc = fitz.open()
    p = page_type(doc, "Prescription sylvicole", f"Nº {no}" + (f"  ·  {version}" if version else ""))
    y = lignes(p, 160, [
        ("Propriétaire", "Jean Tremblay"), ("Numéro de producteur", NO_PROD), ("Lot", lot),
        ("Traitement prescrit", traitement.capitalize()), ("Superficie", f"{ha:.1f} ha".replace(".", ",")),
        ("Année d'exécution prévue", annee), ("Programme", "Programme d'aide à la mise en valeur des forêts privées"),
    ], x_val=190)
    p.insert_text((36, y + 20), "Diagnostic et objectifs", fontsize=13, color=VERT, fontname="hebo")
    p.insert_textbox(fitz.Rect(36, y + 32, 576, y + 140),
                     "Peuplement dense dont la croissance ralentit par la compétition entre les tiges. Le traitement vise "
                     "à retirer les tiges de moindre qualité pour concentrer la croissance sur les meilleures, en conservant "
                     "une bande de protection de 20 m le long du ruisseau." + (" Version révisée : ajustement de la "
                     "superficie après martelage." if version else ""), fontsize=10, fontname="helv")
    signature(p, y + 170)
    return doc


def pdf_rapport(no, traitement, ha, mois):
    doc = fitz.open()
    p = page_type(doc, "Rapport d'exécution", f"Prescription nº {no}  ·  travaux terminés en {mois}")
    y = lignes(p, 160, [
        ("Propriétaire", "Jean Tremblay"), ("Traitement réalisé", traitement.capitalize()),
        ("Superficie réalisée", f"{ha:.1f} ha".replace(".", ",")), ("Conformité", "Conforme à la prescription"),
        ("Vérification terrain", f"Effectuée en {mois}"),
    ], x_val=190)
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
    if cle == "paf1":
        return pdf_paf(PROPRIETES[0], LOTS[:2], P1_PEUP, f"{AGENCE}80210005")
    if cle == "paf2":
        return pdf_paf(PROPRIETES[1], LOTS[2:], P2_PEUP, f"{AGENCE}80210006")
    if cle == "prs0":
        return pdf_prescription(PRS_EC_2024, "éclaircie précommerciale - résineux", "5 612 387", aire_ha(PRESCRIPTIONS[0][6]), "2024")
    if cle == "prs1":
        return pdf_prescription(PRS_EC_2025, "éclaircie commerciale - sapinière", "5 612 384", aire_ha(PRESCRIPTIONS[1][6]) + 0.8, "2025")
    if cle == "prs1v2":
        return pdf_prescription(PRS_EC_2025, "éclaircie commerciale - sapinière", "5 612 384", aire_ha(PRESCRIPTIONS[1][6]), "2025", "version 2")
    if cle == "prs2":
        return pdf_prescription(PRS_JARD_2026, "coupe de jardinage - érablière", "5 612 384", aire_ha(PRESCRIPTIONS[2][6]), "2026-2027")
    if cle == "rap0":
        return pdf_rapport(PRS_EC_2024, "éclaircie précommerciale - résineux", aire_ha(PRESCRIPTIONS[0][6]), "octobre 2024")
    if cle == "rap1":
        return pdf_rapport(PRS_EC_2025, "éclaircie commerciale - sapinière", aire_ha(PRESCRIPTIONS[1][6]), "novembre 2025")
    if cle == "rtf2024":
        return pdf_rtf("2024", 6120, 1480)
    return pdf_rtf("2025", 9340, 1530)


# --------------------------------------------------------------------- Supabase
def rest(methode, table, **kw):
    r = requests.request(methode, f"{URL}/rest/v1/{table}", headers={**H, "Content-Type": "application/json",
                         "Prefer": "resolution=merge-duplicates,return=minimal"}, timeout=60, **kw)
    if r.status_code >= 300:
        raise SystemExit(f"{methode} {table} : {r.status_code} {r.text[:300]}")
    return r


def vider():
    ids_prop = ",".join(str(p["id"]) for p in PROPRIETES)
    for table, filtre in [("documents", f"producteur_id=eq.{PID}"), ("travaux", f"producteur_id=eq.{PID}"),
                          ("paf", f"propriete_id=in.({ids_prop})"), ("lots", f"propriete_id=in.({ids_prop})"),
                          ("cartes", f"producteur_id=eq.{PID}"), ("bilan_investissement", f"producteur_id=eq.{PID}"),
                          ("proprietes", f"producteur_id=eq.{PID}")]:
        rest("DELETE", f"{table}?{filtre}")
    r = requests.post(f"{URL}/storage/v1/object/list/documents", headers=H, timeout=60,
                      json={"prefix": f"{PID}/", "limit": 1000})
    for dossier in [o["name"] for o in r.json()]:
        r2 = requests.post(f"{URL}/storage/v1/object/list/documents", headers=H, timeout=60,
                           json={"prefix": f"{PID}/{dossier}/", "limit": 1000})
        chemins = [f"{PID}/{dossier}/{o['name']}" for o in r2.json()]
        if chemins:
            requests.delete(f"{URL}/storage/v1/object/documents", headers=H, json={"prefixes": chemins}, timeout=60)


def creer():
    vider()
    rest("POST", "producteurs", json=[{"id": PID, "nom": NOM, "no_prod": NO_PROD, "statut": "PRTF Oui", "type_proprio": "Particulier"}])
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
    print(f"Client démo prêt : {NOM} ({NO_PROD}), producteur {PID}")
    print(f"  {len(PROPRIETES)} propriétés ({HA_P1} + {HA_P2} ha), {len(LOTS)} lots, {len(features)} éléments de carte,")
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
    else:
        creer()
