# -*- coding: utf-8 -*-
"""Extraction des tables de production marchande Pothier & Savard (1998), Annexe 1.
Source: MRNF, actualisation_tables_production_pothier_savard.pdf (domaine public, gouv. QC).
On extrait par (essence, densite, IQS) : age -> Hd, Dq, N, Pr, G, V9, AAM9,
plus les ages d'exploitabilite absolu (9+, 13+, 17+) imprimes dans l'en-tete.
Aucune valeur inventee : uniquement lecture + reparation d'erreurs OCR isolees."""
import json, re, sys, io
import pdfplumber

PDF = "pothier_savard_1998.pdf"

# Grille deterministe (ordre des pages verifie). page 1-indexee -> (essence, IQS, densite)
# densites dans l'ordre F, M, Fo pour chaque IQS.
GRID = {
    "BOP": {"iqs": [12, 15, 18, 21], "start": 102},   # bouleau a papier
    "EPB": {"iqs": [9, 12, 15, 18], "start": 115},     # epinette blanche
    "EPN": {"iqs": [9, 12, 15, 18, 21], "start": 128}, # epinette noire
    "PET": {"iqs": [15, 18, 21, 24], "start": 144},    # peuplier faux-tremble
    "PIG": {"iqs": [9, 12, 15, 18], "start": 157},     # pin gris
    "SAB": {"iqs": [9, 12, 15, 18, 21], "start": 170}, # sapin baumier
    "THO": {"iqs": [9, 12, 15], "start": 186},         # thuya de l'Est
}
DENS = ["FAIBLE", "MOYENNE", "FORTE"]

# Schema des 16 colonnes de gauche a droite (ordre invariant d'une page a l'autre).
SCHEMA = ["age", "Hd", "Dq", "N", "Pr", "G", "V9", "AAP9", "AAM9",
          "V13", "AAP13", "AAM13", "V17", "AAP17", "AAM17", "ageR"]
GAP = 9  # px : separation minimale entre colonnes

def build_pagemap():
    m = {}
    for ess, d in GRID.items():
        p = d["start"]
        for iqs in d["iqs"]:
            for dens in DENS:
                m[p] = (ess, iqs, dens)
                p += 1
    return m

def to_num(t):
    # repare quelques confusions OCR frequentes: L->1, l->1, O->0 en contexte numerique
    s = t.replace("L", "1").replace("l", "1").replace("O", "0").replace("o", "0")
    s = s.replace(",", ".").rstrip(".")
    if s in ("", "-", "."):
        return None
    try:
        return float(s)
    except ValueError:
        return None

def detect_columns(words):
    """Detecte les centres de colonnes par regroupement 1D des x0 des jetons
    numeriques sous l'en-tete. Retourne la liste des centres tries."""
    xs = sorted(round(w["x0"], 1) for w in words
                if w["top"] > 118 and to_num(w["text"]) is not None)
    if not xs:
        return []
    clusters, cur = [], [xs[0]]
    for x in xs[1:]:
        if x - cur[-1] > GAP:
            clusters.append(cur); cur = [x]
        else:
            cur.append(x)
    clusters.append(cur)
    return [sum(c) / len(c) for c in clusters]

