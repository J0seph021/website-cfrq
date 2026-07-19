// Diamètre à maturité financière (DMF) — diamètre à partir duquel un arbre sain
// cesse de gagner de la valeur et commence à en perdre, sur un horizon de 30 ans.
//
// Source des données : Guillemette F., Roy M.-E. et Serban L. G. (Direction de la
// recherche forestière, ministère des Ressources naturelles et des Forêts du Québec),
// « À quel diamètre mes arbres risquent-ils de perdre leur valeur ? », Le Progrès
// Forestier (AFSQ), été 2026. Publication scientifique : https://doi.org/10.82204/nya4-8n06
//
// Les valeurs sont des DMF moyens projetés sur 30 ans (DMF₃₀ ans) et le revenu brut
// d'approvisionnement associé, en dollars par mètre cube. Elles servent à prioriser
// les tiges à récolter, jamais comme seul critère de prescription sylvicole.

export type Revenus = "eleves" | "moderes" | "faibles";
export type Groupe = "feuillu" | "resineux";
export type RisqueClimat = "faible" | "modere" | "eleve" | "incertain";

// Les trois regroupements de régions écologiques utilisés dans l'étude.
export const REGROUPEMENTS = [
  { id: "erablieres-bouclier", court: "Érablières (Bouclier canadien)", long: "Domaines des érablières sur le Bouclier canadien" },
  { id: "sapiniere-bouleau", court: "Sapinière à bouleau jaune (Bouclier)", long: "Domaine de la sapinière à bouleau jaune sur le Bouclier canadien" },
  { id: "plaines-appalaches", court: "Plaines du Saint-Laurent et Appalaches", long: "Plaines du Saint-Laurent et Appalaches" },
] as const;

export type RegroupementId = (typeof REGROUPEMENTS)[number]["id"];

// Une valeur de DMF. `min` signale que l'étude n'a pu établir de DMF dans l'intervalle
// de diamètre observé : le seuil réel est supérieur ou égal à cette valeur (astérisque
// du tableau original), faute d'observations aux plus grands diamètres.
export type ValeurDMF = { cm: number; min?: boolean; revenuBrut: string };

export type Essence = {
  nom: string;
  groupe: Groupe;
  revenus: Revenus;
  risque: RisqueClimat;
  // Un seul DMF, ou une valeur par regroupement de régions écologiques quand elles diffèrent.
  dmf: ValeurDMF | Partial<Record<RegroupementId, ValeurDMF>>;
  note?: string;
};

export const REVENUS_META: Record<Revenus, { label: string; description: string; couleur: string }> = {
  eleves: {
    label: "Revenus élevés",
    description: "Revenu nettement supérieur au coût moyen d'approvisionnement en coupe partielle (~70 $/m³).",
    couleur: "#2e7016",
  },
  moderes: {
    label: "Revenus modérés",
    description: "Revenu généralement comparable au coût moyen d'approvisionnement en coupe partielle.",
    couleur: "#b8860b",
  },
  faibles: {
    label: "Revenus faibles",
    description: "Revenu nettement inférieur au coût moyen d'approvisionnement en coupe partielle.",
    couleur: "#b4531f",
  },
};

export const RISQUE_META: Record<RisqueClimat, { label: string }> = {
  faible: { label: "Risque climatique faible" },
  modere: { label: "Risque climatique modéré" },
  eleve: { label: "Risque climatique élevé" },
  incertain: { label: "Perspectives incertaines" },
};

