// Projection « avec / sans intervention » sur un horizon d'une vie (50-70 ans).
// Sert le constat 1 (E3) : montrer la décision. On s'appuie sur les courbes
// Pothier-Savard déjà validées (Phase 0) :
//
//  - SANS INTERVENTION : le peuplement suit sa trajectoire naturelle, qui
//    plafonne puis DÉCROÎT (sénescence intégrée aux tables). C'est le « si tu
//    ne fais rien, voici ce qui se passe ».
//  - AVEC INTERVENTION : récolte à l'âge optimal (maturité, ou maintenant si le
//    peuplement est déjà au-delà) puis régénération d'un nouveau peuplement
//    équienne sur la même station. C'est le « si tu interviens ».
//
// Portée : peuplements équiennes (régime dominant en forêt privée). Les coupes
// partielles / éclaircies et les peuplements irréguliers relèvent de Natura-2014
// (à intégrer plus tard en tabulant des simulations Capsis, même patron que
// Pothier-Savard). Trajectoire indicative, pas une prescription.
import { especeDepuisGrEss, densiteDepuisClasse, ageCourant } from "./especes.ts";
import { iqsDepuisTypeEco } from "./iqs.ts";
import { volumeAAge, construireCourbe } from "./courbe.ts";
import type { EntreePeuplement } from "./index.ts";

export type Scenario = "sans_intervention" | "recolte_regeneration";

export type Trajectoire = {
  scenario: Scenario;
  libelle: string;
  points: { annee: number; ageStand: number; volume: number }[]; // annee = années à partir d'aujourd'hui
  ageRecolte: number | null;   // âge du peuplement à la récolte (null si aucune)
  anneeRecolte: number | null; // année (relative) de la récolte
  volumeRecolte: number;       // volume prélevé (m³/ha)
  volumeFinal: number;         // volume sur pied à la fin de l'horizon
};

export type ProjectionScenarios = {
  espece: string;
  ageDepart: number;
  horizonAns: number;
  maturiteBio: number | null;
  picVolumeAge: number | null;
  sansIntervention: Trajectoire;
  avecIntervention: Trajectoire;
  synthese: string;
};

const PAS = 5; // pas d'échantillonnage (ans)

export function projeterScenarios(e: EntreePeuplement, horizonAns = 50): ProjectionScenarios | null {
  const espece = especeDepuisGrEss(e.grEss);
  const densite = densiteDepuisClasse(e.clDens);
  const age = e.age ?? ageCourant({ anOrigine: e.anOrigine, clAge: e.clAge, anneeCourante: e.anneeCourante });
  if (!espece || age == null) return null;
  const iqsRes = iqsDepuisTypeEco(espece.ps, e.typeEco, e.regionEco);
  if (!iqsRes) return null;
  const courbe = construireCourbe(espece.ps, densite, iqsRes.iqs);
  if (!courbe) return null;

  const vol = (a: number) => Math.max(0, Math.round((volumeAAge(espece.ps, densite, iqsRes.iqs, a) ?? 0) * 10) / 10);
  const mat = courbe.maturiteBio;
  const pic = courbe.picVolumeAge;

  // Âge de récolte : à maturité si elle est devant nous, sinon maintenant
  // (peuplement déjà mûr ou en décroissance -> on ne laisse pas perdre le capital).
  const ageRecolte = mat != null && mat > age ? mat : age;
  const anneeRecolte = ageRecolte - age;

  // --- Sans intervention : trajectoire naturelle sur l'horizon ---
  const ptsSans: Trajectoire["points"] = [];
  for (let t = 0; t <= horizonAns; t += PAS) {
    ptsSans.push({ annee: t, ageStand: age + t, volume: vol(age + t) });
  }

  // --- Avec intervention : suivre jusqu'à la récolte, prélever, régénérer ---
  const ptsAvec: Trajectoire["points"] = [];
  for (let t = 0; t <= horizonAns; t += PAS) {
    if (t < anneeRecolte) {
      ptsAvec.push({ annee: t, ageStand: age + t, volume: vol(age + t) });
    } else {
      const ageRegen = age + t - ageRecolte; // nouveau peuplement, âge = temps depuis la coupe
      ptsAvec.push({ annee: t, ageStand: ageRegen, volume: vol(ageRegen) });
    }
  }
  const volumeRecolte = vol(ageRecolte);

  const sansIntervention: Trajectoire = {
    scenario: "sans_intervention",
    libelle: "Sans intervention (trajectoire naturelle)",
    points: ptsSans,
    ageRecolte: null, anneeRecolte: null, volumeRecolte: 0,
    volumeFinal: ptsSans[ptsSans.length - 1].volume,
  };
  const avecIntervention: Trajectoire = {
    scenario: "recolte_regeneration",
    libelle: `Récolte à ${ageRecolte} ans puis régénération`,
    points: ptsAvec,
    ageRecolte, anneeRecolte, volumeRecolte,
    volumeFinal: ptsAvec[ptsAvec.length - 1].volume,
  };

  // Synthèse : capital total mobilisé (récolté + sur pied) vs laissé sur pied.
  const totalAvec = volumeRecolte + avecIntervention.volumeFinal;
  const totalSans = sansIntervention.volumeFinal;
  const gain = Math.round(totalAvec - totalSans);
  const synthese = pic != null && age >= pic
    ? `Peuplement au-delà du sommet de volume (${pic} ans) : sans intervention, le capital continue de se dégrader. `
      + `Récolter maintenant mobilise ${Math.round(volumeRecolte)} m³/ha et relance un peuplement productif.`
    : `Sur ${horizonAns} ans : sans intervention, ${Math.round(totalSans)} m³/ha sur pied (avec pertes de sénescence en fin de course). `
      + `Avec récolte à maturité puis régénération, ${Math.round(volumeRecolte)} m³/ha mobilisés + ${Math.round(avecIntervention.volumeFinal)} m³/ha en croissance `
      + `(${gain >= 0 ? "+" : ""}${gain} m³/ha de capital total).`;

  return {
    espece: espece.nom,
    ageDepart: age,
    horizonAns,
    maturiteBio: mat,
    picVolumeAge: pic,
    sansIntervention,
    avecIntervention,
    synthese,
  };
}
