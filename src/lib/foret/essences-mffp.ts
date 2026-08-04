// Décodage des essences d'arbres du champ `essences` des peuplements.
//
// POURQUOI CE MODULE
// Le champ `essences` de `planilogix.peuplements` arrive dans DEUX formats, selon
// la génération de la synthèse écoforestière qui l'a produit :
//   1. codes MFFP bruts séparés par virgule   -> "SB, SB, EO", "FX, FX", "RZ"
//   2. noms déjà décodés séparés par barre    -> "Érables / Bouleau à papier / Sapin baumier"
// L'ancien comptage ne découpait que sur « / » : chaque chaîne de codes était donc
// comptée comme UNE essence, ce qui gonflait le total (52 « essences » chez un
// client, dont 37 étaient en réalité des codes bruts affichés tels quels).
//
// RÈGLE : on ne compte que de vraies essences d'ARBRES, et on n'invente jamais.
// Un code inconnu est ignoré (jamais affiché au propriétaire), un regroupement
// (« Feuillus tolérants », « Résineux indéterminés », « Érables ») n'est pas une
// essence, et les arbustes / herbacées ne sont pas des arbres.
//
// Source des codes : norme de stratification écoforestière du MFFP, Tableau 9
// (essences, combinaisons et associations d'essences). Même table que
// `ESSENCE_CODES_MFFP` dans planilogix/core/ecoforestier.py — garder les deux
// synchronisées si le ministère fait évoluer la norme.

// Codes d'ESSENCES uniquement. Les codes de REGROUPEMENT (CH, ER, OR, PE, PI, SE,
// EP, FH, FI, FN, FT, FX, FZ, RX, RZ) sont volontairement absents : ce ne sont pas
// des essences, donc ils ne doivent pas gonfler le compte.
export const CODES_ESSENCE_MFFP: Record<string, string> = {
  // --- Feuillus ---
  BP: "Bouleau à papier",
  BG: "Bouleau gris",
  BJ: "Bouleau jaune (merisier)",
  CF: "Caryer à fruits doux",
  CC: "Caryer cordiforme",
  CT: "Cerisier tardif",
  CG: "Chêne à gros fruits",
  CI: "Chêne bicolore",
  CB: "Chêne blanc",
  CR: "Chêne rouge",
  EA: "Érable argenté",
  EI: "Érable noir",
  ES: "Érable à sucre",
  EO: "Érable rouge",
  FA: "Frêne d'Amérique (blanc)",
  FP: "Frêne de Pennsylvanie (rouge)",
  FO: "Frêne noir",
  HG: "Hêtre à grandes feuilles",
  NC: "Noyer cendré",
  NN: "Noyer noir",
  OA: "Orme d'Amérique",
  OT: "Orme de Thomas",
  OO: "Orme rouge",
  OV: "Ostryer de Virginie",
  PL: "Peuplier à feuilles deltoïdes",
  PD: "Peuplier à grandes dents",
  PA: "Peuplier baumier",
  PO: "Peuplier européen",
  PT: "Peuplier faux-tremble",
  PH: "Peuplier hybride",
  TA: "Tilleul d'Amérique",
  // --- Résineux ---
  EB: "Épinette blanche",
  EN: "Épinette noire",
  EU: "Épinette rouge",
  ME: "Mélèze européen",
  MH: "Mélèze hybride",
  ML: "Mélèze laricin",
  MJ: "Mélèze japonais",
  PB: "Pin blanc",
  PG: "Pin gris",
  PC: "Pin rigide",
  PR: "Pin rouge",
  PS: "Pin sylvestre",
  PU: "Pruche du Canada",
  SB: "Sapin baumier",
  TO: "Thuya occidental (cèdre)",
  // --- Alias SIGGA à 3 caractères, présents dans certains imports ---
  ERS: "Érable à sucre", ERR: "Érable rouge", BOJ: "Bouleau jaune (merisier)",
  BOP: "Bouleau à papier", BOG: "Bouleau gris", HEG: "Hêtre à grandes feuilles",
  CHR: "Chêne rouge", FRA: "Frêne d'Amérique (blanc)", FRN: "Frêne noir",
  TIL: "Tilleul d'Amérique", CET: "Cerisier tardif", PEG: "Peuplier à grandes dents",
  PET: "Peuplier faux-tremble", PEB: "Peuplier baumier", SAB: "Sapin baumier",
  EPB: "Épinette blanche", EPN: "Épinette noire", EPR: "Épinette rouge",
  THO: "Thuya occidental (cèdre)", PIB: "Pin blanc", PIR: "Pin rouge", PIJ: "Pin gris",
  PRU: "Pruche du Canada", MEL: "Mélèze laricin", NOC: "Noyer cendré",
  ORA: "Orme d'Amérique", OSV: "Ostryer de Virginie",
};

