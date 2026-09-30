"""
Superficie boisée des propriétés et des lots de l'espace client, calculée.

Pourquoi : proprietes.superficie_boisee était vide pour 1 012 propriétés sur 1 398
(jamais remplie à la source), et l'accueil du portail ne pouvait pas l'afficher.

Méthode (PostGIS de PlaniLogix, même moteur géométrique que QGIS) :
  1. géométrie des lots : planilogix.cadastre, par numéro de lot ;
  2. peuplements forestiers : planilogix.eco_pee (inventaire écoforestier du
     Ministère), gr_ess renseigné OU origine connue (plantation, coupe, etc.) ;
     un terrain sans essence ni origine (agricole, eau, anthropique) n'est pas boisé ;
  3. st_makevalid, découpe aux limites, puis st_union : eco_pee contient des
     polygones invalides et qui se chevauchent, qu'on ne compte qu'une fois ;
  4. superficie = aire de l'union, en MTM (EPSG:32187), en hectares.

On ne remplit que les superficies boisées VIDES : une valeur déjà présente vient du
plan d'aménagement signé et reste la référence. Une propriété dont la superficie
déclarée diffère de plus de 10 % de l'aire cadastrale (lot en partie seulement,
lot absent du cadastre) n'est pas remplie : l'estimation n'y serait pas fiable.

    python scripts/calculer_superficies_boisees.py              (à blanc, rapport)
    python scripts/calculer_superficies_boisees.py --appliquer  (écrit dans le portail)
"""
import pathlib
import re
import sys

import psycopg2
import requests

RACINE = pathlib.Path(__file__).resolve().parents[1]
ENV = dict(
    l.split("=", 1) for l in (RACINE / "scripts/.env").read_text(encoding="utf-8").splitlines()
    if "=" in l and not l.startswith("#")
)
URL = ENV["SUPABASE_URL"].rstrip("/")
H = {"apikey": ENV["SUPABASE_SERVICE_ROLE_KEY"], "Authorization": f"Bearer {ENV['SUPABASE_SERVICE_ROLE_KEY']}"}
APPLIQUER = "--appliquer" in sys.argv
ECART_MAX = 0.10


def tout(table, colonnes):
    lignes, de = [], 0
    while True:
        r = requests.get(f"{URL}/rest/v1/{table}", headers={**H, "Range": f"{de}-{de + 999}"},
                         params={"select": colonnes, "order": "id"}, timeout=60)
        r.raise_for_status()
        lignes += r.json()
        if len(r.json()) < 1000:
            return lignes
        de += 1000


def format_cadastre(no_lot):
    """« 5835395 » ou « 5 835 395 » -> « 5 835 395 », le format de planilogix.cadastre."""
    chiffres = re.sub(r"\D", "", str(no_lot or ""))
    if len(chiffres) != 7:
        return None
    return f"{chiffres[0]} {chiffres[1:4]} {chiffres[4:]}"


SQL = """
with d as (select * from unnest(%s::int[], %s::text[]) as t(cle, no_lot)),
g as (
  select d.cle, st_union(st_makevalid(c.geom)) as geom, count(*) as nb
  from d join planilogix.cadastre c on c.no_lot = d.no_lot
  group by d.cle),
f as (
  select g.cle, g.nb, st_area(g.geom) as aire,
    (select st_area(st_union(st_intersection(st_makevalid(e.geom), g.geom)))
       from planilogix.eco_pee e
      where e.geom && g.geom and st_intersects(e.geom, g.geom)
        and (e.gr_ess is not null or e.origine is not null)) as foret
  from g)
select cle, nb, aire / 10000, coalesce(foret, 0) / 10000 from f"""


def calculer(cur, groupes):
    """groupes : {clé: [numéros de lot au format cadastre]} -> {clé: (nb_trouvés, ha_cadastre, ha_boisé)}."""
    cles, lots = [], []
    for cle, nos in groupes.items():
        for no in nos:
            cles.append(cle)
            lots.append(no)
    res = {}
    for i in range(0, len(cles), 400):
        cur.execute(SQL, (cles[i:i + 400], lots[i:i + 400]))
        for cle, nb, ha_cad, ha_bois in cur.fetchall():
            res[cle] = (nb, float(ha_cad), float(ha_bois))
    return res


