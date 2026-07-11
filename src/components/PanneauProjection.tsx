// Panneau de projection « avec / sans intervention » (E3 du focus group).
// S'affiche à côté de la carte quand on clique « Projection » dans un peuplement.
// Montre les deux trajectoires de volume sur 50 ans + la décision à prendre.
import { useEffect } from "react";
import { projeterScenarios } from "../lib/foret";
import { entreeDepuisProps } from "../lib/foret/adaptateur";

type Props = {
  props: Record<string, any>;
  anneeCourante: number;
  onClose: () => void;
};

const COUL_SANS = "#e03131"; // rouge : trajectoire naturelle (déclin)
const COUL_AVEC = "#2f9e44"; // vert : récolte + régénération

export default function PanneauProjection({ props, anneeCourante, onClose }: Props) {
  // Échap ferme le panneau.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const proj = projeterScenarios(entreeDepuisProps(props, anneeCourante), 50);
  const nom = props.appellation || "Peuplement";

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" role="dialog" aria-modal="true" aria-label="Projection du peuplement">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-auto bg-white shadow-2xl sm:rounded-l-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-black/5 bg-cfrq-deep px-5 py-4 text-white">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-white/60">Projection sur 50 ans</p>
            <h3 className="text-[15px] font-semibold leading-snug">{nom}</h3>
            {props.no_peup && <p className="text-[12px] text-white/70">Peuplement nº {props.no_peup}</p>}
          </div>
          <button onClick={onClose} aria-label="Fermer" className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-sm hover:bg-white/20">✕</button>
        </div>

        {!proj ? (
          <div className="px-5 py-6 text-[13.5px] leading-relaxed text-black/70">
            <p className="mb-2 font-medium text-cfrq-deep">Projection indisponible pour ce peuplement.</p>
            <p className="text-black/60">
              Il manque l'essence ou le type écologique nécessaire pour établir la courbe de croissance
              (Pothier-Savard). Les milieux non forestiers (eau, marécage, habitation) n'ont pas de projection.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-5 py-4">
            <Graphique proj={proj} />

            <div className="grid grid-cols-2 gap-2 text-[12.5px]">
              <Carte titre="Sans intervention" couleur={COUL_SANS}
                lignes={[
                  `Aujourd'hui : ${Math.round(volAuj(proj))} m³/ha`,
                  `Dans ${proj.horizonAns} ans : ${Math.round(proj.sansIntervention.volumeFinal)} m³/ha sur pied`,
                ]} />
              <Carte titre="Avec intervention" couleur={COUL_AVEC}
                lignes={[
                  proj.avecIntervention.ageRecolte != null
                    ? `Récolte à ${proj.avecIntervention.ageRecolte} ans : ${Math.round(proj.avecIntervention.volumeRecolte)} m³/ha`
                    : "Pas de récolte proposée",
                  `Puis ${Math.round(proj.avecIntervention.volumeFinal)} m³/ha en croissance`,
                ]} />
            </div>

            <div className="rounded-xl bg-cfrq-green/5 p-3.5 text-[13px] leading-relaxed text-cfrq-deep ring-1 ring-cfrq-green/15">
              <p className="mb-1 font-semibold">La décision que vous prenez</p>
              <p className="text-black/75">{proj.synthese}</p>
            </div>

            <a
              href="/contact/"
              className="rounded-xl bg-cfrq-green px-4 py-2.5 text-center text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-cfrq-deep"
            >
              Discuter de ce peuplement avec un ingénieur forestier →
            </a>

            <p className="text-[11px] leading-snug text-black/45">
              Trajectoire indicative fondée sur les tables de production Pothier-Savard (1998) et l'IQS
              régional (Laflèche et al., 2013), données publiques du MRNF. Ce n'est pas une prescription
              sylvicole ni une estimation de valeur marchande.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function volAuj(proj: NonNullable<ReturnType<typeof projeterScenarios>>): number {
  return proj.sansIntervention.points[0]?.volume ?? 0;
}

function Carte({ titre, couleur, lignes }: { titre: string; couleur: string; lignes: string[] }) {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-2.5 shadow-sm">
      <div className="mb-1 flex items-center gap-1.5 font-semibold text-cfrq-deep">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: couleur }} />
        {titre}
      </div>
      {lignes.map((l, i) => <p key={i} className="text-black/65">{l}</p>)}
    </div>
  );
}

