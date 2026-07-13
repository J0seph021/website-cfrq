import { useMemo, useState } from "react";
import { site } from "../data/site";
import { MUNICIPALITES_TERRITOIRE } from "../data/municipalites";

const cad = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const nf = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });

// Endpoint de capture des leads (même Edge Function que le calculateur de taxes).
const LEADS_ENDPOINT =
  import.meta.env.PUBLIC_LEADS_ENDPOINT ||
  "https://bpxzznykbikbqbvraqxj.supabase.co/functions/v1/capter-lead";

// Hypothèses de départ, toutes ajustables par l'utilisateur. Prix usine indicatifs
// (ordre de grandeur marché QC 2025-2026) ; coûts d'opération = estimés à valider
// selon le type de peuplement, le terrain et le volume à l'hectare.
const DEFAUTS = {
  prixResSciage: 95, // $/m³ résineux sciage (SEPM), livré usine
  prixResPate: 45,   // $/m³ résineux pâte/trituration
  prixFeuPate: 55,   // $/m³ feuillu pâte/trituration
  coutRecolte: 28,   // $/m³ abattage-façonnage + débardage (récolte mécanisée)
  transport: 15,     // $/m³ transport bord de route -> usine
};

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
  const [volRes, setVolRes] = useState(2000);
  const [volFeu, setVolFeu] = useState(1000);
  const [pctSciage, setPctSciage] = useState(70);
  const [coutRecolte, setCoutRecolte] = useState(DEFAUTS.coutRecolte);
  const [transport, setTransport] = useState(DEFAUTS.transport);
  const [prixResSciage, setPrixResSciage] = useState(DEFAUTS.prixResSciage);
  const [prixResPate, setPrixResPate] = useState(DEFAUTS.prixResPate);
  const [prixFeuPate, setPrixFeuPate] = useState(DEFAUTS.prixFeuPate);
  const [hypOuvert, setHypOuvert] = useState(false);

  const [email, setEmail] = useState("");
  const [municipalite, setMunicipalite] = useState("");
  const [lots, setLots] = useState("");
  const [website, setWebsite] = useState(""); // honeypot anti-spam (reste vide)
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  const calc = useMemo(() => {
    const prixResBlend = (pctSciage / 100) * prixResSciage + (1 - pctSciage / 100) * prixResPate;
    const marchande = volRes * prixResBlend + volFeu * prixFeuPate;
    const volTotal = volRes + volFeu;
    const coutTransport = volTotal * transport;
    const coutRec = volTotal * coutRecolte;
    const net = Math.max(0, marchande - coutTransport - coutRec);
    const pctNet = marchande > 0 ? Math.round((net / marchande) * 100) : 0;
    return { prixResBlend, marchande, volTotal, coutTransport, coutRec, net, pctNet };
  }, [volRes, volFeu, pctSciage, coutRecolte, transport, prixResSciage, prixResPate, prixFeuPate]);

  function fallbackMailto() {
    const corps = [
      `Courriel : ${email}`,
      ...(municipalite ? [`Municipalité : ${municipalite}`] : []),
      ...(lots ? [`Numéro(s) de lot : ${lots}`] : []),
      `Volume résineux : ${nf.format(volRes)} m³ (${pctSciage} % sciage)`,
      `Volume feuillu : ${nf.format(volFeu)} m³`,
      `Valeur marchande (usine) : ${cad.format(calc.marchande)}`,
      `Moins transport (${transport} $/m³) et récolte (${coutRecolte} $/m³)`,
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
            "Volume résineux (m³)": volRes,
            "Volume feuillu (m³)": volFeu,
            "Part sciage résineux (%)": pctSciage,
            "Coût récolte ($/m³)": coutRecolte,
            "Transport ($/m³)": transport,
            "Valeur marchande estimée": cad.format(calc.marchande),
            "Valeur nette estimée": cad.format(calc.net),
          },
          source: "calculateur-valeur-bois",
          website, // honeypot
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEnvoye(true);
    } catch {
      fallbackMailto();
      setEnvoye(true);
    } finally {
      setEnvoi(false);
    }
  }

  const ligne = (label: string, montant: number, signe = "") => (
    <div className="flex items-center justify-between py-1.5 text-[15px]">
      <span className="text-cfrq-ink/70">{label}</span>
      <span className="font-medium text-cfrq-deep">{signe}{cad.format(montant)}</span>
    </div>
  );

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm sm:p-8">
      <div className="grid gap-8 md:grid-cols-2">
        {/* Entrées */}
        <div>
          <div className="mb-6">
            <label className="mb-2 flex items-center justify-between text-[15px] text-cfrq-deep">
              <span>Volume de résineux sur pied</span>
              <span className="font-medium">{nf.format(volRes)} m³</span>
            </label>
            <input type="range" min={0} max={20000} step={100} value={volRes}
              onChange={(e) => setVolRes(Number(e.target.value))}
              className="w-full accent-cfrq-green" aria-label="Volume de résineux en mètres cubes" />
          </div>

          <div className="mb-6">
            <label className="mb-2 flex items-center justify-between text-[15px] text-cfrq-deep">
              <span>Volume de feuillu sur pied</span>
              <span className="font-medium">{nf.format(volFeu)} m³</span>
            </label>
            <input type="range" min={0} max={20000} step={100} value={volFeu}
              onChange={(e) => setVolFeu(Number(e.target.value))}
              className="w-full accent-cfrq-green" aria-label="Volume de feuillu en mètres cubes" />
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
              Ajuster les prix et le transport
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
                <ChampNum label="Prix résineux sciage" valeur={prixResSciage} set={setPrixResSciage} min={0} max={250} />
                <ChampNum label="Prix résineux pâte" valeur={prixResPate} set={setPrixResPate} min={0} max={250} />
                <ChampNum label="Prix feuillu pâte" valeur={prixFeuPate} set={setPrixFeuPate} min={0} max={250} />
                <ChampNum label="Transport vers l'usine" valeur={transport} set={setTransport} min={0} max={60} />
                <p className="text-[12px] leading-relaxed text-black/50">
                  Prix usine indicatifs (marché QC). Vos prix réels dépendent de votre syndicat et de la qualité des tiges.
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
                soit environ {calc.pctNet} % de la valeur marchande
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-black/5 bg-white p-4">
              {ligne("Valeur marchande (prix usine)", calc.marchande)}
              {ligne("Transport vers l'usine", -calc.coutTransport, "− ")}
              {ligne("Récolte (abattage, débardage)", -calc.coutRec, "− ")}
              <div className="mt-1 flex items-center justify-between border-t border-black/10 pt-2 text-[15px]">
                <span className="font-medium text-cfrq-deep">Valeur nette</span>
                <span className="font-semibold text-cfrq-leaf">{cad.format(calc.net)}</span>
              </div>
            </div>
          </div>

          <p className="text-[13px] leading-relaxed text-cfrq-deep/75">
            Le prix affiché à l'usine n'est pas ce qui reste dans vos poches : le transport et la récolte s'en déduisent.
            Cette valeur nette suppose que votre bois est mûr et récoltable ; un ingénieur forestier le confirme sur le terrain.
          </p>

          {envoye ? (
            <div className="rounded-xl border border-cfrq-green/40 bg-cfrq-tint p-4 text-[15px] text-cfrq-deep">
              <strong className="font-medium">Merci.</strong> On vous recontacte pour caractériser votre forêt et affiner cette estimation avec vos vrais chiffres.
            </div>
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
              <div className="flex flex-col gap-3 sm:flex-row">
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@courriel.ca"
                  className="h-12 flex-1 rounded-lg border border-black/15 bg-white px-4 text-[16px] outline-none focus:border-cfrq-green"
                  aria-label="Votre adresse courriel" />
                <button type="submit" disabled={envoi}
                  className="h-12 rounded-lg bg-cfrq-green px-5 text-[15px] font-medium text-[#123005] transition-colors hover:bg-cfrq-green-hover disabled:cursor-not-allowed disabled:opacity-60">
                  {envoi ? "Envoi..." : "Faire caractériser ma forêt"}
                </button>
              </div>
            </form>
          )}

          <p className="text-[12.5px] leading-relaxed text-black/55">
            Estimation indicative selon vos propres hypothèses. Ce n'est ni une offre d'achat ni une évaluation officielle.
            Les volumes, prix et coûts réels varient selon votre peuplement, votre région et le marché.
          </p>
        </div>
      </div>
    </div>
  );
}
