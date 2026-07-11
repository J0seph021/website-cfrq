// Moteur « courbe de maturité / capital forestier » (Phase 0 du constat 1).
// Assemble : composition -> essence Pothier-Savard, type écologique -> IQS,
// puis courbe de volume, âge de maturité, et statut croissance / décroissance.
//
// Tout repose sur des données publiques : tables de production Pothier-Savard
// (1998) et IQS par type écologique de Laflèche et al. (2013). Aucune valeur
// n'est inventée ; le moteur ne fait que combiner et interpoler ces sources.
import {
  especeDepuisGrEss, densiteDepuisClasse, ageCourant,
  type CodePS, type Densite, type Confiance,
} from "./especes.ts";
import { iqsDepuisTypeEco, type NiveauIqs } from "./iqs.ts";
import { construireCourbe, volumeAAge, type Courbe } from "./courbe.ts";

export type StatutCapital = "croissance" | "maturite" | "decroissance" | "indetermine";

export type EntreePeuplement = {
  grEss?: string | null;      // composition (ex. "ENEN")
  typeEco?: string | null;    // type écologique (ex. "RS22")
  clDens?: string | null;     // classe de densité (A/B/C/D)
  anOrigine?: number | null;  // année d'origine
  clAge?: string | null;      // classe d'âge (ex. "50")
  age?: number | null;        // âge courant explicite (prioritaire s'il est fourni)
  vmbHaReel?: number | null;  // volume marchand réel eco_dendro.vmb_ha (ancrage)
  regionEco?: string | null;  // région écologique (ex. "4f") — IQS régional précis si fournie
  anneeCourante?: number;     // défaut : année en cours
};

export type AnalysePeuplement = {
  espece: { ps: CodePS; nom: string; confiance: Confiance; codeSource: string } | null;
  densite: Densite;
  iqs: number | null;
  ageCourant: number | null;
  courbe: Courbe | null;
  pointActuel: {
    age: number;
    volumePredit: number | null;
    volumeReel: number | null;
    aamCourant: number | null;          // accroissement annuel moyen (V/âge)
    accroissementCourant: number | null; // pente dV/dt (m3/ha/an) — signe = croissance/décroissance
  } | null;
  maturiteBio: number | null;
  picVolumeAge: number | null;
  statutCapital: StatutCapital;
  couleur: "vert" | "jaune" | "rouge" | "gris";
  message: string;
  fiabilite: "bonne" | "moyenne" | "faible";
  iqsNiveau: NiveauIqs | null;
  sources: string[];
};

// Fiabilité globale = combinaison de la correspondance d'essence et du niveau
// de repli utilisé pour lire l'IQS.
function fiabilite(conf: Confiance, niveau: NiveauIqs): "bonne" | "moyenne" | "faible" {
  const iqsBon = niveau === "exact_region" || niveau === "exact";
  const iqsMoyen = niveau === "groupe_vegetation" || niveau === "type_autre_essence";
  if (conf === "direct" && iqsBon) return "bonne";
  if (conf === "direct" && iqsMoyen) return "moyenne";
  if (conf === "proxy" && (iqsBon || iqsMoyen)) return "moyenne";
  return "faible";
}

const SOURCES = [
  "Pothier & Savard (1998), Tables de production, MRNF (domaine public).",
  "Laflèche et al. (2013), IQS par type écologique, MRNF (domaine public).",
];

// Pente locale de la courbe (m3/ha/an) autour de l'âge courant.
function accroissement(esp: CodePS, dens: Densite, iqs: number, age: number): number | null {
  const a = volumeAAge(esp, dens, iqs, Math.max(0, age - 5));
  const b = volumeAAge(esp, dens, iqs, age + 5);
  if (a == null || b == null) return null;
  return Math.round(((b - a) / 10) * 100) / 100;
}

export function analyserPeuplement(e: EntreePeuplement): AnalysePeuplement {
  const espece = especeDepuisGrEss(e.grEss);
  const densite = densiteDepuisClasse(e.clDens);
  const age = e.age ?? ageCourant({ anOrigine: e.anOrigine, clAge: e.clAge, anneeCourante: e.anneeCourante });

  const base: AnalysePeuplement = {
    espece: espece ? { ps: espece.ps, nom: espece.nom, confiance: espece.conf, codeSource: espece.codeSource } : null,
    densite, iqs: null, ageCourant: age, courbe: null, pointActuel: null,
    maturiteBio: null, picVolumeAge: null, statutCapital: "indetermine",
    couleur: "gris", message: "Données insuffisantes pour établir la courbe.",
    fiabilite: "faible", iqsNiveau: null, sources: SOURCES,
  };

  if (!espece) {
    base.message = "Essence non reconnue : impossible d'établir la courbe de croissance.";
    return base;
  }
  const iqsRes = iqsDepuisTypeEco(espece.ps, e.typeEco, e.regionEco);
  if (!iqsRes) {
    base.message = "Type écologique absent du référentiel IQS : courbe non établie.";
    return base;
  }
  base.iqs = iqsRes.iqs;
  base.iqsNiveau = iqsRes.niveau;

  const courbe = construireCourbe(espece.ps, densite, iqsRes.iqs);
  if (!courbe) {
    base.message = "Table de production indisponible pour cette essence.";
    return base;
  }
  base.courbe = courbe;
  base.maturiteBio = courbe.maturiteBio;
  base.picVolumeAge = courbe.picVolumeAge;

  if (age == null) {
    base.statutCapital = "indetermine";
    base.message = "Courbe établie, mais l'âge du peuplement est inconnu (position « vous êtes ici » indisponible).";
    base.fiabilite = fiabilite(espece.conf, iqsRes.niveau);
    return base;
  }

  const volumePredit = volumeAAge(espece.ps, densite, iqsRes.iqs, age);
  const aam = volumePredit != null && age > 0 ? Math.round((volumePredit / age) * 100) / 100 : null;
  base.pointActuel = {
    age,
    volumePredit: volumePredit != null ? Math.round(volumePredit * 10) / 10 : null,
    volumeReel: e.vmbHaReel ?? null,
    aamCourant: aam,
    accroissementCourant: accroissement(espece.ps, densite, iqsRes.iqs, age),
  };

  // Statut du capital forestier selon la position sur la courbe.
  const mat = courbe.maturiteBio, pic = courbe.picVolumeAge;
  if (mat != null && age < mat) {
    base.statutCapital = "croissance";
    base.couleur = "vert";
    base.message = `Capital en croissance : le peuplement gagne encore en valeur (maturité vers ${mat} ans).`;
  } else if (pic != null && age < pic) {
    base.statutCapital = "maturite";
    base.couleur = "jaune";
    base.message = `Peuplement mûr : passé l'âge optimal de récolte (${mat} ans), le gain ralentit. Fenêtre d'intervention.`;
  } else if (pic != null) {
    base.statutCapital = "decroissance";
    base.couleur = "rouge";
    base.message = `Capital en décroissance : au-delà du sommet de volume (${pic} ans), les pertes dépassent la croissance.`;
  }

  base.fiabilite = fiabilite(espece.conf, iqsRes.niveau);
  return base;
}

export { projeterScenarios } from "./projection.ts";
export type { Scenario, Trajectoire, ProjectionScenarios } from "./projection.ts";
export type { CodePS, Densite, Courbe };