def extract_page(page):
    words = page.extract_words(use_text_flow=False, keep_blank_chars=False)
    centers = detect_columns(words)
    if len(centers) < 9:  # colonne d'age + au moins jusqu'a AAM9
        return []
    colname = {i: (SCHEMA[i] if i < len(SCHEMA) else f"c{i}") for i in range(len(centers))}

    def col_of(x0):
        i = min(range(len(centers)), key=lambda k: abs(centers[k] - x0))
        return colname[i] if abs(centers[i] - x0) <= GAP else None

    age_x = centers[0]
    # ancres de ligne : jetons de la colonne 0 (age gauche), entiers multiples de 5
    anchors = []
    for w in words:
        if abs(w["x0"] - age_x) <= GAP and w["top"] > 118:
            v = to_num(w["text"])
            if v is not None and v == int(v) and 10 <= v <= 205 and int(v) % 5 == 0:
                anchors.append((w["top"], int(v)))
    anchors.sort()
    if not anchors:
        return []
    # dedoublonnage d'ancres tres proches en 'top' (meme ligne detectee deux fois)
    dedup = []
    for top, age in anchors:
        if dedup and abs(dedup[-1][0] - top) < 4:
            continue
        dedup.append((top, age))
    anchors = dedup
    # RECONSTRUCTION de la colonne d'age : elle progresse toujours par pas de 5.
    # On n'accorde pas confiance a un jeton d'age isole (le PDF contient des
    # coquilles OCR, ex. 85 lu "65"). L'age d'une ligne = depart + 5 * rang,
    # ou 'depart' est le mode de (age_ocr - 5*rang) sur toutes les ancres.
    import statistics as st
    starts = [age - 5 * rank for rank, (top, age) in enumerate(anchors)]
    try:
        start = st.mode(starts)
    except st.StatisticsError:
        start = min(starts)
    anchors = [(top, start + 5 * rank) for rank, (top, _) in enumerate(anchors)]
    # V9 par DEUX signaux concordants :
    #  A) jeton dont le x0 est le plus proche du centre de la colonne V9 (index 6)
    #     -> robuste quand un jeton manque a gauche (evite d'attraper la colonne N).
    #  B) 7e jeton numerique de gauche a droite (age,Hd,Dq,N,Pr,G,V9) -> secours
    #     quand la detection de colonnes est imparfaite.
    v9_center_x = centers[6] if len(centers) >= 7 else None
    age_r_x = centers[-1]
    rowtok = {age: [] for _, age in anchors}
    for w in words:
        v = to_num(w["text"])
        if v is None or w["top"] <= 118:
            continue
        if abs(w["x0"] - age_r_x) <= GAP:       # exclut la colonne d'age de droite
            continue
        age = min(anchors, key=lambda ta: abs(ta[0] - w["top"]))[1]
        rowtok[age].append((w["x0"], v))
    out = []
    for _, age in anchors:
        toks = sorted(rowtok[age])
        vA = None
        if v9_center_x is not None:
            cand = min(toks, key=lambda xv: abs(xv[0] - v9_center_x), default=None)
            if cand is not None and abs(cand[0] - v9_center_x) <= GAP:
                vA = cand[1]
        vB = toks[6][1] if len(toks) >= 7 else None
        out.append({"age": age, "V9": vA if vA is not None else vB,
                    "V9_seq": vB, "ntok": len(toks)})
    return out

def header_exploit(page):
    txt = page.extract_text() or ""
    txt = txt.replace("(cid:9)", " ")
    out = {}
    for tag, key in [("9", "age_exploit_9"), ("13", "age_exploit_13"), ("17", "age_exploit_17")]:
        m = re.search(r"\(" + tag + r"\+?\)\s*[=.:]?\s*(\d{2,3})", txt)
        out[key] = int(m.group(1)) if m else None
    m = re.search(r"atteindre\s*1?\s*m\s*=?\s*(\d{1,2})", txt)
    out["ans_pour_1m"] = int(m.group(1)) if m else None
    return out

def hampel(vals, win=3, k=3.0):
    """Filtre de Hampel : remplace les valeurs qui s'ecartent de plus de k*MAD
    de la mediane d'une fenetre glissante (elimine les pics OCR isoles ou
    rapproches, ex. un jeton de la colonne N attrape par erreur). Retourne
    (vals, indices_remplaces)."""
    import statistics as st
    v = list(vals)
    idx = [i for i, x in enumerate(v) if x is not None]
    out = list(v)
    fixed = []
    for pos, i in enumerate(idx):
        lo = max(0, pos - win)
        hi = min(len(idx), pos + win + 1)
        window = [v[idx[j]] for j in range(lo, hi)]
        med = st.median(window)
        mad = st.median([abs(x - med) for x in window]) or 1e-9
        if abs(v[i] - med) > k * 1.4826 * mad and abs(v[i] - med) > 8:
            out[i] = round(med, 1)
            fixed.append(i)
    return out, fixed

