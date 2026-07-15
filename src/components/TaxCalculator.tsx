import { useMemo, useState } from "react";
import { site } from "../data/site";

const cad = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

// Endpoint de capture des leads (Edge Function du projet PlaniLogix). La fonction
// ecrit dans planilogix.leads_web par connexion Postgres directe cote serveur;
// aucune cle de la BD forestiere n'est exposee ici.
const LEADS_ENDPOINT =
  import.meta.env.PUBLIC_LEADS_ENDPOINT ||
  "https://bpxzznykbikbqbvraqxj.supabase.co/functions/v1/capter-lead";

export default function TaxCalculator() {
  const [superficie, setSuperficie] = useState(40);
  const [taxes, setTaxes] = useState(1400);
  const [nom, setNom] = useState("");
  const [municipalite, setMunicipalite] = useState("");
  const [lots, setLots] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot anti-spam (reste vide)
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  const annuel = useMemo(() => Math.round(taxes * 0.85), [taxes]);
  const surCinq = annuel * 5;

  // Filet de secours: si la capture echoue (reseau), on ne perd pas le lead,
  // on bascule sur un courriel pre-rempli vers CFRQ.
  function fallbackMailto() {
    const corps = [
      ...(nom ? [`Nom : ${nom}`] : []),
      `Courriel : ${email}`,
      ...(municipalite ? [`Municipalité du boisé : ${municipalite}`] : []),
      ...(lots ? [`Numéro(s) de lot : ${lots}`] : []),
      `Superficie du boise : ${superficie} ha`,
      `Taxes foncieres annuelles : ${cad.format(taxes)}`,
      `Potentiel maximal indicatif : ${cad.format(annuel)} par annee, soit ${cad.format(surCinq)} sur 5 ans (sous reserve de travaux d'amenagement admissibles)`,
      "",
      "Je souhaite recevoir mon estimation detaillee et les prochaines etapes pour valider mon admissibilite.",
    ].join("\n");
    window.location.href = `mailto:${site.courriel}?subject=${encodeURIComponent(
      "Estimation de rabais de taxes"
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
          nom: nom || undefined,
          municipalite: municipalite || undefined,
          details: lots ? { "Numéro(s) de lot": lots } : undefined,
          superficie_ha: superficie,
          taxes_annuelles: taxes,
          potentiel_annuel: annuel,
          potentiel_5ans: surCinq,
          source: "calculateur-taxes",
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

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm sm:p-8">
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <div className="mb-6">
            <label className="mb-2 flex items-center justify-between text-[15px] text-cfrq-deep">
              <span>Superficie de votre boisé</span>
              <span className="font-medium">{superficie} ha</span>
            </label>
            <input
              type="range"
              min={4}
              max={300}
              step={1}
              value={superficie}
              onChange={(e) => setSuperficie(Number(e.target.value))}
              className="w-full accent-cfrq-green"
              aria-label="Superficie en hectares"
            />
          </div>

          <div className="mb-2">
            <label className="mb-2 flex items-center justify-between text-[15px] text-cfrq-deep">
              <span>Taxes foncières par année</span>
              <span className="font-medium">{cad.format(taxes)}</span>
            </label>
            <input
              type="range"
              min={200}
              max={8000}
              step={50}
              value={taxes}
              onChange={(e) => setTaxes(Number(e.target.value))}
              className="w-full accent-cfrq-green"
              aria-label="Taxes foncières annuelles"
            />
          </div>
        </div>

        <div className="flex flex-col justify-between gap-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-cfrq-tint p-4">
              <div className="text-[13px] text-cfrq-leaf">Potentiel maximal par année</div>
              <div className="mt-1 text-3xl font-medium text-cfrq-deep">{cad.format(annuel)}</div>
            </div>
            <div className="rounded-xl bg-cfrq-tint p-4">
              <div className="text-[13px] text-cfrq-leaf">Potentiel sur 5 ans</div>
              <div className="mt-1 text-3xl font-medium text-cfrq-deep">{cad.format(surCinq)}</div>
            </div>
          </div>

          <p className="text-[13px] leading-relaxed text-cfrq-deep/75">
            Un plafond, pas un dû : ce montant suppose des travaux d'aménagement
            admissibles. On établit lesquels, sur quelles superficies et pour combien
            lors d'une visite de votre boisé.
          </p>

          {envoye ? (
            <div className="rounded-xl border border-cfrq-green/40 bg-cfrq-tint p-4 text-[15px] text-cfrq-deep">
              <strong className="font-medium">Merci.</strong> On vous envoie votre estimation
              détaillée et on vous contacte pour valider votre admissibilité.
            </div>
          ) : (
            <form onSubmit={soumettre} className="relative flex flex-col gap-3">
              {/* Honeypot: un robot le remplit, un humain ne le voit pas. */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="absolute h-0 w-0 opacity-0"
                style={{ position: "absolute", left: "-9999px" }}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  required
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Votre nom"
                  autoComplete="name"
                  className="h-12 rounded-lg border border-black/15 bg-white px-4 text-[16px] outline-none focus:border-cfrq-green"
                  aria-label="Votre nom"
                />
                <input
                  type="text"
                  required
                  value={municipalite}
                  onChange={(e) => setMunicipalite(e.target.value)}
                  placeholder="Municipalité du boisé"
                  className="h-12 rounded-lg border border-black/15 bg-white px-4 text-[16px] outline-none focus:border-cfrq-green"
                  aria-label="Municipalité du boisé"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={lots}
                  onChange={(e) => setLots(e.target.value)}
                  placeholder="Numéro(s) de lot (optionnel)"
                  className="h-12 rounded-lg border border-black/15 bg-white px-4 text-[16px] outline-none focus:border-cfrq-green"
                  aria-label="Numéros de lot (optionnel)"
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@courriel.ca"
                  autoComplete="email"
                  className="h-12 rounded-lg border border-black/15 bg-white px-4 text-[16px] outline-none focus:border-cfrq-green"
                  aria-label="Votre adresse courriel"
                />
              </div>
              <button
                type="submit"
                disabled={envoi}
                className="h-12 rounded-lg bg-cfrq-green px-5 text-[15px] font-medium text-[#123005] transition-colors hover:bg-cfrq-green-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {envoi ? "Envoi..." : "Recevoir mon estimation détaillée"}
              </button>
            </form>
          )}

          <p className="text-[12.5px] leading-relaxed text-black/55">
            Estimation indicative. L'admissibilité réelle suppose un statut de producteur forestier
            reconnu, un boisé de 4 ha ou plus, un plan d'aménagement et des dépenses admissibles.
          </p>
        </div>
      </div>
    </div>
  );
}
