// Adaptateur entre les `properties` d'un peuplement du GeoJSON (cartes.geojson,
// enrichi par export-cartes.mjs) et l'entrée du moteur « courbe de maturité ».
// Sert le branchement UI E1/E2/E3 du focus group.
import { analyserPeuplement, projeterScenarios, type EntreePeuplement, type AnalysePeuplement } from "./index.ts";

// Propriétés de peuplement telles qu'écrites dans le GeoJSON par export-cartes.mjs.
export type PropsPeuplement = {
  gr_ess?: string | null;
  type_eco?: string | null;
  cl_dens?: string | null;
  cl_age_eco?: string | null;
  an_origine?: number | null;
  region_eco?: string | null;
  vmb_ha_reel?: number | null;
  [k: string]: any;
};

export function entreeDepuisProps(p: PropsPeuplement, anneeCourante?: number): EntreePeuplement {
  return {
    grEss: p.gr_ess ?? null,
    typeEco: p.type_eco ?? null,
    clDens: p.cl_dens ?? null,
    clAge: p.cl_age_eco ?? null,
    anOrigine: p.an_origine ?? null,
    regionEco: p.region_eco ?? null,
    vmbHaReel: p.vmb_ha_reel ?? null,
    anneeCourante,
  };
}

// Couleurs du capital forestier (E2). Cohérentes vert/jaune/rouge du moteur.
export const COULEUR_STATUT: Record<AnalysePeuplement["couleur"], string> = {
  vert: "#2f9e44",   // croissance
  jaune: "#f59f00",  // maturité (fenêtre d'intervention)
  rouge: "#e03131",  // décroissance
  gris: "#adb5bd",   // indéterminé (données insuffisantes)
};

export const LEGENDE_CAPITAL: { couleur: string; nom: string }[] = [
  { couleur: COULEUR_STATUT.vert, nom: "En croissance (gagne en valeur)" },
  { couleur: COULEUR_STATUT.jaune, nom: "Mûr — fenêtre d'intervention" },
  { couleur: COULEUR_STATUT.rouge, nom: "En décroissance (au-delà du sommet)" },
  { couleur: COULEUR_STATUT.gris, nom: "Indéterminé (données insuffisantes)" },
];

export function analyseDepuisProps(p: PropsPeuplement, anneeCourante?: number): AnalysePeuplement {
  return analyserPeuplement(entreeDepuisProps(p, anneeCourante));
}

// Petite courbe SVG (sparkline) de la cloche de volume, avec le repère
// « vous êtes ici » — pensée pour le popup de la carte (E1). Retourne une chaîne
// SVG (le popup MapLibre est du HTML injecté).
export function sparklineCourbe(a: AnalysePeuplement, largeur = 240, hauteur = 96): string {
  const pts = a.courbe?.points ?? [];
  if (pts.length < 2) return "";
  const padX = 6, padTop = 8, padBot = 16;
  const ages = pts.map((p) => p.age);
  const vols = pts.map((p) => p.volume);
  const ageMin = Math.min(...ages), ageMax = Math.max(...ages);
  const volMax = Math.max(...vols, 1);
  const sx = (age: number) => padX + ((age - ageMin) / (ageMax - ageMin || 1)) * (largeur - 2 * padX);
  const sy = (v: number) => padTop + (1 - v / volMax) * (hauteur - padTop - padBot);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.age).toFixed(1)},${sy(p.volume).toFixed(1)}`).join(" ");
  const trait = COULEUR_STATUT[a.couleur];

  // Repères verticaux : maturité (optimal de récolte) et sommet de volume.
  const repere = (age: number | null, coul: string, label: string) => {
    if (age == null || age < ageMin || age > ageMax) return "";
    const x = sx(age).toFixed(1);
    return `<line x1="${x}" y1="${padTop}" x2="${x}" y2="${hauteur - padBot}" stroke="${coul}" stroke-width="1" stroke-dasharray="2 2" opacity="0.6"/>`
      + `<text x="${x}" y="${hauteur - 4}" font-size="8" fill="${coul}" text-anchor="middle">${label}</text>`;
  };

  // Point « vous êtes ici ».
  const age = a.pointActuel?.age;
  const vol = a.pointActuel?.volumePredit;
  let ici = "";
  if (age != null && vol != null && age >= ageMin && age <= ageMax) {
    ici = `<circle cx="${sx(age).toFixed(1)}" cy="${sy(vol).toFixed(1)}" r="4" fill="${trait}" stroke="#fff" stroke-width="1.5"/>`;
  }

  return `<svg width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin-top:4px">`
    + `<rect x="0" y="0" width="${largeur}" height="${hauteur}" fill="#f8f9fa" rx="4"/>`
    + repere(a.maturiteBio, "#f59f00", "mûr")
    + repere(a.picVolumeAge, "#e03131", "sommet")
    + `<path d="${d}" fill="none" stroke="${trait}" stroke-width="2"/>`
    + ici
    + `</svg>`;
}