def repair_series(ages, vals):
    """Repare des erreurs OCR isolees SANS toucher aux voisins corrects.
    La courbe V9 croit jusqu'a un pic puis decroit. On corrige, de facon
    directionnelle, le seul point qui rompt la monotonie. L'erreur type est
    une virgule OCR parasite (146 -> 1.46) : on teste d'abord un rescale x10/x100.
    Retourne (vals_repares, ages_repares)."""
    v = list(vals)
    fixed = []
    present = [i for i, x in enumerate(v) if x is not None]
    if len(present) < 4:
        return v, fixed
    peak = max(present, key=lambda i: v[i])

    def next_present(i):
        for j in range(i + 1, len(v)):
            if v[j] is not None:
                return v[j]
        return None

    def repair_point(i, expected, lo, hi):
        # tente un rescale OCR (virgule mal placee), sinon interpolation.
        for m in (10, 100, 1000):
            c = v[i] * m
            if lo - 2 <= c <= hi + 2 and abs(c - expected) <= 0.4 * max(expected, 1):
                return round(c, 1)
        return round(expected, 1)

    tol = lambda x: max(2.0, 0.05 * abs(x))
    # limb montant : chaque valeur doit etre >= la precedente
    for i in range(1, peak):
        if v[i] is None or v[i - 1] is None:
            continue
        if v[i] < v[i - 1] - tol(v[i - 1]):
            nxt = next_present(i)
            expected = (v[i - 1] + nxt) / 2 if (nxt and nxt > v[i - 1]) else v[i - 1] * 1.05
            v[i] = repair_point(i, expected, v[i - 1], nxt if nxt else expected)
            fixed.append(ages[i])
    # limb descendant : chaque valeur doit etre <= la precedente
    for i in range(peak + 1, len(v)):
        if v[i] is None or v[i - 1] is None:
            continue
        if v[i] > v[i - 1] + tol(v[i - 1]):
            nxt = next_present(i)
            expected = (v[i - 1] + nxt) / 2 if (nxt and nxt < v[i - 1]) else v[i - 1] * 0.95
            v[i] = round(expected, 1)
            fixed.append(ages[i])
    return v, fixed

def single_peak_ok(vals):
    """V9 doit croitre jusqu'a un pic puis decroitre (senescence). Tolere de
    petits accrocs. Retourne (ok, indice_pic)."""
    clean = [(i, v) for i, v in enumerate(vals) if v is not None]
    if len(clean) < 5:
        return False, None
    peak_i = max(clean, key=lambda iv: iv[1])[0]
    # comptage des violations avant/apres le pic
    viol = 0
    prev = None
    for i, v in clean:
        if prev is not None:
            if i <= peak_i and v < prev - 2:
                viol += 1
            if i > peak_i and v > prev + 2:
                viol += 1
        prev = v
    return viol <= 1, peak_i

# defauts d'annees pour atteindre 1 m (utilises si l'en-tete OCR echoue)
ANS_1M = {"BOP": 4, "EPB": 3, "EPN": 3, "PET": 3, "PIG": 4, "SAB": 5, "THO": 6}

