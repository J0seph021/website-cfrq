import { useMemo, useState } from "react";
import { site } from "../data/site";
import { withBase } from "../lib/url";
import { ANNEE_GRILLE, PART_REMBOURSABLE, TAUX_PAR_ID, palierPAF } from "../data/rtf";

const cad = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

// « Faites vos calculs » : quatre travaux, pas quarante. Ce sont ceux qu'un
// propriétaire reconnaît sans être ingénieur forestier et qui reviennent le
// plus souvent dans nos dossiers. Le catalogue complet de la grille vit sur
// /calculateur-taxes-foncieres, pour qui veut aller au fond.
//
// Le PAF n'est pas dans cette liste : son taux dépend de la superficie, il est
// donc calculé à part, à partir du curseur.
const TRAVAUX_RAPIDES = [
  {
    id: "chemin-construction",
    libelle: "Construction de chemin d'accès",
    quantite: "km",
    pas: 0.1,
  },
  {
    id: "jard-feuillus-man",
    libelle: "Coupe de jardinage (feuillus d'ombre, manuel)",
    quantite: "ha",
    pas: 1,
  },
  {
    id: "ec1-sepm-mec-15-19",
    libelle: "1re éclaircie commerciale résineuse mécanisée, DHP 15,1 à 19 cm",
    quantite: "ha",
    pas: 1,
  },
] as const;

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
  // Vrai quand l'envoi a ECHOUE et qu'on est retombe sur le brouillon courriel :
  // le message affiche ne doit alors PAS promettre qu'on a recu la demande.
  const [secours, setSecours] = useState(false);
  // « Faites vos calculs » : replié par défaut, pour ne pas noyer le visiteur
  // qui veut juste voir un ordre de grandeur.
  const [calculOuvert, setCalculOuvert] = useState(false);
  const [pafCoche, setPafCoche] = useState(true);
  const [quantites, setQuantites] = useState<Record<string, number>>({});

  const annuel = useMemo(() => Math.round(taxes * PART_REMBOURSABLE), [taxes]);
  const surCinq = annuel * 5;

  const paf = useMemo(() => palierPAF(superficie), [superficie]);

  // Dépenses admissibles portées par les travaux cochés. C'est ce total, et non
  // les taxes, qui commande le remboursement quand il est le plus petit des deux.
  const depenses = useMemo(() => {
    const desTravaux = TRAVAUX_RAPIDES.reduce(
      (somme, t) => somme + (quantites[t.id] || 0) * TAUX_PAR_ID[t.id].total,
      0
    );
    return desTravaux + (pafCoche ? paf.total : 0);
  }, [quantites, pafCoche, paf]);

  // La règle du programme : 85 % du plus petit des deux montants. Faire des
  // travaux au-delà des taxes ne rembourse pas davantage cette annee-la, mais
  // l'excedent se reporte jusqu'a dix ans.
  const utilise = Math.min(depenses, taxes);
  const rembourse = Math.round(utilise * PART_REMBOURSABLE);
  const excedent = Math.max(0, depenses - taxes);
  const manque = Math.max(0, taxes - depenses);

  // Ce que le visiteur a coche vaut de l'or pour la visite de terrain : on le
  // transmet avec le lead plutot que de le laisser mourir dans le navigateur.
  function detailsLead(): Record<string, string> | undefined {
    const d: Record<string, string> = {};
    if (lots) d["Numéro(s) de lot"] = lots;
    if (calculOuvert && depenses > 0) {
      if (pafCoche) d["Plan d'aménagement forestier"] = cad.format(paf.total);
      for (const t of TRAVAUX_RAPIDES) {
        const q = quantites[t.id] || 0;
        if (q > 0) d[t.libelle] = `${q} ${t.quantite} — ${cad.format(q * TAUX_PAR_ID[t.id].total)}`;
      }
      d["Dépenses admissibles saisies"] = cad.format(depenses);
      d["Remboursement estimé"] = cad.format(rembourse);
    }
    return Object.keys(d).length ? d : undefined;
  }

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
          details: detailsLead(),
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
      setSecours(true);
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

          <div className="mt-6 border-t border-black/10 pt-5">
            <button
              type="button"
              onClick={() => setCalculOuvert((v) => !v)}
              aria-expanded={calculOuvert}
              className="flex w-full items-center justify-between text-left text-[15px] font-medium text-cfrq-leaf"
            >
              <span>Faites vos calculs</span>
              <span aria-hidden="true" className="text-[13px]">{calculOuvert ? "−" : "+"}</span>
            </button>
            {!calculOuvert && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-cfrq-ink/60">
                Ajoutez les travaux que vous envisagez et voyez ce qu'ils rapportent vraiment.
              </p>
            )}

            {calculOuvert && (
              <div className="mt-4">
                <p className="mb-4 text-[13px] leading-relaxed text-cfrq-ink/65">
                  Taux officiels {ANNEE_GRILLE} du ministère des Ressources naturelles et des Forêts.
                </p>

                <label className="mb-3 flex items-start gap-3 text-[14px] text-cfrq-deep">
                  <input
                    type="checkbox"
                    checked={pafCoche}
                    onChange={(e) => setPafCoche(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-cfrq-green"
                  />
                  <span className="flex-1">
                    Plan d'aménagement forestier
                    <span className="block text-[12.5px] text-cfrq-ink/60">
                      {cad.format(paf.total)} pour un boisé de {superficie} ha
                    </span>
                  </span>
                  <span className="whitespace-nowrap font-medium text-cfrq-deep">
                    {cad.format(pafCoche ? paf.total : 0)}
                  </span>
                </label>

                {TRAVAUX_RAPIDES.map((t) => {
                  const taux = TAUX_PAR_ID[t.id];
                  const q = quantites[t.id] || 0;
                  return (
                    <div key={t.id} className="mb-3 flex items-start gap-3 text-[14px] text-cfrq-deep">
                      <input
                        type="number"
                        min={0}
                        step={t.pas}
                        value={q || ""}
                        placeholder="0"
                        onChange={(e) =>
                          setQuantites((prev) => ({ ...prev, [t.id]: Number(e.target.value) || 0 }))
                        }
                        className="h-9 w-[70px] shrink-0 rounded-lg border border-black/15 bg-white px-2 text-right text-[15px] outline-none focus:border-cfrq-green"
                        aria-label={`${t.libelle}, en ${t.quantite}`}
                      />
                      <span className="mt-1 flex-1">
                        {t.quantite} — {t.libelle}
                        <span className="block text-[12.5px] text-cfrq-ink/60">
                          {cad.format(taux.total)}{taux.unite.replace("$", "")}
                        </span>
                      </span>
                      <span className="mt-1 whitespace-nowrap font-medium text-cfrq-deep">
                        {cad.format(q * taux.total)}
                      </span>
                    </div>
                  );
                })}

                <div className="mt-4 flex items-baseline justify-between border-t border-black/10 pt-3">
                  <span className="text-[15px] font-medium text-cfrq-deep">Dépenses admissibles</span>
                  <span className="text-[19px] font-medium text-cfrq-deep">{cad.format(depenses)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col justify-between gap-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-cfrq-tint p-4">
              <div className="text-[13px] text-cfrq-leaf">
                {calculOuvert ? "Remboursement estimé" : "Potentiel maximal par année"}
              </div>
              <div className="mt-1 text-3xl font-medium text-cfrq-deep">
                {cad.format(calculOuvert ? rembourse : annuel)}
              </div>
            </div>
            <div className="rounded-xl bg-cfrq-tint p-4">
              <div className="text-[13px] text-cfrq-leaf">
                {calculOuvert ? "Plafond de l'année" : "Potentiel sur 5 ans"}
              </div>
              <div className="mt-1 text-3xl font-medium text-cfrq-deep">
                {cad.format(calculOuvert ? annuel : surCinq)}
              </div>
            </div>
          </div>

          {calculOuvert ? (
            <p className="text-[13px] leading-relaxed text-cfrq-deep/75">
              {depenses === 0 ? (
                <>Ajoutez des travaux à gauche : sans dépense admissible, il n'y a rien à rembourser.</>
              ) : manque > 0 ? (
                <>
                  Vos travaux valent {cad.format(depenses)} de dépenses admissibles, moins que vos{" "}
                  {cad.format(taxes)} de taxes. Il vous manque {cad.format(manque)} de travaux pour
                  aller chercher le plafond de {cad.format(annuel)}.
                </>
              ) : (
                <>
                  Vos travaux couvrent vos taxes au complet. L'excédent de {cad.format(excedent)} se
                  reporte sur les années suivantes, mais le crédit ne vaut que dix ans : ce qui n'a
                  pas servi au bout du compte est annulé.
                </>
              )}
            </p>
          ) : (
            <p className="text-[13px] leading-relaxed text-cfrq-deep/75">
              Un plafond, pas un dû : ce montant suppose des travaux d'aménagement
              admissibles. On établit lesquels, sur quelles superficies et pour combien
              lors d'une visite de votre boisé.
            </p>
          )}

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
                <strong className="font-medium">Merci.</strong> On vous envoie votre estimation
                détaillée et on vous contacte pour valider votre admissibilité.
              </div>
            )
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
            reconnu, un boisé de 4 ha ou plus, un plan d'aménagement et des dépenses admissibles.{" "}
            <a
              href={withBase("/calculateur-taxes-foncieres")}
              className="font-medium text-cfrq-leaf underline"
            >
              Tous les taux et un rapport imprimable →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