def main():
    proprietes = tout("proprietes", "*")
    lots = tout("lots", "*")
    lots_par_prop = {}
    for l in lots:
        lots_par_prop.setdefault(l["propriete_id"], []).append(l)

    cx = psycopg2.connect(ENV["PLANILOGIX_DB_URL"])
    cur = cx.cursor()
    # Les lots d'une même propriété doivent partir dans le même lot SQL : on groupe
    # par propriété, 400 numéros au plus par requête.
    g_prop = {p["id"]: sorted({n for l in lots_par_prop.get(p["id"], []) if (n := format_cadastre(l["no_lot"]))}) for p in proprietes}
    g_lot = {l["id"]: [n] for l in lots if (n := format_cadastre(l["no_lot"]))}
    res_prop, res_lot = {}, {}
    lot_courant, taille = {}, 0
    for pid, nos in g_prop.items():
        if not nos:
            continue
        if taille + len(nos) > 400 and lot_courant:
            res_prop.update(calculer(cur, lot_courant))
            lot_courant, taille = {}, 0
        lot_courant[pid] = nos
        taille += len(nos)
    if lot_courant:
        res_prop.update(calculer(cur, lot_courant))
    res_lot = calculer(cur, g_lot)
    cx.close()

    maj_prop, maj_lot, ecarts, compar = [], [], [], []
    for p in proprietes:
        r = res_prop.get(p["id"])
        if not r:
            continue
        nb, ha_cad, ha_bois = r
        attendus = len(g_prop.get(p["id"], []))
        declaree = float(p["superficie_totale"] or 0)
        fiable = nb == attendus and declaree > 0 and abs(declaree - ha_cad) / declaree <= ECART_MAX
        existante = float(p["superficie_boisee"] or 0)
        if existante >= 1:
            compar.append((existante, min(ha_bois, declaree or ha_bois)))
            continue
        if not fiable:
            ecarts.append((p["id"], declaree, round(ha_cad, 2), nb, attendus))
            continue
        maj_prop.append({**p, "superficie_boisee": round(min(ha_bois, declaree), 2)})
    for l in lots:
        r = res_lot.get(l["id"])
        if not r or float(l["superficie_boisee"] or 0) >= 1:
            continue
        _, ha_cad, ha_bois = r
        declaree = float(l["superficie_totale"] or 0)
        if declaree <= 0 or abs(declaree - ha_cad) / declaree > ECART_MAX:
            continue
        maj_lot.append({**l, "superficie_boisee": round(min(ha_bois, declaree), 2)})

    vides_avant = sum(1 for p in proprietes if float(p["superficie_boisee"] or 0) < 1)
    print(f"Propriétés : {len(proprietes)}, boisée vide avant : {vides_avant}")
    print(f"  trouvées au cadastre : {len(res_prop)}")
    print(f"  remplies par le calcul : {len(maj_prop)}")
    print(f"  écartées (aire cadastrale à plus de 10 % de la superficie déclarée, ou lot absent) : {len(ecarts)}")
    print(f"  restent vides : {vides_avant - len(maj_prop)}")
    print(f"Lots : {len(lots)}, remplis par le calcul : {len(maj_lot)}")
    if compar:
        diffs = sorted(abs(a - b) / a for a, b in compar if a)
        med = diffs[len(diffs) // 2]
        proches = sum(1 for d in diffs if d <= 0.15)
        print(f"Contrôle sur {len(compar)} propriétés qui avaient déjà une valeur (plan d'aménagement) :")
        print(f"  écart médian entre calcul et valeur du plan : {med:.0%}, à 15 % près : {proches}/{len(diffs)}")
    if maj_prop:
        taux = sorted(m["superficie_boisee"] / float(m["superficie_totale"]) for m in maj_prop)
        print(f"Part boisée des propriétés remplies : médiane {taux[len(taux) // 2]:.0%}")
    if not APPLIQUER:
        print("\nÀ blanc : rien n'a été écrit. Relancer avec --appliquer.")
        return
    for table, lignes in (("proprietes", maj_prop), ("lots", maj_lot)):
        for i in range(0, len(lignes), 500):
            r = requests.post(f"{URL}/rest/v1/{table}", json=lignes[i:i + 500], timeout=120,
                              headers={**H, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"})
            if r.status_code >= 300:
                raise SystemExit(f"{table} {i}: {r.status_code} {r.text[:300]}")
    print(f"\nÉcrit : {len(maj_prop)} propriétés, {len(maj_lot)} lots.")


if __name__ == "__main__":
    main()
