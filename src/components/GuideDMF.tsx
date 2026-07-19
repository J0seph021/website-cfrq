import { useMemo, useState } from "react";
import {
  ESSENCES,
  REGROUPEMENTS,
  REVENUS_META,
  RISQUE_META,
  dmfPour,
  dmfVarieSelonRegion,
  type Essence,
  type Groupe,
  type RegroupementId,
  type Revenus,
} from "../data/dmf";

type TriCle = "nom" | "dmf" | "revenus";

const ORDRE_REVENUS: Record<Revenus, number> = { eleves: 0, moderes: 1, faibles: 2 };

const RISQUE_COULEUR: Record<string, string> = {
  faible: "#2e7016",
  modere: "#b8860b",
  eleve: "#b4531f",
  incertain: "#6b7280",
};

function Pastille({ couleur, children }: { couleur: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium"
      style={{ color: couleur, backgroundColor: `color-mix(in srgb, ${couleur} 12%, white)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: couleur }} aria-hidden />
      {children}
    </span>
  );
}

export default function GuideDMF() {
  const [regroupement, setRegroupement] = useState<RegroupementId>("erablieres-bouclier");
  const [groupe, setGroupe] = useState<Groupe | "tous">("tous");
  const [tri, setTri] = useState<TriCle>("revenus");
  const [ouvert, setOuvert] = useState<string | null>(null);

  const lignes = useMemo(() => {
    const filtrees = ESSENCES.filter((e) => groupe === "tous" || e.groupe === groupe);
    const avecDmf = filtrees.map((e) => ({ essence: e, valeur: dmfPour(e, regroupement) }));
    avecDmf.sort((a, b) => {
      if (tri === "nom") return a.essence.nom.localeCompare(b.essence.nom, "fr");
      if (tri === "dmf") return a.valeur.cm - b.valeur.cm;
      const r = ORDRE_REVENUS[a.essence.revenus] - ORDRE_REVENUS[b.essence.revenus];
      return r !== 0 ? r : b.valeur.cm - a.valeur.cm;
    });
    return avecDmf;
  }, [regroupement, groupe, tri]);

  const boutonFiltre = (actif: boolean) =>
    `rounded-full px-3.5 py-1.5 text-[13.5px] font-medium transition-colors ${
      actif ? "bg-cfrq-green text-[#123005]" : "bg-white text-cfrq-deep/70 hover:text-cfrq-deep border border-black/10"
    }`;

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-7">
      {/* Contrôles */}
      <div className="flex flex-col gap-4 border-b border-black/5 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-cfrq-deep">Regroupement de régions écologiques</label>
          <select
            value={regroupement}
            onChange={(e) => setRegroupement(e.target.value as RegroupementId)}
            className="h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-[15px] text-cfrq-deep outline-none focus:border-cfrq-green sm:w-[320px]"
            aria-label="Regroupement de régions écologiques"
          >
            {REGROUPEMENTS.map((r) => (
              <option key={r.id} value={r.id}>{r.court}</option>
            ))}
          </select>
          <p className="mt-1.5 text-[12px] text-black/50">
            N'influence que le bouleau jaune et l'érable à sucre ; les autres essences valent pour les trois regroupements.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={boutonFiltre(groupe === "tous")} onClick={() => setGroupe("tous")}>Toutes</button>
          <button type="button" className={boutonFiltre(groupe === "feuillu")} onClick={() => setGroupe("feuillu")}>Feuillus</button>
          <button type="button" className={boutonFiltre(groupe === "resineux")} onClick={() => setGroupe("resineux")}>Résineux</button>
        </div>
      </div>

      {/* En-têtes de tri (desktop) */}
      <div className="mt-2 hidden grid-cols-[1.7fr_0.9fr_1.1fr_1fr] items-center gap-3 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-black/45 sm:grid">
        <button type="button" className="text-left hover:text-cfrq-leaf" onClick={() => setTri("nom")}>
          Essence {tri === "nom" ? "↓" : ""}
        </button>
        <button type="button" className="text-left hover:text-cfrq-leaf" onClick={() => setTri("dmf")}>
          DMF₃₀ (cm) {tri === "dmf" ? "↓" : ""}
        </button>
        <span>Revenu brut</span>
        <button type="button" className="text-left hover:text-cfrq-leaf" onClick={() => setTri("revenus")}>
          Potentiel {tri === "revenus" ? "↓" : ""}
        </button>
      </div>

      {/* Lignes */}
      <ul className="mt-1 divide-y divide-black/5">
        {lignes.map(({ essence, valeur }) => {
          const rev = REVENUS_META[essence.revenus];
          const estOuvert = ouvert === essence.nom;
          const aDetail = Boolean(essence.note) || dmfVarieSelonRegion(essence);
          return (
            <li key={essence.nom}>
              <button
                type="button"
                onClick={() => aDetail && setOuvert(estOuvert ? null : essence.nom)}
                className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 py-3.5 text-left sm:grid-cols-[1.7fr_0.9fr_1.1fr_1fr] ${aDetail ? "cursor-pointer" : "cursor-default"}`}
                aria-expanded={aDetail ? estOuvert : undefined}
              >
                <span className="flex items-center gap-2">
                  <span className="text-[15.5px] font-medium text-cfrq-deep">{essence.nom}</span>
                  {aDetail && (
                    <span aria-hidden className={`text-black/30 transition-transform ${estOuvert ? "rotate-180" : ""}`}>⌄</span>
                  )}
                </span>
                <span className="hidden text-[16px] font-semibold text-cfrq-leaf sm:block">
                  {valeur.min ? "≥ " : ""}{valeur.cm}
                </span>
                <span className="hidden text-[14.5px] text-cfrq-ink/75 sm:block">{valeur.revenuBrut}</span>
                <span className="flex flex-wrap items-center justify-end gap-1.5 sm:justify-start">
                  <span className="text-[15px] font-semibold text-cfrq-leaf sm:hidden">
                    {valeur.min ? "≥ " : ""}{valeur.cm} cm
                  </span>
                  <Pastille couleur={rev.couleur}>{rev.label.replace("Revenus ", "")}</Pastille>
                </span>
              </button>

              {estOuvert && aDetail && (
                <div className="pb-4 pl-1 pr-1 text-[14px] leading-relaxed text-cfrq-deep/80 sm:pl-1">
                  {dmfVarieSelonRegion(essence) && (
                    <div className="mb-2.5 flex flex-wrap gap-2">
                      {REGROUPEMENTS.map((r) => {
                        const v = dmfPour(essence, r.id);
                        const actif = r.id === regroupement;
                        return (
                          <span
                            key={r.id}
                            className={`rounded-lg border px-2.5 py-1 text-[12.5px] ${
                              actif ? "border-cfrq-green bg-cfrq-tint text-cfrq-deep" : "border-black/10 bg-white text-cfrq-deep/70"
                            }`}
                          >
                            {r.court} : <strong className="font-semibold">{v.min ? "≥ " : ""}{v.cm} cm</strong> · {v.revenuBrut}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <p className="flex items-center gap-2">
                    <Pastille couleur={RISQUE_COULEUR[essence.risque]}>{RISQUE_META[essence.risque].label}</Pastille>
                  </p>
                  {essence.note && <p className="mt-2">{essence.note}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Légende revenus */}
      <div className="mt-5 grid gap-2.5 border-t border-black/5 pt-5 sm:grid-cols-3">
        {(Object.keys(REVENUS_META) as Revenus[]).map((k) => (
          <div key={k} className="flex items-start gap-2 text-[12.5px] leading-snug text-cfrq-deep/70">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: REVENUS_META[k].couleur }} aria-hidden />
            <span><strong className="font-medium text-cfrq-deep">{REVENUS_META[k].label}.</strong> {REVENUS_META[k].description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
