// Calculateur de valeur du bois (B3 du focus group) : le CLIENT remplit ses propres
// hypothèses (% sciage, coût de récolte, transport) et calcule LUI-MÊME sa valeur.
// CFRQ ne pose aucune estimation officielle (garde-fou légal). Branché sur le vrai
// moteur `valeurPeuplements` + les vrais volumes par essence (composition) et prix
// régionaux résolus (prix_resolu.json). Le brut est au chemin/usine ; le net déduit
// les coûts saisis par le client, et peut être négatif (déclencheur des programmes).
import { useMemo, useState } from "react";
import { valeurPeuplements, type Peuplement, type PrixEssence } from "../lib/valeur/valeurBois";
import prixData from "../lib/valeur/prix_resolu.json";

const PROVINCIAL = "00000000-0000-0000-0000-000000000000";
const cad = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
const nf1 = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });

type PrixParSyndicat = Record<string, { syndicat: string; prix: Record<string, PrixEssence> }>;
const PRIX = prixData as unknown as PrixParSyndicat;

export default function CalculateurValeurBois({
  peuplements, syndicatGuid,
}: {
  peuplements: { composition?: Record<string, number>; superficie_ha?: number | string }[];
  syndicatGuid?: string | null;
}) {
  // Hypothèses ajustables par le client (barèmes min-max, idée d'Anthony).
  const [pctSciage, setPctSciage] = useState(70);   // % du résineux vendu en sciage
  const [coutRecolte, setCoutRecolte] = useState(28); // $/m³
  const [transport, setTransport] = useState(15);     // $/m³

  const gr = PRIX[syndicatGuid || ""] || PRIX[PROVINCIAL];
  const prixResolu = gr?.prix ?? {};

  const peups: Peuplement[] = useMemo(
    () => peuplements
      .map((p) => ({ composition: p.composition || {}, superficie_ha: Number(p.superficie_ha) || 0 }))
      .filter((p) => p.superficie_ha > 0 && Object.keys(p.composition).length > 0),
    [peuplements],
  );

  const res = useMemo(
    () => valeurPeuplements(peups, prixResolu, {
      ratio_resineux_sciage: pctSciage / 100,
      transport_m3: transport,
      cout_recolte_m3: coutRecolte,
    }),
    [peups, prixResolu, pctSciage, transport, coutRecolte],
  );

  if (!peups.length) {
    return (
      <section className="rounded-2xl border border-black/5 bg-white p-6 md:p-8">
        <h2 className="font-display text-xl font-medium text-cfrq-deep">Valeur de votre bois</h2>
        <p className="mt-2 text-[15px] text-cfrq-ink/70">
          Le volume par essence de votre forêt n'est pas encore disponible pour ce calcul. Votre ingénieur peut le compléter.
        </p>
      </section>
    );
  }

  const v = res.valeur;
  const vol = res.volumes;
  const top = vol.par_essence.slice(0, 6);
  const Slider = ({ label, val, set, min, max, step, unit }: any) => (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[14px] text-cfrq-deep">
        <span>{label}</span><span className="font-medium">{val}{unit}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={(e) => set(Number(e.target.value))} className="w-full accent-cfrq-green" aria-label={label} />
    </label>
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-cfrq-green/20 bg-gradient-to-br from-cfrq-tint to-white p-6 md:p-8">
      <p className="text-[12px] font-medium uppercase tracking-wide text-cfrq-leaf">Estimez la valeur de votre bois</p>
      <h2 className="mt-1 font-display text-xl font-medium text-cfrq-deep">Vous calculez, avec vos hypothèses</h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-cfrq-ink/75">
        On part de vos vrais volumes par essence et des prix de votre région ({gr?.syndicat}). Ajustez vos hypothèses de mise en marché : le résultat est <strong>votre</strong> estimation, pas une valeur posée par CFRQ.
      </p>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-xl bg-white/70 p-5">
          <Slider label="Part du résineux vendue en sciage" val={pctSciage} set={setPctSciage} min={0} max={100} step={5} unit=" %" />
          <Slider label="Coût de récolte" val={coutRecolte} set={setCoutRecolte} min={0} max={60} step={1} unit=" $/m³" />
          <Slider label="Transport" val={transport} set={setTransport} min={0} max={40} step={1} unit=" $/m³" />
          <p className="text-[12px] leading-snug text-black/45">
            Le reste du résineux et les feuillus sont comptés en pâte. Faites glisser pour voir l'effet sur le net.
          </p>
        </div>

        <div className="flex flex-col justify-between gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/80 p-4">
              <div className="text-[12.5px] text-cfrq-leaf">Valeur brute (au chemin)</div>
              <div className="mt-0.5 font-display text-2xl font-semibold text-cfrq-deep">{cad(v.brut)}</div>
            </div>
            <div className={`rounded-xl p-4 ${v.net >= 0 ? "bg-cfrq-green/12" : "bg-[#f7efe2]"}`}>
              <div className="text-[12.5px] text-cfrq-leaf">Votre valeur nette estimée</div>
              <div className={`mt-0.5 font-display text-2xl font-semibold ${v.net >= 0 ? "text-cfrq-deep" : "text-[#b4711e]"}`}>{cad(v.net)}</div>
            </div>
          </div>
          <p className="text-[13px] leading-relaxed text-cfrq-ink/70">
            {vol.total_m3 > 0 && <>Volume estimé : <strong>{nf1.format(vol.total_m3)} m³</strong> ({nf1.format(vol.sciage_m3)} sciage / {nf1.format(vol.pate_m3)} pâte). </>}
            Net = brut − transport ({cad(v.transport)}) − récolte ({cad(v.recolte)}).
          </p>
          {v.net < 0 && (
            <div className="rounded-xl bg-[#f7efe2] p-3.5 text-[13.5px] leading-relaxed text-[#7a4d12]">
              Avec ces coûts, la récolte seule n'est pas rentable. C'est justement là que les programmes d'aide et le remboursement de taxes font la différence. Votre ingénieur peut vous montrer lesquels.
            </div>
          )}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 text-[13px] font-medium text-cfrq-deep">Vos volumes par essence</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[13px]">
            <thead className="text-cfrq-ink/55">
              <tr className="border-b border-black/10">
                <th className="py-1.5 pr-3 font-medium">Essence</th>
                <th className="py-1.5 pr-3 text-right font-medium tabular-nums">Volume</th>
                <th className="py-1.5 pr-3 text-right font-medium tabular-nums">Sciage</th>
                <th className="py-1.5 text-right font-medium tabular-nums">Pâte</th>
              </tr>
            </thead>
            <tbody>
              {top.map((e) => (
                <tr key={e.code} className="border-b border-black/5">
                  <td className="py-1.5 pr-3 text-cfrq-deep">{e.nom}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{nf1.format(e.m3)} m³</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-cfrq-ink/60">{nf1.format(e.sciage_m3)}</td>
                  <td className="py-1.5 text-right tabular-nums text-cfrq-ink/60">{nf1.format(e.pate_m3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-[12px] leading-snug text-black/50">
        Estimation indicative que vous calculez avec vos propres hypothèses. Ce n'est ni une estimation officielle de CFRQ, ni une valeur de terre. Prix de mise en marché de votre région (avant taxes et impôts), volumes tirés de l'inventaire écoforestier.
      </p>
    </section>
  );
}