// Graphique SVG des deux trajectoires (volume sur pied vs années).
function Graphique({ proj }: { proj: NonNullable<ReturnType<typeof projeterScenarios>> }) {
  const W = 380, H = 200, padL = 34, padR = 12, padT = 12, padB = 26;
  const sans = proj.sansIntervention.points;
  const avec = proj.avecIntervention.points;
  const tMax = proj.horizonAns;
  const vMax = Math.max(...sans.map((p) => p.volume), ...avec.map((p) => p.volume), 1);
  const sx = (t: number) => padL + (t / tMax) * (W - padL - padR);
  const sy = (v: number) => padT + (1 - v / vMax) * (H - padT - padB);
  const path = (pts: { annee: number; volume: number }[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${sx(p.annee).toFixed(1)},${sy(p.volume).toFixed(1)}`).join(" ");
  const anneeRecolte = proj.avecIntervention.anneeRecolte;

  // Graduations d'axes.
  const ticksY = [0, 0.5, 1].map((f) => Math.round(vMax * f));
  const ticksX = [0, Math.round(tMax / 2), tMax];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
      aria-label="Graphique des trajectoires de volume avec et sans intervention">
      <rect x="0" y="0" width={W} height={H} fill="#f8f9fa" rx="8" />
      {ticksY.map((v) => (
        <g key={v}>
          <line x1={padL} y1={sy(v)} x2={W - padR} y2={sy(v)} stroke="#e5e7eb" strokeWidth="1" />
          <text x={padL - 5} y={sy(v) + 3} fontSize="9" fill="#9ca3af" textAnchor="end">{v}</text>
        </g>
      ))}
      {ticksX.map((t) => (
        <text key={t} x={sx(t)} y={H - 10} fontSize="9" fill="#9ca3af" textAnchor="middle">
          {t === 0 ? "Auj." : `+${t} ans`}
        </text>
      ))}
      <text x={4} y={padT + 2} fontSize="8.5" fill="#9ca3af" transform={`rotate(-90 8,${H / 2})`} textAnchor="middle">m³/ha</text>
      {anneeRecolte != null && anneeRecolte > 0 && anneeRecolte <= tMax && (
        <g>
          <line x1={sx(anneeRecolte)} y1={padT} x2={sx(anneeRecolte)} y2={H - padB}
            stroke={COUL_AVEC} strokeWidth="1" strokeDasharray="3 2" opacity="0.7" />
          <text x={sx(anneeRecolte)} y={padT + 8} fontSize="8.5" fill={COUL_AVEC} textAnchor="middle">récolte</text>
        </g>
      )}
      <path d={path(sans)} fill="none" stroke={COUL_SANS} strokeWidth="2.4" />
      <path d={path(avec)} fill="none" stroke={COUL_AVEC} strokeWidth="2.4" />
      {/* Légende intégrée */}
      <g transform={`translate(${padL + 6}, ${padT + 4})`}>
        <line x1="0" y1="0" x2="16" y2="0" stroke={COUL_SANS} strokeWidth="2.4" />
        <text x="20" y="3" fontSize="9.5" fill="#374151">sans intervention</text>
        <line x1="0" y1="14" x2="16" y2="14" stroke={COUL_AVEC} strokeWidth="2.4" />
        <text x="20" y="17" fontSize="9.5" fill="#374151">avec intervention</text>
      </g>
    </svg>
  );
}
