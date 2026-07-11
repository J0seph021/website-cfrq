// Harnais de validation Phase 0 (exécuter : node src/lib/foret/__verify.ts).
// 1) points publiés Pothier-Savard (identité d'interpolation à IQS exact) ;
// 2) peuplements RÉELS tirés de PlaniLogix (eco_pee + eco_dendro.vmb_ha).
import { analyserPeuplement, projeterScenarios } from "./index.ts";
import { volumeAAge, construireCourbe } from "./courbe.ts";
import { iqsDepuisTypeEco } from "./iqs.ts";

let ok = 0, ko = 0;
const check = (nom: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "  OK " : "  XX "} ${nom}${detail ? "  — " + detail : ""}`);
  cond ? ok++ : ko++;
};

console.log("== 1. Points publiés Pothier-Savard (SAB MOYENNE IQS12) ==");
// Table SAB MOYENNE IQS12 (âge total = âge à 1 m + 5) : V(70)=92, V(90)=117, pic V(120)=138.
for (const [age, attendu] of [[70, 92], [90, 117], [120, 138]] as const) {
  const v = volumeAAge("SAB", "MOYENNE", 12, age);
  check(`V(SAB,12,${age}) ≈ ${attendu} m³/ha`, v != null && Math.abs(v - attendu) <= 1.5, `obtenu ${v}`);
}
const cSab = construireCourbe("SAB", "MOYENNE", 12)!;
check("maturité bio SAB IQS12 ≈ 70 ans", Math.abs((cSab.maturiteBio ?? 0) - 70) <= 6, `= ${cSab.maturiteBio}`);
check("pic volume SAB IQS12 ≈ 120 ans", Math.abs((cSab.picVolumeAge ?? 0) - 120) <= 6, `= ${cSab.picVolumeAge}`);
check("courbe croît puis décroît", (() => {
  const v = cSab.points.map((p) => p.volume); const pk = v.indexOf(Math.max(...v));
  return v.slice(0, pk).every((x, i) => i === 0 || x >= v[i - 1] - 2) && v.slice(pk).every((x, i) => i === 0 || x <= v[pk + i - 1] + 2);
})());
check("interpolation IQS 13.5 entre 12 et 15", (() => {
  const v12 = volumeAAge("SAB", "MOYENNE", 12, 60)!, v15 = volumeAAge("SAB", "MOYENNE", 15, 60)!;
  const v135 = volumeAAge("SAB", "MOYENNE", 13.5, 60)!;
  return v135 > Math.min(v12, v15) - 0.1 && v135 < Math.max(v12, v15) + 0.1;
})());

console.log("\n== 2. Peuplements réels PlaniLogix (âge au 2026) ==");
type Fx = { grEss: string; typeEco: string; clDens: string; clAge: string; anOrigine: number; vmbHa: number };
const fixtures: Fx[] = [
  { grEss: "BPBP", typeEco: "MS13", clDens: "A", clAge: "50", anOrigine: 1986, vmbHa: 186.5 },
  { grEss: "BPBP", typeEco: "MS22", clDens: "D", clAge: "50", anOrigine: 1965, vmbHa: 61.9 },
  { grEss: "EBEB", typeEco: "MS24", clDens: "C", clAge: "JIN", anOrigine: 2002, vmbHa: 107.4 },
  { grEss: "EBEB", typeEco: "MS21", clDens: "C", clAge: "JIN", anOrigine: 1999, vmbHa: 156.3 },
  { grEss: "ENEN", typeEco: "RS20", clDens: "B", clAge: "50", anOrigine: 1955, vmbHa: 144.7 },
  { grEss: "ENEN", typeEco: "RE22", clDens: "C", clAge: "50", anOrigine: 1955, vmbHa: 75.6 },
  { grEss: "EPEP", typeEco: "RS20", clDens: "C", clAge: "70", anOrigine: 1932, vmbHa: 122.7 },
  { grEss: "EPEP", typeEco: "RS20", clDens: "B", clAge: "90", anOrigine: 1932, vmbHa: 103.1 },
  { grEss: "PEPE", typeEco: "MS25", clDens: "A", clAge: "30", anOrigine: 1988, vmbHa: 141.2 },
  { grEss: "PGPG", typeEco: "RS21", clDens: "D", clAge: "30", anOrigine: 1991, vmbHa: 59.7 },
  { grEss: "PGPG", typeEco: "RE21", clDens: "C", clAge: "70", anOrigine: 1945, vmbHa: 70.9 },
  { grEss: "SBSB", typeEco: "RS22", clDens: "B", clAge: "30", anOrigine: 1975, vmbHa: 60.9 },
  { grEss: "SBSB", typeEco: "MS12", clDens: "A", clAge: "30", anOrigine: 1985, vmbHa: 141.3 },
];

let resolus = 0, ancrables = 0;
for (const f of fixtures) {
  const a = analyserPeuplement({ ...f, anneeCourante: 2026 });
  if (a.espece && a.iqs != null && a.courbe) resolus++;
  const vp = a.pointActuel?.volumePredit;
  const ratio = vp != null && f.vmbHa > 0 ? vp / f.vmbHa : null;
  if (ratio != null && ratio > 0.3 && ratio < 3.0) ancrables++;
  console.log(
    `  ${f.grEss}/${f.typeEco}/${f.clDens}  âge=${a.ageCourant}  ` +
    `IQS=${a.iqs ?? "—"}  Vprédit=${vp ?? "—"}  Vréel=${f.vmbHa}  ` +
    `ratio=${ratio ? ratio.toFixed(2) : "—"}  [${a.statutCapital}/${a.couleur}] ` +
    `${a.espece?.confiance ?? ""}/${a.iqsNiveau ?? "—"}/${a.fiabilite}`,
  );
}
check(`${fixtures.length}/${fixtures.length} peuplements résolus (essence+IQS+courbe)`, resolus === fixtures.length, `${resolus} résolus`);
check("volume prédit dans un facteur 3 du réel pour la majorité", ancrables >= Math.ceil(fixtures.length * 0.7), `${ancrables}/${fixtures.length}`);

console.log("\n== 3. Raffinement par région écologique (SAB RS22 : 6a riche, 6n pauvre) ==");
const sansRegion = iqsDepuisTypeEco("SAB", "RS22")!;
const r6a = iqsDepuisTypeEco("SAB", "RS22", "6a")!;
const r6n = iqsDepuisTypeEco("SAB", "RS22", "6n")!;
console.log(`  sans région : IQS=${sansRegion.iqs} [${sansRegion.niveau}]`);
console.log(`  région 6a   : IQS=${r6a.iqs} [${r6a.niveau}]`);
console.log(`  région 6n   : IQS=${r6n.iqs} [${r6n.niveau}]`);
check("sans région = moyenne inter-régions (niveau exact, rétrocompatible)", sansRegion.niveau === "exact" && sansRegion.region === null);
check("région fournie => IQS régional précis (niveau exact_region)", r6a.niveau === "exact_region" && r6n.niveau === "exact_region");
check("région change réellement l'IQS (6a nettement > 6n)", r6a.iqs - r6n.iqs > 6, `écart ${(r6a.iqs - r6n.iqs).toFixed(1)} m`);
const v6a = analyserPeuplement({ grEss: "SBSB", typeEco: "RS22", clDens: "B", age: 60, regionEco: "6a" }).pointActuel?.volumePredit ?? 0;
const v6n = analyserPeuplement({ grEss: "SBSB", typeEco: "RS22", clDens: "B", age: 60, regionEco: "6n" }).pointActuel?.volumePredit ?? 0;
check("la région propage jusqu'au volume prédit", v6a > v6n + 20, `V(6a)=${v6a} vs V(6n)=${v6n} m³/ha à 60 ans`);

console.log("\n== 4. Projection avec/sans intervention (E3) ==");
// Peuplement d'épinette noire au-delà du sommet de volume : sans intervention,
// le capital se dégrade ; récolter maintenant le mobilise.
const projMur = projeterScenarios({ grEss: "ENEN", typeEco: "RS20", clDens: "B", age: 150 }, 50)!;
const vDepartMur = projMur.sansIntervention.points[0].volume;
console.log(`  ${projMur.espece}, ${projMur.ageDepart} ans (maturité=${projMur.maturiteBio}, pic=${projMur.picVolumeAge}), horizon ${projMur.horizonAns} ans`);
console.log(`  sans : ${vDepartMur} → ${projMur.sansIntervention.volumeFinal} m³/ha sur pied`);
console.log(`  avec : récolte ${projMur.avecIntervention.volumeRecolte} m³/ha à ${projMur.avecIntervention.ageRecolte} ans, puis ${projMur.avecIntervention.volumeFinal} m³/ha`);
console.log(`  → ${projMur.synthese}`);
check("projection : 2 trajectoires échantillonnées sur l'horizon", projMur.sansIntervention.points.length > 5 && projMur.avecIntervention.points.length > 5);
check("stand au-delà du pic : sans intervention décroît sur l'horizon", projMur.sansIntervention.volumeFinal < vDepartMur, `${vDepartMur} → ${projMur.sansIntervention.volumeFinal}`);
check("stand mûr : récolte maintenant (âge récolte = âge actuel)", projMur.avecIntervention.ageRecolte === 150 && projMur.avecIntervention.volumeRecolte > 0);
// Peuplement jeune en croissance : récolte repoussée à la maturité.
const projJeune = projeterScenarios({ grEss: "SBSB", typeEco: "MS12", clDens: "A", age: 30 }, 60)!;
check("stand jeune : récolte repoussée à la maturité (> âge actuel)", (projJeune.avecIntervention.ageRecolte ?? 0) > 30, `récolte à ${projJeune.avecIntervention.ageRecolte} ans`);
check("avec intervention : le peuplement régénéré repousse (volume final > 0)", projJeune.avecIntervention.volumeFinal > 0);

console.log(`\n== Bilan : ${ok} OK, ${ko} KO ==`);
if (ko > 0) throw new Error(`${ko} vérification(s) en échec`);
