// Indice de qualite de station (IQS) a partir du type ecologique.
// Source : Laflèche et al. (2013), MRNF — IQS par essence et type écologique
// du Québec méridional. On lit le résumé (IQS moyen par essence x type_eco,
// moyenné sur les régions écologiques).
//
// Le rapport n'échantillonne pas tous les couples (essence, type écologique).
// On applique donc une cascade : exact -> même essence sur le même groupe de
// végétation (2 premières lettres, ex. MS**) -> autre essence sur le même type
// -> autre essence sur le même groupe. Le niveau de repli est retourné.
import iqsData from "./data/iqs-type-eco.json" with { type: "json" };
import type { CodePS } from "./especes.ts";

type Rec = { iqs_moyen: number; iqs_min: number; iqs_max: number; ans_0a1m: number; n_stations: number };
type Resume = Record<string, Record<string, Rec>>;

const RESUME = (iqsData as { resume: Resume }).resume;

export type NiveauIqs = "exact" | "groupe_vegetation" | "type_autre_essence" | "groupe_autre_essence";

export type IqsResolu = {
  iqs: number;
  ans0a1m: number;
  niveau: NiveauIqs;
  detail: string;
};

// Essences voisines pour lire l'IQS quand l'essence n'a pas de courbe propre.
const IQS_PROXY: Record<CodePS, string[]> = {
  BOP: ["BOP", "PET", "EPB"],
  PET: ["PET", "BOP", "EPB"],
  EPB: ["EPB", "EPN", "SAB"],
  EPN: ["EPN", "SAB", "EPB"],
  SAB: ["SAB", "EPN", "EPB"],
  PIG: ["PIG", "EPN", "SAB"],
  THO: ["THO", "SAB", "EPN"],
};

function typesCandidats(t: string): string[] {
  const up = t.trim().toUpperCase();
  const base = up.slice(0, 4);          // MS22E -> MS22
  return up === base ? [up] : [up, base];
}

// Moyenne des IQS d'une essence sur un groupe de végétation (2 lettres).
function moyenneGroupe(essence: string, groupe2: string): Rec | null {
  const parType = RESUME[essence];
  if (!parType) return null;
  const recs = Object.entries(parType)
    .filter(([ty]) => ty.slice(0, 2) === groupe2)
    .map(([, r]) => r);
  if (recs.length === 0) return null;
  const moy = recs.reduce((s, r) => s + r.iqs_moyen, 0) / recs.length;
  const ans = recs.reduce((s, r) => s + r.ans_0a1m, 0) / recs.length;
  return { iqs_moyen: moy, iqs_min: Math.min(...recs.map((r) => r.iqs_moyen)),
           iqs_max: Math.max(...recs.map((r) => r.iqs_moyen)), ans_0a1m: ans, n_stations: recs.length };
}

export function iqsDepuisTypeEco(espece: CodePS, typeEco?: string | null): IqsResolu | null {
  if (!typeEco) return null;
  const cands = typesCandidats(typeEco);
  const essences = IQS_PROXY[espece] ?? [espece];
  const groupe2 = cands[cands.length - 1].slice(0, 2);

  // 1) exact (essence exacte ou proxy), sur le type précis
  for (const ess of essences) {
    for (const ty of cands) {
      const r = RESUME[ess]?.[ty];
      if (r) {
        return { iqs: round2(r.iqs_moyen), ans0a1m: round1(r.ans_0a1m),
                 niveau: ess === essences[0] ? "exact" : "type_autre_essence",
                 detail: `${ess} ${ty}` };
      }
    }
  }
  // 2) même essence (ou proxy), moyenne du groupe de végétation
  for (const ess of essences) {
    const g = moyenneGroupe(ess, groupe2);
    if (g) {
      return { iqs: round2(g.iqs_moyen), ans0a1m: round1(g.ans_0a1m),
               niveau: ess === essences[0] ? "groupe_vegetation" : "groupe_autre_essence",
               detail: `${ess} ${groupe2}** (moyenne de ${g.n_stations} types)` };
    }
  }
  // 3) toute essence, moyenne du groupe de végétation
  for (const ess of Object.keys(RESUME)) {
    const g = moyenneGroupe(ess, groupe2);
    if (g) {
      return { iqs: round2(g.iqs_moyen), ans0a1m: round1(g.ans_0a1m),
               niveau: "groupe_autre_essence", detail: `${ess} ${groupe2}**` };
    }
  }
  return null;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const round1 = (x: number) => Math.round(x * 10) / 10;