export const ESSENCES: Essence[] = [
  // — Revenus élevés —
  {
    nom: "Chêne rouge",
    groupe: "feuillu",
    revenus: "eleves",
    risque: "incertain",
    dmf: { cm: 50, min: true, revenuBrut: "125–140 $/m³" },
    note: "Perspectives de croissance incertaines avec l'arrivée de nouveaux ravageurs (dont le flétrissement du chêne) : une hausse même faible de la mortalité ferait fortement chuter ce DMF.",
  },
  {
    nom: "Pin blanc",
    groupe: "resineux",
    revenus: "eleves",
    risque: "modere",
    dmf: { cm: 58, min: true, revenuBrut: "145 $/m³" },
    note: "Bonne résistance à la sécheresse, mais plus de la moitié de son habitat actuel dans le sud du Québec pourrait devenir moins favorable d'ici la fin du siècle. Surveiller la rouille vésiculeuse et l'arrivée de dendroctones.",
  },
  {
    nom: "Épinette blanche et épinette rouge",
    groupe: "resineux",
    revenus: "eleves",
    risque: "eleve",
    dmf: { cm: 32, revenuBrut: "105 $/m³" },
    note: "Habitat largement susceptible de devenir défavorable pour la régénération naturelle. Le longicorne brun de l'épinette, détecté au Québec en 2024, ajoute de l'incertitude. Les programmes de sélection génétique du MRNF visent les plants de reboisement.",
  },

  // — Revenus modérés —
  {
    nom: "Bouleau jaune",
    groupe: "feuillu",
    revenus: "moderes",
    risque: "modere",
    dmf: {
      "erablieres-bouclier": { cm: 48, revenuBrut: "80–105 $/m³" },
      "sapiniere-bouleau": { cm: 52, revenuBrut: "70–80 $/m³" },
      "plaines-appalaches": { cm: 42, min: true, revenuBrut: "65 $/m³" },
    },
    note: "Valeurs pour des arbres sains (classe de priorité CR, toutes qualités de la bille de pied). Environ 55 % du volume seulement se retrouve dans les billes, à cause de la pourriture et d'autres défauts.",
  },
  {
    nom: "Érable à sucre",
    groupe: "feuillu",
    revenus: "moderes",
    risque: "modere",
    dmf: {
      "erablieres-bouclier": { cm: 50, revenuBrut: "80–90 $/m³" },
      "sapiniere-bouleau": { cm: 42, revenuBrut: "60–70 $/m³" },
      "plaines-appalaches": { cm: 52, min: true, revenuBrut: "75–85 $/m³" },
    },
    note: "Valeurs pour des arbres sains (classe de priorité CR, toutes qualités de la bille de pied). Environ 62 % du volume se retrouve dans les billes, à cause de la pourriture et d'autres défauts.",
  },
  {
    nom: "Cerisier tardif",
    groupe: "feuillu",
    revenus: "moderes",
    risque: "modere",
    dmf: { cm: 24, min: true, revenuBrut: "65–75 $/m³" },
    note: "Peut produire des billes de grande valeur, mais seulement 52 % environ du volume apparent est récupérable dans les billes.",
  },
  {
    nom: "Peuplier à grandes dents",
    groupe: "feuillu",
    revenus: "moderes",
    risque: "eleve",
    dmf: { cm: 34, revenuBrut: "75 $/m³" },
  },
  {
    nom: "Peuplier faux-tremble",
    groupe: "feuillu",
    revenus: "moderes",
    risque: "eleve",
    dmf: { cm: 26, revenuBrut: "75 $/m³" },
  },
  {
    nom: "Sapin baumier",
    groupe: "resineux",
    revenus: "moderes",
    risque: "eleve",
    dmf: { cm: 20, revenuBrut: "75 $/m³" },
    note: "DMF le plus bas de l'étude : le sapin atteint sa maturité financière très tôt.",
  },
  {
    nom: "Thuya occidental (cèdre)",
    groupe: "resineux",
    revenus: "moderes",
    risque: "eleve",
    dmf: { cm: 34, revenuBrut: "67 $/m³" },
  },

  // — Revenus faibles —
  {
    nom: "Pruche du Canada",
    groupe: "resineux",
    revenus: "faibles",
    risque: "eleve",
    dmf: { cm: 48, revenuBrut: "32 $/m³" },
    note: "La grande majorité de son habitat actuel pourrait devenir défavorable avec les changements climatiques anticipés.",
  },
  {
    nom: "Tilleul d'Amérique",
    groupe: "feuillu",
    revenus: "faibles",
    risque: "faible",
    dmf: { cm: 44, min: true, revenuBrut: "45–50 $/m³" },
  },
  {
    nom: "Bouleau à papier",
    groupe: "feuillu",
    revenus: "faibles",
    risque: "eleve",
    dmf: { cm: 26, revenuBrut: "50 $/m³" },
    note: "La grande majorité de son habitat actuel pourrait devenir défavorable avec les changements climatiques anticipés.",
  },
  {
    nom: "Érable rouge",
    groupe: "feuillu",
    revenus: "faibles",
    risque: "faible",
    dmf: { cm: 30, revenuBrut: "50 $/m³" },
  },
];

// Résout le DMF d'une essence pour un regroupement donné (retombe sur la valeur unique
// ou la première disponible si l'essence n'a pas de valeur pour ce regroupement).
export function dmfPour(essence: Essence, regroupement: RegroupementId): ValeurDMF {
  if ("cm" in essence.dmf) return essence.dmf as ValeurDMF;
  const parRegion = essence.dmf as Partial<Record<RegroupementId, ValeurDMF>>;
  return parRegion[regroupement] ?? Object.values(parRegion)[0]!;
}

// Vrai si le DMF de l'essence varie selon le regroupement de régions écologiques.
export function dmfVarieSelonRegion(essence: Essence): boolean {
  return !("cm" in essence.dmf);
}