// Noms français des codes d'essence MRNF présents dans eco_dendro.composition
// (les 39 codes portés jusqu'au portail). Sert l'affichage « volumes par essence »
// (B1 du focus group : montrer les volumes, pas de valeur $).
export const NOM_ESSENCE: Record<string, string> = {
  SAB: "Sapin baumier", EPB: "Épinette blanche", EPN: "Épinette noire", EPR: "Épinette rouge",
  EPO: "Épinette de Norvège", PIB: "Pin blanc", PIG: "Pin gris", PIR: "Pin rouge", PIS: "Pin sylvestre",
  MEL: "Mélèze laricin", MEH: "Mélèze hybride", PRU: "Pruche du Canada", THO: "Thuya (cèdre)",
  BOP: "Bouleau à papier", BOJ: "Bouleau jaune (merisier)", BOG: "Bouleau gris",
  ERS: "Érable à sucre", ERR: "Érable rouge", ERA: "Érable argenté",
  PET: "Peuplier faux-tremble", PEG: "Peuplier à grandes dents", PEB: "Peuplier baumier",
  PED: "Peuplier deltoïde", PEH: "Peuplier hybride",
  HEG: "Hêtre à grandes feuilles", TIL: "Tilleul d'Amérique", CET: "Cerisier tardif", CAC: "Caryer cordiforme",
  FRA: "Frêne d'Amérique", FRN: "Frêne noir", FRP: "Frêne rouge",
  CHR: "Chêne rouge", CHB: "Chêne blanc", CHG: "Chêne à gros fruits",
  ORA: "Orme d'Amérique", ORR: "Orme rouge", ORT: "Orme liège", OSV: "Ostryer de Virginie", NOC: "Noyer cendré",
};

// Décode la composition (jsonb {code: vmb_ha}) en liste triée par volume décroissant.
// La valeur peut arriver comme objet (source directe) ou comme chaîne JSON
// (les propriétés de features MapLibre sont sérialisées).
export function compositionParEssence(
  composition: any,
): { code: string; nom: string; vol: number }[] {
  let obj = composition;
  if (typeof obj === "string") { try { obj = JSON.parse(obj); } catch { return []; } }
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj)
    .map(([code, v]) => ({ code, nom: NOM_ESSENCE[code] ?? code, vol: Number(v) || 0 }))
    .filter((e) => e.vol > 0)
    .sort((a, b) => b.vol - a.vol);
}

// Bbox [minLng, minLat, maxLng, maxLat] d'une géométrie GeoJSON (Polygon/MultiPolygon).
export function bboxGeom(geom: any): [number, number, number, number] | null {
  if (!geom?.coordinates) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (a: any) => {
    if (typeof a[0] === "number") {
      if (a[0] < minX) minX = a[0];
      if (a[0] > maxX) maxX = a[0];
      if (a[1] < minY) minY = a[1];
      if (a[1] > maxY) maxY = a[1];
    } else for (const b of a) walk(b);
  };
  walk(geom.coordinates);
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

export type Secteur = { bbox: [number, number, number, number]; n: number };

// Regroupe les peuplements en SECTEURS (regroupement par proximité, single-linkage).
// Sert à cadrer la carte sur la forêt du client même quand ses lots sont très
// dispersés (ex. GoForest : 2 secteurs à ~65 km ; à l'échelle de tout, les
// peuplements deviennent invisibles). Retour trié par nombre de peuplements.
export function secteursPeuplements(features: any[], seuilM = 6000): Secteur[] {
  const items = (features ?? [])
    .filter((f) => f?.properties?.couche === "peuplement")
    .map((f) => bboxGeom(f.geometry))
    .filter(Boolean) as [number, number, number, number][];
  if (!items.length) return [];
  const centre = (b: number[]) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const distM = (a: number[], b: number[]) => {
    const dx = (a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180) * 111320;
    const dy = (a[1] - b[1]) * 110540;
    return Math.hypot(dx, dy);
  };
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const cx = items.map(centre);
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++)
      if (distM(cx[i], cx[j]) < seuilM) parent[find(i)] = find(j);
  const groupes = new Map<number, [number, number, number, number]>();
  const compte = new Map<number, number>();
  items.forEach((it, i) => {
    const r = find(i);
    const b = groupes.get(r);
    if (!b) groupes.set(r, [...it] as [number, number, number, number]);
    else {
      b[0] = Math.min(b[0], it[0]); b[1] = Math.min(b[1], it[1]);
      b[2] = Math.max(b[2], it[2]); b[3] = Math.max(b[3], it[3]);
    }
    compte.set(r, (compte.get(r) ?? 0) + 1);
  });
  return [...groupes.entries()]
    .map(([r, bbox]) => ({ bbox, n: compte.get(r)! }))
    .sort((a, b) => b.n - a.n);
}

export { projeterScenarios };
export type { AnalysePeuplement };
