import { useMemo, useState } from "react";
import { valeurPeuplements, CLASSE_ESSENCE, NOM_ESSENCE, type PrixEssence } from "../lib/valeur/valeurBois";
import prixData from "../lib/valeur/prix_resolu.json";
import prixMeta from "../lib/valeur/prix_meta.json";
import { site } from "../data/site";
import { MUNICIPALITES_TERRITOIRE } from "../data/municipalites";
import { mesurerDemande } from "../lib/mesure";
import { useTurnstile } from "../lib/useTurnstile";

const cad = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const nf = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });

// Endpoint de capture des leads (même Edge Function que le calculateur de taxes).
const LEADS_ENDPOINT =
  import.meta.env.PUBLIC_LEADS_ENDPOINT ||
  "https://bpxzznykbikbqbvraqxj.supabase.co/functions/v1/capter-lead";

// Prix de mise en marché PAR SYNDICAT et par essence : la grille prixbois.ca publiée,
// la même que celle des relevés et de l'espace client (fichiers GÉNÉRÉS prix_resolu.json
// et prix_meta.json, exportés depuis le dépôt des relevés). Le calcul passe par le même
// moteur (valeurPeuplements) : le résineux se vend en sciage selon la part choisie, le
// reste et les feuillus en pâte ; le transport ne se déduit que du bois vendu livré à
// l'usine, un prix « bord de route » en étant déjà net. Les anciens prix fixes (95, 45,
// 55 $/m³) n'avaient pas de source (revue du 30 septembre 2026).
const PROVINCIAL = "00000000-0000-0000-0000-000000000000";
type PrixGrille = PrixEssence & { sciage_bord_route?: boolean; pate_bord_route?: boolean };
const PRIX = prixData as unknown as Record<string, { syndicat: string; prix: Record<string, PrixGrille> }>;
// prixbois.ca écrit certains noms sans accents : on les affiche en français correct.
const NOM_SYNDICAT: Record<string, string> = {
  "Region de Quebec": "Région de Québec",
  "Centre-du-Quebec": "Centre-du-Québec",
  "Cote-du-Sud": "Côte-du-Sud",
  "Abitibi-Temiscamingue": "Abitibi-Témiscamingue",
  "Saguenay-Lac-St-Jean": "Saguenay-Lac-Saint-Jean",
  "Sud du Quebec": "Sud du Québec",
};
const nomSyndicat = (g: string) =>
  g === PROVINCIAL ? "Moyenne du Québec" : NOM_SYNDICAT[PRIX[g]?.syndicat ?? ""] ?? PRIX[g]?.syndicat ?? g;
const SYNDICATS = Object.keys(PRIX).sort((a, b) =>
  a === PROVINCIAL ? -1 : b === PROVINCIAL ? 1 : nomSyndicat(a).localeCompare(nomSyndicat(b), "fr"));
const ESSENCES = Object.keys(NOM_ESSENCE).sort((a, b) =>
  (CLASSE_ESSENCE[a] === CLASSE_ESSENCE[b] ? 0 : CLASSE_ESSENCE[a] === "resineux" ? -1 : 1)
  || NOM_ESSENCE[a].localeCompare(NOM_ESSENCE[b], "fr"));
const LIGNES_DEPART = [
  { code: "SAB", m3: 1200 }, { code: "EPN", m3: 800 }, { code: "ERS", m3: 600 }, { code: "ERR", m3: 400 },
];
const DEFAUTS = {
  coutRecolte: 28,   // $/m³ abattage-façonnage + débardage (récolte mécanisée), hypothèse du visiteur
  transport: 15,     // $/m³ transport bord de route -> usine, hypothèse du visiteur
};
const DATE_PRIX = prixMeta?.publie_le
  ? new Date(`${prixMeta.publie_le}T12:00:00`).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })
  : null;
const prixTxt = (p: number | null | undefined) => (p === null || p === undefined ? "n. d." : `${nf.format(p)} $/m³`);