// Accents combinants laissés par normalize("NFD") (U+0300 à U+036F).
const MARQUES_COMBINANTES = new RegExp("[\\u0300-\\u036f]", "g");

// Clé de comparaison : minuscules, sans accents, sans parenthèse, espaces normalisés.
// Permet de dédupliquer « Érable rouge (plaine) » et « EO » -> « Érable rouge ».
function normaliser(s: string): string {
  // NFD décompose « é » en « e » + accent combinant. L'accent doit être retiré par
  // une chaine VIDE : le remplacer par une espace (comme la ponctuation) couperait
  // le mot en deux (« Érables » -> « e rables ») et ferait echouer toutes les
  // comparaisons de regroupements. Classe construite depuis une chaine pour ne pas
  // laisser de caractères combinants invisibles dans le source.
  return s
    .normalize("NFD")
    .replace(MARQUES_COMBINANTES, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-zA-Z]+/g, " ")
    .trim()
    .toLowerCase();
}

// Index des noms canoniques par clé normalisée (pour rallier les variantes de
// libellé d'une même essence : « Thuya occidental » et « Thuya occidental (cèdre) »).
const CANON_PAR_CLE: Record<string, string> = {};
for (const nom of Object.values(CODES_ESSENCE_MFFP)) {
  const cle = normaliser(nom);
  // La variante la plus explicite gagne (celle qui porte la parenthèse d'usage).
  if (!CANON_PAR_CLE[cle] || nom.length > CANON_PAR_CLE[cle].length) CANON_PAR_CLE[cle] = nom;
}
// Variantes de libellé rencontrées dans les données historiques.
CANON_PAR_CLE["pruche de l est"] = "Pruche du Canada";

// Regroupements au PLURIEL : « Érables », « Épinettes »... Ce n'est pas une essence.
const PLURIELS_REGROUPEMENT = new Set([
  "erables", "bouleaux", "epinettes", "peupliers", "pins", "frenes", "ormes",
  "tilleuls", "chenes", "cerisiers", "melezes", "sapins", "caryers", "noyers",
  "saules", "aulnes", "cornouillers", "pommiers", "sorbiers", "aubepines",
]);

// Regroupements et non-arbres (arbustes, herbacées, sol nu). Testé sur la clé
// normalisée, donc sans accents.
const NON_ESSENCE =
  /^(feuillus|resineux|autres|sapin et epinette)\b|^(none|null|inconnu|indetermine)$|broussaille|herbac|ericac|framboisier|noisetier|arbuste|denud|coupe|regener|friche|chemin|gravier|^eau$|^sol$/;

/**
 * Décode le champ `essences` d'un peuplement en liste de noms d'essences d'arbres.
 * Accepte les deux formats (codes séparés par virgule, noms séparés par « / »).
 * Les codes inconnus, les regroupements et les non-arbres sont écartés.
 */
export function essencesDuChamp(raw: unknown): string[] {
  const out: string[] = [];
  for (const brut of String(raw ?? "").split(/[/,;]+/)) {
    const tok = brut.trim();
    if (!tok) continue;

    // 1. Code MFFP (2 ou 3 lettres) -> nom officiel, ou rejet si inconnu.
    if (/^[A-Za-z]{2,3}$/.test(tok)) {
      const nom = CODES_ESSENCE_MFFP[tok.toUpperCase()];
      if (nom) out.push(nom);
      continue; // code non reconnu : on n'invente pas.
    }

    // 2. Nom déjà décodé -> on garde si c'est bien une essence d'arbre.
    const cle = normaliser(tok);
    if (cle.length < 3 || PLURIELS_REGROUPEMENT.has(cle) || NON_ESSENCE.test(cle)) continue;
    out.push(CANON_PAR_CLE[cle] ?? tok);
  }
  return out;
}

/** Liste triée et dédupliquée des essences d'arbres d'un ensemble de peuplements. */
export function essencesArbres(peuplements: { essences?: unknown }[]): string[] {
  const parCle = new Map<string, string>();
  for (const p of peuplements) {
    for (const nom of essencesDuChamp(p.essences)) {
      const cle = normaliser(nom);
      const vu = parCle.get(cle);
      if (!vu || nom.length > vu.length) parCle.set(cle, nom);
    }
  }
  return [...parCle.values()].sort((a, b) => a.localeCompare(b, "fr"));
}
