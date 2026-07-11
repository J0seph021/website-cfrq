// Indice de qualite de station (IQS) a partir du type ecologique.
// Source : Laflèche et al. (2013), MRNF — IQS par essence et type écologique
// du Québec méridional.
//
// L'IQS varie de façon notable d'une région écologique à l'autre (écart médian
// ≈ 2,8 m, jusqu'à ~12 m, pour un même couple essence/type). Quand la région
// écologique du peuplement est connue, on lit l'IQS régional (records) ; sinon
// on retombe sur la moyenne inter-régions (resume).
//
// Cascade sans région : exact -> même essence sur le même groupe de végétation
// (2 lettres, ex. MS**) -> autre essence sur le même type -> autre essence sur
// le même groupe. Le niveau de repli est retourné.
import iqsData from "./data/iqs-type-eco.json" with { type: "json" };
import type { CodePS } from "./especes.ts";

type Rec = { iqs_moyen: number; iqs_min: number; iqs_max: number; ans_0a1m: number; n_stations: number };
type Resume = Record<string, Record<string, Rec>>;
type RecordRow = { essence: string; region?: string | null; type_eco: string; iqs_moyen: number; ans_0a1m: number };

const DATA = iqsData as { resume: Resume; records: RecordRow[] };
const RESUME = DATA.resume;

// Index régional : REGIONAL[essence][type_eco][region] = {iqs, ans}
const REGIONAL: Record<string, Record<string, Record<string, { iqs: number; ans: number }>>> = {};
for (const r of DATA.records) {
  if (!r.region) continue;
  (REGIONAL[r.essence] ??= {})[r.type_eco] ??= {};
  REGIONAL[r.essence][r.type_eco][r.region] = { iqs: r.iqs_moyen, ans: r.ans_0a1m };
}

export type NiveauIqs =
  | "exact_region"           // essence exacte, type exact, région exacte (meilleur)
  | "exact"                  // essence exacte, type exact, moyenne inter-régions
  | "groupe_vegetation"      // même essence, moyenne du groupe de végétation
  | "type_autre_essence"     // essence voisine, type exact
  | "groupe_autre_essence";  // essence voisine, groupe de végétation

export type IqsResolu = {
  iqs: number;
  ans0a1m: number;
  niveau: NiveauIqs;
  region: string | null;
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

export function iqsDepuisTypeEco(
  espece: CodePS,
  typeEco?: string | null,
  regionEco?: string | null,
): IqsResolu | null {
  if (!typeEco) return null;
  const cands = typesCandidats(typeEco);
  const essences = IQS_PROXY[espece] ?? [espece];
  const groupe2 = cands[cands.length - 1].slice(0, 2);
  const reg = regionEco?.trim().toLowerCase() || null;

  // 0) région connue : IQS régional précis (essence exacte ou proxy)
  if (reg) {
    for (const ess of essences) {
      for (const ty of cands) {
        const hit = REGIONAL[ess]?.[ty]?.[reg];
        if (hit) {
          return { iqs: round2(hit.iqs), ans0a1m: round1(hit.ans),
                   niveau: ess === essences[0] ? "exact_region" : "type_autre_essence",
                   region: reg, detail: `${ess} ${ty} (région ${reg})` };
        }
      }
    }
  }
  // 1) exact (essence exacte ou proxy), sur le type précis, moyenne inter-régions
  for (const ess of essences) {
    for (const ty of cands) {
      const r = RESUME[ess]?.[ty];
      if (r) {
        return { iqs: round2(r.iqs_moyen), ans0a1m: round1(r.ans_0a1m),
                 niveau: ess === essences[0] ? "exact" : "type_autre_essence",
                 region: null, detail: `${ess} ${ty} (moyenne inter-régions)` };
      }
    }
  }
  // 2) même essence (ou proxy), moyenne du groupe de végétation
  for (const ess of essences) {
    const g = moyenneGroupe(ess, groupe2);
    if (g) {
      return { iqs: round2(g.iqs_moyen), ans0a1m: round1(g.ans_0a1m),
               niveau: ess === essences[0] ? "groupe_vegetation" : "groupe_autre_essence",
               region: null, detail: `${ess} ${groupe2}** (moyenne de ${g.n_stations} types)` };
    }
  }
  // 3) toute essence, moyenne du groupe de végétation
  for (const ess of Object.keys(RESUME)) {
    const g = moyenneGroupe(ess, groupe2);
    if (g) {
      return { iqs: round2(g.iqs_moyen), ans0a1m: round1(g.ans_0a1m),
               niveau: "groupe_autre_essence", region: null, detail: `${ess} ${groupe2}**` };
    }
  }
  return null;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const round1 = (x: number) => Math.round(x * 10) / 10;