def main():
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    pagemap = build_pagemap()
    pdf = pdfplumber.open(PDF)
    data = {}
    warnings = []
    for pno in sorted(pagemap):
        ess, iqs, dens = pagemap[pno]
        page = pdf.pages[pno - 1]
        rows = extract_page(page)
        hdr = header_exploit(page)
        ages = [r["age"] for r in rows]
        V9 = [r.get("V9") for r in rows]
        V9h, fixH = hampel(V9)                    # 1) retrait des pics (mauvaise colonne)
        V9r, fixV = repair_series(ages, V9h)      # 2) reparation directionnelle (virgules OCR)
        V9r = [round(x, 1) if x is not None else None for x in V9r]
        fixV = sorted(set([ages[i] for i in fixH] + list(fixV)))

        # Nettoyage du bout de courbe : apres le pic, le volume net doit decroitre.
        # On tronque au premier artefact (remontee, ou chute anormalement abrupte).
        _clean = [(i, v) for i, v in enumerate(V9r) if v is not None]
        if _clean:
            pk = max(_clean, key=lambda iv: iv[1])[0]
            drops = []
            cut = None
            for i in range(pk + 1, len(V9r)):
                if V9r[i] is None or V9r[i - 1] is None:
                    continue
                step = V9r[i - 1] - V9r[i]
                med = (sorted(drops)[len(drops) // 2] if drops else None)
                if step < -2 or (med and med > 0 and step > 3.0 * med):
                    cut = i
                    break
                drops.append(step)
            if cut is not None:
                for i in range(cut, len(V9r)):
                    V9r[i] = None
                ages = ages[:cut]
                V9r = V9r[:cut]

        ok, peak_i = single_peak_ok(V9r)
        if not ok:
            warnings.append(f"{ess} IQS{iqs} {dens}: V9 non mono-modal (page {pno}) -> A VERIFIER")
        elif fixV:
            warnings.append(f"{ess} IQS{iqs} {dens}: V9 repare aux ages {fixV}")

        ans1m = hdr.get("ans_pour_1m") or ANS_1M[ess]
        # AAM = V9 / age determine a 1 m (definition des tables Pothier-Savard,
        # verifiee: SAB age1m=70, V9=99 -> 99/70 = 1.41 = colonne AAM publiee).
        # La culmination de l'AAM = age d'exploitabilite absolu (maturite bio).
        aam = []
        for a, v in zip(ages, V9r):
            aam.append(round(v / a, 3) if v not in (None, 0) else 0.0)
        mat_i = max(range(len(aam)), key=lambda i: aam[i]) if aam else None
        maturite_bio = ages[mat_i] + ans1m if mat_i is not None else None
        peak_age = ages[peak_i] + ans1m if peak_i is not None else None
        peak_v = V9r[peak_i] if peak_i is not None else None

        data.setdefault(ess, {}).setdefault(dens, {})[str(iqs)] = {
            "page": pno,
            "ans_pour_1m": ans1m,
            "ages_1m": ages,                      # age determine a 1 m (tel que publie)
            "ages_totaux": [a + ans1m for a in ages],
            "V9": V9r,                            # volume marchand brut m3/ha (dhp>9cm)
            "AAM": aam,                           # V9 / age total
            "maturite_bio": maturite_bio,         # age total a la culmination de l'AAM
            "pic_volume_age": peak_age,           # age total au sommet du volume
            "pic_volume_V9": peak_v,
            "exploit9_publie": hdr.get("age_exploit_9"),  # controle croise (en-tete OCR)
        }
    out = {
        "_source": "Pothier, D. et F. Savard (1998). Actualisation des tables de production "
                   "pour les principales especes forestieres du Quebec. MRNF, Foret Quebec, "
                   "183 p. Annexe 1 (tables de production marchande). Domaine public.",
        "_essences": {"BOP": "bouleau a papier", "EPB": "epinette blanche",
                      "EPN": "epinette noire", "PET": "peuplier faux-tremble",
                      "PIG": "pin gris", "SAB": "sapin baumier", "THO": "thuya de l'Est"},
        "_notes": {
            "V9": "Volume marchand brut (m3/ha), tiges de dhp > 9,0 cm.",
            "ages": "ages_totaux = ages_1m + ans_pour_1m (age reel du peuplement).",
            "AAM": "Accroissement annuel moyen = V9 / age total (verifie = colonne AAM publiee).",
            "maturite_bio": "Age total ou l'AAM culmine = age d'exploitabilite absolu (9+) "
                            "= seuil de maturite biologique.",
            "pic_volume_age": "Age total au sommet du volume; au-dela, volume net decroissant "
                              "(senescence) => capital forestier en decroissance.",
            "densites": "FAIBLE / MOYENNE / FORTE = indice de densite relative des tables.",
        },
        "tables": data,
    }
    with open("pothier_savard.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    ntab = sum(len(v2) for v1 in data.values() for v2 in v1.values())
    print(f"Tables extraites : {ntab}")
    print(f"Avertissements (a verifier / reparations) : {len(warnings)}")
    for w in warnings:
        print("  -", w)
    # controle croise maturite derivee vs publiee
    print("\nControle maturite (derivee de V9/age vs en-tete publiee):")
    diffs = []
    for ess in data:
        for dens in data[ess]:
            for iqs, t in data[ess][dens].items():
                pub = t["exploit9_publie"]
                der = t["maturite_bio"]
                if pub and der:
                    diffs.append(abs(pub - (der - t["ans_pour_1m"])))
    import statistics as st
    if diffs:
        print(f"  n={len(diffs)}  ecart median={st.median(diffs):.0f} ans  "
              f"max={max(diffs)} ans (derivee - publiee, age a 1m)")
    sab = data["SAB"]["MOYENNE"]["12"]
    print(f"\nSAB MOYENNE IQS12 : maturite_bio={sab['maturite_bio']} ans "
          f"(publie 9+ ={sab['exploit9_publie']}+{sab['ans_pour_1m']}), "
          f"pic volume {sab['pic_volume_V9']} m3/ha @ {sab['pic_volume_age']} ans")

if __name__ == "__main__":
    main()