// Petit champ numérique éditable pour la section « hypothèses ».
function ChampNum({ label, valeur, set, min, max, step = 1, unite = "$/m³" }:
  { label: string; valeur: number; set: (n: number) => void; min: number; max: number; step?: number; unite?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 text-[14px] text-cfrq-deep">
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number" min={min} max={max} step={step} value={valeur}
          onChange={(e) => set(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
          className="h-9 w-20 rounded-lg border border-black/15 bg-white px-2 text-right text-[15px] outline-none focus:border-cfrq-green"
        />
        <span className="w-10 text-[12.5px] text-black/50">{unite}</span>
      </span>
    </label>
  );
}

export default function WoodValueCalculator() {
  const [syndicat, setSyndicat] = useState(PROVINCIAL);
  const [lignes, setLignes] = useState(LIGNES_DEPART);
  const [pctSciage, setPctSciage] = useState(70);
  const [coutRecolte, setCoutRecolte] = useState(DEFAUTS.coutRecolte);
  const [transport, setTransport] = useState(DEFAUTS.transport);
  const [hypOuvert, setHypOuvert] = useState(false);

  const [email, setEmail] = useState("");
  const [municipalite, setMunicipalite] = useState("");
  const [lots, setLots] = useState("");
  const [website, setWebsite] = useState(""); // honeypot anti-spam (reste vide)
  const turnstile = useTurnstile("calculateur-valeur-bois");
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  // Vrai quand l'envoi a ECHOUE et qu'on est retombe sur le brouillon courriel :
  // le message affiche ne doit alors PAS promettre qu'on a recu la demande.
  const [secours, setSecours] = useState(false);

  const prixSyndicat = (PRIX[syndicat] ?? PRIX[PROVINCIAL]).prix;
  const calc = useMemo(() => {
    const composition: Record<string, number> = {};
    for (const l of lignes) if (l.m3 > 0) composition[l.code] = (composition[l.code] || 0) + l.m3;
    // Superficie 1 : les volumes saisis sont déjà des totaux (m³), pas des m³/ha.
    const res = valeurPeuplements([{ composition, superficie_ha: 1 }], prixSyndicat, {
      ratio_resineux_sciage: pctSciage / 100, transport_m3: transport, cout_recolte_m3: coutRecolte,
    });
    const v = res.valeur;
    const pctNet = v.brut > 0 && v.net > 0 ? Math.round((v.net / v.brut) * 100) : 0;
    return { marchande: v.brut, coutTransport: v.transport, coutRec: v.recolte, net: v.net, pctNet,
             volTotal: res.volumes.total_m3, manquants: v.prix_manquants };
  }, [lignes, prixSyndicat, pctSciage, coutRecolte, transport]);
  const volumesTxt = lignes.filter((l) => l.m3 > 0)
    .map((l) => `${NOM_ESSENCE[l.code] ?? l.code} ${nf.format(l.m3)} m³`).join(", ");
  const changerLigne = (i: number, champ: "code" | "m3", val: string) =>
    setLignes((ls) => ls.map((l, j) => (j !== i ? l
      : champ === "code" ? { ...l, code: val } : { ...l, m3: Math.max(0, Math.min(50000, Number(val) || 0)) })));

  function fallbackMailto() {
    const corps = [
      `Courriel : ${email}`,
      ...(municipalite ? [`Municipalité : ${municipalite}`] : []),
      ...(lots ? [`Numéro(s) de lot : ${lots}`] : []),
      `Région (prix) : ${nomSyndicat(syndicat)}`,
      `Volumes : ${volumesTxt} (${pctSciage} % du résineux en sciage)`,
      `Valeur au prix du marché : ${cad.format(calc.marchande)}`,
      `Moins transport (${transport} $/m³, bois livré à l'usine) et récolte (${coutRecolte} $/m³)`,
      `Valeur nette estimée : ${cad.format(calc.net)} (${calc.pctNet} % du brut)`,
      "",
      "Je souhaite une caractérisation réelle de ma forêt et les prochaines étapes.",
    ].join("\n");
    window.location.href = `mailto:${site.courriel}?subject=${encodeURIComponent(
      "Estimation de la valeur du bois"
    )}&body=${encodeURIComponent(corps)}`;
  }

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!email || envoi) return;
    setEnvoi(true);
    try {
      const res = await fetch(LEADS_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          courriel: email,
          municipalite: municipalite || undefined,
          // Les champs de calcul passent dans `details` : c'est ce que la branche
          // générique de capter-lead persiste (jsonb) et affiche dans la notification.
          details: {
            ...(lots ? { "Numéro(s) de lot": lots } : {}),
            "Région (prix)": nomSyndicat(syndicat),
            "Volumes par essence": volumesTxt,
            "Part sciage résineux (%)": pctSciage,
            "Coût récolte ($/m³)": coutRecolte,
            "Transport ($/m³)": transport,
            "Valeur marchande estimée": cad.format(calc.marchande),
            "Valeur nette estimée": cad.format(calc.net),
          },
          source: "calculateur-valeur-bois",
          website, // honeypot
          turnstile: await turnstile.jeton(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEnvoye(true);
      mesurerDemande("calculateur-valeur-bois", "serveur");
    } catch {
      fallbackMailto();
      setSecours(true);
      setEnvoye(true);
      mesurerDemande("calculateur-valeur-bois", "secours");
    } finally {
      turnstile.renouveler();
      setEnvoi(false);
    }
  }

  const ligne = (label: string, montant: number, signe = "") => (
    <div className="flex items-center justify-between py-1.5 text-[15px]">
      <span className="text-cfrq-ink/70">{label}</span>
      <span className="whitespace-nowrap font-medium text-cfrq-deep">{signe}{cad.format(montant)}</span>
    </div>
  );

  return (
    <div data-mesure-outil="valeur-bois" className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm sm:p-8">
      <div className="grid gap-8 md:grid-cols-2">
        {/* Entrées */}
        <div>
          <div className="mb-6">
            <label htmlFor="region-prix" className="mb-2 block text-[15px] text-cfrq-deep">
              Votre région (syndicat de producteurs de bois)
            </label>
            <select id="region-prix" value={syndicat} onChange={(e) => setSyndicat(e.target.value)}
              className="h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-[15px] outline-none focus:border-cfrq-green">
              {SYNDICATS.map((g) => <option key={g} value={g}>{nomSyndicat(g)}</option>)}
            </select>
          </div>

          <div className="mb-6">
            <div className="mb-2 text-[15px] text-cfrq-deep">Vos volumes sur pied, par essence</div>
            <div className="space-y-2">
              {lignes.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={l.code} onChange={(e) => changerLigne(i, "code", e.target.value)}
                    aria-label={`Essence ${i + 1}`}
                    className="h-10 w-0 min-w-0 flex-1 rounded-lg border border-black/15 bg-white px-2 text-[14.5px] outline-none focus:border-cfrq-green">
                    {ESSENCES.map((c) => <option key={c} value={c}>{NOM_ESSENCE[c]}</option>)}
                  </select>
                  <input type="number" min={0} max={50000} step={50} value={l.m3}
                    onChange={(e) => changerLigne(i, "m3", e.target.value)}
                    aria-label={`Volume de ${NOM_ESSENCE[l.code] ?? l.code} en mètres cubes`}
                    className="h-10 w-[72px] rounded-lg border border-black/15 bg-white px-2 text-right text-[15px] outline-none focus:border-cfrq-green sm:w-24" />
                  <span className="w-5 text-[12.5px] text-black/50">m³</span>
                  <button type="button" onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))}
                    aria-label={`Retirer ${NOM_ESSENCE[l.code] ?? l.code}`}
                    className="h-10 w-7 shrink-0 rounded-lg text-[18px] text-black/40 hover:bg-black/5 hover:text-black/70">×</button>
                </div>
              ))}
            </div>
            {lignes.length < 12 && (
              <button type="button" onClick={() => setLignes((ls) => [...ls, { code: "BOJ", m3: 0 }])}
                className="mt-2 text-[14px] font-medium text-cfrq-leaf hover:underline">
                + Ajouter une essence
              </button>
            )}
          </div>

          <div className="mb-2">
            <label className="mb-2 flex items-center justify-between text-[15px] text-cfrq-deep">
              <span>Coût de récolte estimé</span>
              <span className="font-medium">{coutRecolte} $/m³</span>
            </label>
            <input type="range" min={0} max={70} step={1} value={coutRecolte}
              onChange={(e) => setCoutRecolte(Number(e.target.value))}
              className="w-full accent-cfrq-green" aria-label="Coût de récolte par mètre cube" />
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-black/55">
              Abattage, façonnage et débardage. Plus élevé en coupe partielle (jardinage, éclaircie) qu'en coupe totale.
            </p>
          </div>

          {/* Hypothèses détaillées (repliables) */}
          <div className="mt-5 rounded-xl border border-black/10 bg-cfrq-cream/60">
            <button type="button" onClick={() => setHypOuvert((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-3 text-[14px] font-medium text-cfrq-deep">
              Prix utilisés, part de sciage et transport
              <span aria-hidden className={`transition-transform ${hypOuvert ? "rotate-180" : ""}`}>⌄</span>
            </button>
            {hypOuvert && (
              <div className="space-y-3 border-t border-black/10 px-4 py-4">
                <label className="flex items-center justify-between gap-3 text-[14px] text-cfrq-deep">
                  <span>Part du résineux en sciage</span>
                  <span className="font-medium">{pctSciage} %</span>
                </label>
                <input type="range" min={0} max={100} step={5} value={pctSciage}
                  onChange={(e) => setPctSciage(Number(e.target.value))}
                  className="w-full accent-cfrq-green" aria-label="Part du résineux vendue en sciage" />
                <ChampNum label="Transport vers l'usine" valeur={transport} set={setTransport} min={0} max={60} />
                <table className="w-full text-left text-[13px]">
                  <thead className="text-cfrq-ink/55">
                    <tr className="border-b border-black/10">
                      <th className="py-1 pr-2 font-medium">Essence</th>
                      <th className="py-1 pr-2 text-right font-medium">Sciage</th>
                      <th className="py-1 text-right font-medium">Pâte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...new Set(lignes.map((l) => l.code))].map((c) => {
                      const p = prixSyndicat[c] ?? ({} as PrixGrille);
                      const feu = CLASSE_ESSENCE[c] === "feuillu";
                      return (
                        <tr key={c} className="border-b border-black/5">
                          <td className="py-1 pr-2 text-cfrq-deep">{NOM_ESSENCE[c] ?? c}</td>
                          <td className="py-1 pr-2 text-right tabular-nums text-cfrq-ink/70">
                            {feu ? "non compté" : prixTxt(p.sciage)}{!feu && p.sciage_bord_route ? " *" : ""}
                          </td>
                          <td className="py-1 text-right tabular-nums text-cfrq-ink/70">
                            {prixTxt(p.pate)}{p.pate_bord_route ? " *" : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[12px] leading-relaxed text-black/50">
                  Prix de mise en marché de la région choisie, relevés sur prixbois.ca{DATE_PRIX ? ` le ${DATE_PRIX}` : ""},
                  livrés à l'usine ; * prix en bord de route, déjà nets du transport. Les feuillus sont comptés en pâte.
                  Vos prix réels dépendent de votre syndicat, de l'usine et de la qualité des tiges.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Résultats */}
        <div className="flex flex-col justify-between gap-5">
          <div>
            <div className="rounded-xl bg-cfrq-tint p-5">
              <div className="text-[13px] text-cfrq-leaf">Ce qui vous revient (valeur nette du bois)</div>
              <div className="mt-1 font-display text-[clamp(34px,7vw,44px)] font-medium leading-none text-cfrq-deep">
                {cad.format(calc.net)}
              </div>
              <div className="mt-1.5 text-[13px] text-cfrq-ink/60">
                {calc.net > 0
                  ? <>soit environ {calc.pctNet} % de la valeur au prix du marché</>
                  : <>avec ces coûts, la récolte seule n'est pas rentable</>}
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-black/5 bg-white p-4">
              {ligne(`Valeur au prix du marché (${nomSyndicat(syndicat)})`, calc.marchande)}
              {ligne("Transport vers l'usine", calc.coutTransport, "− ")}
              {ligne("Récolte (abattage, débardage)", calc.coutRec, "− ")}
              <div className="mt-1 flex items-center justify-between border-t border-black/10 pt-2 text-[15px]">
                <span className="font-medium text-cfrq-deep">Valeur nette</span>
                <span className="font-semibold text-cfrq-leaf">{cad.format(calc.net)}</span>
              </div>
            </div>
          </div>

          <p className="text-[13px] leading-relaxed text-cfrq-deep/75">
            Le prix du marché n'est pas ce qui reste dans vos poches : la récolte s'en déduit, et le transport pour le bois vendu livré à l'usine.
            Cette valeur nette suppose que votre bois est mûr et récoltable ; un ingénieur forestier le confirme sur le terrain.
          </p>

          {envoye ? (
            secours ? (
              <div className="rounded-xl border border-amber-500/50 bg-amber-50 p-4 text-[15px] text-cfrq-deep">
                <strong className="font-medium">Votre demande n'a pas pu être transmise automatiquement.</strong>{" "}
                Votre logiciel de courriel devrait s'être ouvert avec un brouillon déjà rempli : il ne reste
                qu'à l'envoyer. S'il ne s'est pas ouvert, écrivez-nous à{" "}
                <a href={`mailto:${site.courriel}`} className="font-medium underline">{site.courriel}</a>{" "}
                ou appelez-nous au{" "}
                <a href={site.telHref} className="font-medium underline">{site.tel}</a>.
              </div>
            ) : (
              <div className="rounded-xl border border-cfrq-green/40 bg-cfrq-tint p-4 text-[15px] text-cfrq-deep">
                <strong className="font-medium">Merci.</strong> On vous recontacte pour caractériser votre forêt et affiner cette estimation avec vos vrais chiffres.
              </div>
            )
          ) : (
            <form onSubmit={soumettre} className="relative flex flex-col gap-3">
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
                value={website} onChange={(e) => setWebsite(e.target.value)}
                className="absolute h-0 w-0 opacity-0" style={{ position: "absolute", left: "-9999px" }} />
              <div className="grid gap-3 sm:grid-cols-2">
                <span>
                  <input list="municipalites-territoire" value={municipalite}
                    onChange={(e) => setMunicipalite(e.target.value)}
                    placeholder="Municipalité (optionnel)"
                    className="h-12 w-full rounded-lg border border-black/15 bg-white px-4 text-[16px] outline-none focus:border-cfrq-green"
                    aria-label="Municipalité de votre boisé (optionnel)" />
                  <datalist id="municipalites-territoire">
                    {MUNICIPALITES_TERRITOIRE.map((m) => <option key={m} value={m} />)}
                  </datalist>
                </span>
                <input type="text" value={lots} onChange={(e) => setLots(e.target.value)}
                  placeholder="Numéro(s) de lot (optionnel)"
                  className="h-12 w-full rounded-lg border border-black/15 bg-white px-4 text-[16px] outline-none focus:border-cfrq-green"
                  aria-label="Numéro ou numéros de lot (optionnel)" />
              </div>
              {/* Widget Turnstile regroupé avec la ligne d'envoi : invisible, il ne
                  doit pas ajouter un écart de plus dans le gap du formulaire. */}
              <div className="flex flex-col">
                <div ref={turnstile.ref} className="data-[turnstile=visible]:mb-3" />
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="votre@courriel.ca"
                    className="h-12 min-w-[220px] rounded-lg border border-black/15 bg-white px-4 text-[16px] outline-none focus:border-cfrq-green sm:flex-1"
                    aria-label="Votre adresse courriel" />
                  <button type="submit" disabled={envoi}
                    className="h-12 shrink-0 rounded-lg bg-cfrq-green px-5 text-[15px] font-medium text-[#123005] transition-colors hover:bg-cfrq-green-hover disabled:cursor-not-allowed disabled:opacity-60">
                    {envoi ? "Envoi..." : "Faire caractériser ma forêt"}
                  </button>
                </div>
              </div>
            </form>
          )}

          <p className="text-[12.5px] leading-relaxed text-black/55">
            Estimation indicative selon vos propres hypothèses. Ce n'est ni une offre d'achat ni une évaluation officielle.
            Les volumes, prix et coûts réels varient selon votre peuplement, votre région et le marché.
            {calc.manquants.length > 0 && <> Aucun prix publié pour : {calc.manquants.map((c) => NOM_ESSENCE[c] ?? c).join(", ")} (compté à 0 $).</>}
          </p>
        </div>
      </div>
    </div>
  );
}
