# -*- coding: utf-8 -*-
"""Extraction du Tableau 9 / Annexe 2 : IQS_station par essence, region ecologique
et type ecologique. Source: Lafleche, Bernier, Saucier, Gagne (2013), MRNF,
Direction des inventaires forestiers, 115 p. (domaine public).
Sortie : iqs_type_eco.json avec records detailles + resume (essence, type_eco)."""
import json, re, sys, io
from pypdf import PdfReader

PDF = "iqs_types_eco_2013.pdf"
P_START, P_END = 56, 115  # pages de l'annexe (1-indexees)

VAL = re.compile(r"(\d+)\s+(\d+,\d+)\s+(\d+,\d+)\s+(\d+,\d+)\s+(\d+,\d+)\s+(\d+,\d+)\s*$")
ESS = re.compile(r"^([A-Z]{2,3})\b")
REG = re.compile(r"\b(\d{1,2}[a-z])\b")
TYP = re.compile(r"\b([A-Z]{2}\d{2}[A-Z]?)\b")
ESSENCES = {"BOP", "EPB", "EPN", "EPR", "PEG", "PET", "PIG", "SAB", "THO",
            "BOJ", "ERR", "ERS", "PIB", "PIR", "PRU", "CHR", "OSV", "TIL", "HEG"}

def fnum(s):
    return float(s.replace(",", "."))

def parse_header(txt):
    txt = txt.strip()
    me = ESS.match(txt)
    if not me or me.group(1) not in ESSENCES:
        return None
    ess = me.group(1)
    mt = list(TYP.finditer(txt))
    if not mt:
        return None
    typ = mt[-1].group(1)
    # region : premier motif chiffre+lettre apres l'essence et avant le type
    seg = txt[me.end():mt[-1].start()]
    mr = REG.search(seg)
    reg = mr.group(1) if mr else None
    return {"essence": ess, "region": reg, "type_eco": typ}

def main():
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    r = PdfReader(PDF)
    records = []
    buffer = []
    for p in range(P_START - 1, min(P_END, len(r.pages))):
        text = r.pages[p].extract_text() or ""
        for raw in text.split("\n"):
            line = raw.strip()
            if not line:
                continue
            mv = VAL.search(line)
            head_part = line[:mv.start()] if mv else line
            h = parse_header(head_part)
            if mv:
                n, moyen, i95, s95, asym, ans = mv.groups()
                targets = list(buffer)
                if h:
                    targets.append(h)
                for t in targets:
                    if t.get("type_eco"):
                        records.append({**t, "n_tiges": int(n),
                                        "iqs_moyen": fnum(moyen),
                                        "ans_0a1m": fnum(ans)})
                buffer = []
            elif h:
                buffer.append(h)

    # resume par (essence, type_eco) : moyenne des IQS sur les regions
    resume = {}
    for rec in records:
        e, ty = rec["essence"], rec["type_eco"]
        resume.setdefault(e, {}).setdefault(ty, {"vals": [], "ans": [], "n": 0})
        d = resume[e][ty]
        d["vals"].append(rec["iqs_moyen"]); d["ans"].append(rec["ans_0a1m"]); d["n"] += 1
    resume_out = {}
    for e in resume:
        resume_out[e] = {}
        for ty, d in resume[e].items():
            vals = d["vals"]
            resume_out[e][ty] = {
                "iqs_moyen": round(sum(vals) / len(vals), 2),
                "iqs_min": round(min(vals), 2), "iqs_max": round(max(vals), 2),
                "ans_0a1m": round(sum(d["ans"]) / len(d["ans"]), 1),
                "n_stations": d["n"],
            }

    out = {
        "_source": "Lafleche, V., S. Bernier, J.-P. Saucier et C. Gagne (2013). Indices de "
                   "qualite de station des principales essences commerciales en fonction des "
                   "types ecologiques du Quebec meridional. MRNF, Direction des inventaires "
                   "forestiers, 115 p. Tableau 9 / Annexe 2. Domaine public.",
        "_note": "IQS_station = hauteur dominante potentielle (m) a l'age de reference. "
                 "resume = IQS moyen par (essence, type ecologique), moyenne sur les regions. "
                 "records = detail par (essence, region ecologique, type ecologique).",
        "_essences": {"BOP": "bouleau a papier", "EPB": "epinette blanche",
                      "EPN": "epinette noire", "EPR": "epinette rouge",
                      "PEG": "peuplier a grandes dents", "PET": "peuplier faux-tremble",
                      "PIG": "pin gris", "SAB": "sapin baumier", "THO": "thuya de l'Est"},
        "resume": resume_out,
        "records": records,
    }
    with open("iqs_type_eco.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    ntypes = sum(len(v) for v in resume_out.values())
    print(f"Records IQS : {len(records)}")
    print(f"Essences : {sorted(resume_out)}")
    print(f"Couples (essence, type_eco) distincts : {ntypes}")
    # apercu essences/types utiles a la foret privee
    for e in ["EPN", "SAB", "EPB", "PET", "PIG", "BOP"]:
        if e in resume_out:
            items = sorted(resume_out[e].items())[:6]
            print(f"  {e}:", {ty: v["iqs_moyen"] for ty, v in items})
    # validation : plages plausibles
    bad = [rec for rec in records if not (4 <= rec["iqs_moyen"] <= 34)]
    print(f"IQS hors plage [4,34] : {len(bad)}", bad[:3])

if __name__ == "__main__":
    main()
