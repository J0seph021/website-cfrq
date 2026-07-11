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

export { projeterScenarios };
export type { AnalysePeuplement };
