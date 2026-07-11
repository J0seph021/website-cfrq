// Correspondances entre les codes de la carte ecoforestiere (PlaniLogix / MFFP)
// et les 7 essences des tables de production Pothier-Savard (1998).
//
// gr_ess encode la composition : les 2 premieres lettres = essence dominante.
// Les tables Pothier-Savard n'existent que pour 7 essences ; pour les autres on
// utilise un « proxy » (essence de croissance voisine) en le signalant.

export type CodePS = "BOP" | "EPB" | "EPN" | "PET" | "PIG" | "SAB" | "THO";
export type Densite = "FAIBLE" | "MOYENNE" | "FORTE";
export type Confiance = "direct" | "proxy";

export const NOM_PS: Record<CodePS, string> = {
  BOP: "bouleau à papier",
  EPB: "épinette blanche",
  EPN: "épinette noire",
  PET: "peuplier faux-tremble",
  PIG: "pin gris",
  SAB: "sapin baumier",
  THO: "thuya de l'Est (cèdre)",
};

// Essence dominante (2 lettres de gr_ess) -> essence Pothier-Savard.
// direct = table propre ; proxy = essence de croissance voisine (signalée).
const CORRESP: Record<string, { ps: CodePS; conf: Confiance }> = {
  // Résineux avec table propre
  EN: { ps: "EPN", conf: "direct" }, // épinette noire
  EB: { ps: "EPB", conf: "direct" }, // épinette blanche
  SB: { ps: "SAB", conf: "direct" }, // sapin baumier
  PG: { ps: "PIG", conf: "direct" }, // pin gris
  TO: { ps: "THO", conf: "direct" }, // thuya occidental (cèdre)
  // Feuillus avec table propre
  BP: { ps: "BOP", conf: "direct" }, // bouleau à papier
  BG: { ps: "BOP", conf: "direct" }, // bouleau gris -> bouleau à papier
  PE: { ps: "PET", conf: "direct" }, // peuplier faux-tremble
  PT: { ps: "PET", conf: "direct" }, // peuplier faux-tremble
  PA: { ps: "PET", conf: "direct" }, // peuplier baumier -> faux-tremble
  // Résineux sans table propre -> proxy résineux
  ER: { ps: "EPB", conf: "proxy" }, // épinette rouge -> épinette blanche
  EP: { ps: "EPN", conf: "proxy" }, // épinette (indéterminée) -> épinette noire
  EU: { ps: "EPB", conf: "proxy" }, // épinette (indéterminée) -> épinette blanche
  ME: { ps: "EPN", conf: "proxy" }, // mélèze laricin -> épinette noire
  PB: { ps: "PIG", conf: "proxy" }, // pin blanc -> pin gris
  PR: { ps: "PIG", conf: "proxy" }, // pin rouge -> pin gris
  PU: { ps: "SAB", conf: "proxy" }, // pruche -> sapin
  RX: { ps: "SAB", conf: "proxy" }, // résineux indéterminés -> sapin
  RZ: { ps: "SAB", conf: "proxy" }, // résineux -> sapin
  // Feuillus sans table propre -> proxy feuillu
  BJ: { ps: "BOP", conf: "proxy" }, // bouleau jaune -> bouleau à papier
  ES: { ps: "BOP", conf: "proxy" }, // érable à sucre -> bouleau à papier
  EO: { ps: "BOP", conf: "proxy" }, // érable rouge (autres codes) -> bouleau
  CH: { ps: "BOP", conf: "proxy" }, // chêne
  HE: { ps: "BOP", conf: "proxy" }, // hêtre
  TI: { ps: "BOP", conf: "proxy" }, // tilleul
  OR: { ps: "BOP", conf: "proxy" }, // ostryer / orme
  FT: { ps: "BOP", conf: "proxy" }, // feuillus tolérants
  FI: { ps: "PET", conf: "proxy" }, // feuillus intolérants -> peuplier
  FN: { ps: "BOP", conf: "proxy" }, // feuillus non commerciaux
  FX: { ps: "BOP", conf: "proxy" }, // feuillus indéterminés
  FE: { ps: "BOP", conf: "proxy" }, // feuillus
};

// Note : le code « ER » est ambigu (épinette rouge OU érable rouge). Dans les
// groupes gr_ess de la carte écoforestière il se rapporte à l'épinette rouge ;
// l'érable rouge est codé « ERR/EOR ». On le traite comme épinette rouge (proxy EPB).

export type EspeceResolue = { ps: CodePS; nom: string; conf: Confiance; codeSource: string };

export function especeDepuisGrEss(grEss?: string | null): EspeceResolue | null {
  if (!grEss) return null;
  const code = grEss.trim().toUpperCase().slice(0, 2);
  const m = CORRESP[code];
  if (!m) return null;
  return { ps: m.ps, nom: NOM_PS[m.ps], conf: m.conf, codeSource: code };
}

// Classe de densité de la carte écoforestière (A/B/C/D = fermeture de couvert)
// -> densité relative des tables Pothier-Savard.
//   A : 80-100 %  -> FORTE
//   B : 60-80  %  -> FORTE/MOYENNE (on retient MOYENNE, plus conservateur)
//   C : 40-60  %  -> MOYENNE
//   D : 25-40  %  -> FAIBLE
export function densiteDepuisClasse(clDens?: string | null): Densite {
  const c = (clDens ?? "").trim().toUpperCase().charAt(0);
  if (c === "A") return "FORTE";
  if (c === "D") return "FAIBLE";
  return "MOYENNE"; // B, C, inconnu -> défaut prudent
}

// Âge courant du peuplement (années). Priorité à l'année d'origine ; à défaut,
// milieu de la classe d'âge écoforestière.
const CLASSE_AGE_MILIEU: Record<string, number> = {
  "10": 10, "30": 30, "50": 50, "70": 70, "90": 90, "120": 120,
  JIN: 40, JIR: 40, VIN: 110, VIR: 110, // in/équiennes jeunes / vieux
};

export function ageCourant(
  opts: { anOrigine?: number | null; clAge?: string | null; anneeCourante?: number },
): number | null {
  const annee = opts.anneeCourante ?? new Date().getFullYear();
  if (opts.anOrigine && opts.anOrigine > 1500 && opts.anOrigine <= annee) {
    return annee - opts.anOrigine;
  }
  const cl = (opts.clAge ?? "").trim().toUpperCase();
  if (cl in CLASSE_AGE_MILIEU) return CLASSE_AGE_MILIEU[cl];
  const n = Number(cl);
  if (Number.isFinite(n) && n > 0 && n < 250) return n;
  return null;
}
