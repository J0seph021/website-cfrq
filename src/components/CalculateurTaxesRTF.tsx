import { useMemo, useState } from "react";
import { site } from "../data/site";
import { withBase, withBaseAsset } from "../lib/url";
import {
  ANNEE_GRILLE,
  ANNEES_REPORT,
  GROUPES,
  LIBELLE_QUANTITE,
  MAJORATION_FORET_FAUNE,
  PART_REMBOURSABLE,
  SOURCE_GRILLE,
  SOURCE_REGLEMENT,
  SUPERFICIE_MINIMALE_HA,
  TAUX_PAR_ID,
  palierPAF,
  projeter,
} from "../data/rtf";

const cad = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const nombre = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });

/** Le pas de saisie dépend de l'unité : on ne compte pas des ponceaux à la décimale. */
function pasDeSaisie(unite: string): number {
  if (unite === "$/km") return 0.1;
  if (unite === "$/pont ou ponceau" || unite === "$/PAF" || unite === "$/visite" || unite === "$/élément") return 1;
  return 0.5;
}

export default function CalculateurTaxesRTF() {
  const [superficie, setSuperficie] = useState(40);
  const [taxesMunicipales, setTaxesMunicipales] = useState(1100);
  const [taxesScolaires, setTaxesScolaires] = useState(300);
  const [indexation, setIndexation] = useState(2);
  const [foretFaune, setForetFaune] = useState(false);
  const [surFacture, setSurFacture] = useState(false);
  const [quantites, setQuantites] = useState<Record<string, number>>({});

  // Identification, pour que le rapport imprimé serve tel quel au dossier client.
  const [proprietaire, setProprietaire] = useState("");
  const [municipalite, setMunicipalite] = useState("");
  const [lots, setLots] = useState("");

  const [ouverts, setOuverts] = useState<Record<string, boolean>>({ autres: true });

  const taxesTotales = taxesMunicipales + taxesScolaires;
  const paf = useMemo(() => palierPAF(superficie), [superficie]);

  function poser(id: string, valeur: number) {
    setQuantites((prev) => ({ ...prev, [id]: valeur }));
  }

  /**
   * Valeur d'une ligne, majorations comprises.
   *
   * Deux modulations prévues par le règlement et par la grille :
   *   - travaux forêt-faune : la dépense est majorée de 10 %;
   *   - postes marqués d'un renvoi dans la grille (chemins, ponceaux, PAF) :
   *     sur présentation de factures admissibles, la dépense peut atteindre le
   *     double du taux affiché. C'est un plafond, pas un automatisme.
   */
  function valeurLigne(id: string, quantite: number): number {
    const taux = TAUX_PAR_ID[id];
    let montant = quantite * taux.total;
    if (surFacture && taux.surFacture) montant *= 2;
    if (foretFaune) montant *= 1 + MAJORATION_FORET_FAUNE;
    return montant;
  }

  const lignes = useMemo(
    () =>
      GROUPES.flatMap((g) =>
        g.taux
          .filter((t) => (quantites[t.id] || 0) > 0)
          .map((t) => ({
            groupe: g.titre,
            groupeId: g.id,
            taux: t,
            quantite: quantites[t.id],
            montant: valeurLigne(t.id, quantites[t.id]),
          }))
      ),
    [quantites, surFacture, foretFaune]
  );

  const depenses = useMemo(() => lignes.reduce((s, l) => s + l.montant, 0), [lignes]);

  const projection = useMemo(() => {
    // Les travaux retenus sont portés à l'année 1 ; les années suivantes vivent
    // sur le report. C'est le scénario qui répond à la vraie question du
    // propriétaire : « pendant combien d'années mes travaux paient-ils mes taxes ? »
    const parAnnee = Array(ANNEES_REPORT).fill(0);
    parAnnee[0] = depenses;
    return projeter(parAnnee, taxesTotales, indexation / 100, ANNEES_REPORT);
  }, [depenses, taxesTotales, indexation]);

  const an1 = projection.annees[0];
  const anneesCouvertes = projection.annees.filter((a) => a.remboursement > 0.5).length;
  const groupesUtilises = GROUPES.filter((g) => lignes.some((l) => l.groupeId === g.id));

  const aujourdhui = new Date().toLocaleDateString("fr-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      {/* ------------------------------ SÉLECTION ------------------------------ */}
      <div className="rtf-ecran-seulement rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
        <h2 className="font-display text-[22px] font-medium text-cfrq-deep">Votre situation</h2>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[14px] text-cfrq-deep">Superficie à vocation forestière</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={1}
                value={superficie || ""}
                onChange={(e) => setSuperficie(Number(e.target.value) || 0)}
                className="h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-[16px] outline-none focus:border-cfrq-green"
              />
              <span className="text-[14px] text-cfrq-ink/60">ha</span>
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[14px] text-cfrq-deep">Indexation annuelle des taxes</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={indexation}
                onChange={(e) => setIndexation(Number(e.target.value) || 0)}
                className="h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-[16px] outline-none focus:border-cfrq-green"
              />
              <span className="text-[14px] text-cfrq-ink/60">%</span>
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[14px] text-cfrq-deep">Taxes municipales par année</span>
            <input
              type="number"
              min={0}
              step={10}
              value={taxesMunicipales || ""}
              onChange={(e) => setTaxesMunicipales(Number(e.target.value) || 0)}
              className="h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-[16px] outline-none focus:border-cfrq-green"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[14px] text-cfrq-deep">Taxes scolaires par année</span>
            <input
              type="number"
              min={0}
              step={10}
              value={taxesScolaires || ""}
              onChange={(e) => setTaxesScolaires(Number(e.target.value) || 0)}
              className="h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-[16px] outline-none focus:border-cfrq-green"
            />
          </label>
        </div>

        {superficie > 0 && superficie < SUPERFICIE_MINIMALE_HA && (
          <p className="mt-3 rounded-lg border border-amber-500/50 bg-amber-50 px-3 py-2 text-[13px] text-cfrq-deep">
            Sous {SUPERFICIE_MINIMALE_HA} ha d'un seul tenant, l'enregistrement comme producteur
            forestier reconnu n'est pas possible : le remboursement ne s'applique pas.
          </p>
        )}

        <p className="mt-3 text-[13px] text-cfrq-ink/65">
          Taxes visées : {cad.format(taxesTotales)} par année. Le plafond de remboursement est donc de{" "}
          <strong className="font-medium text-cfrq-deep">{cad.format(taxesTotales * PART_REMBOURSABLE)}</strong>.
          {superficie > 0 && (
            <> Le PAF applicable à {superficie} ha vaut {cad.format(paf.total)}.</>
          )}
        </p>

        <div className="mt-5 space-y-2 border-t border-black/10 pt-4">
          <label className="flex items-start gap-2.5 text-[14px] text-cfrq-deep">
            <input
              type="checkbox"
              checked={foretFaune}
              onChange={(e) => setForetFaune(e.target.checked)}
              className="mt-1 h-4 w-4 accent-cfrq-green"
            />
            <span>
              Travaux forêt-faune
              <span className="block text-[12.5px] text-cfrq-ink/60">
                Majoration de 10 % si les travaux visent à conserver ou améliorer un habitat faunique,
                sur la foi d'une analyse prévue à l'annexe multiressource du PAF ou à la prescription.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-[14px] text-cfrq-deep">
            <input
              type="checkbox"
              checked={surFacture}
              onChange={(e) => setSurFacture(e.target.checked)}
              className="mt-1 h-4 w-4 accent-cfrq-green"
            />
            <span>
              Factures à l'appui pour les chemins, ponceaux et PAF
              <span className="block text-[12.5px] text-cfrq-ink/60">
                Sur présentation de factures admissibles et de leur preuve de paiement, ces postes
                peuvent valoir jusqu'au double du taux de la grille. Plafond, pas automatisme.
              </span>
            </span>
          </label>
        </div>

        <h2 className="mt-8 font-display text-[22px] font-medium text-cfrq-deep">Les travaux</h2>
        <p className="mt-1.5 text-[13px] text-cfrq-ink/65">
          Grille officielle {ANNEE_GRILLE} du MRNF. Attention à l'unité : tout n'est pas au $/ha.
        </p>

        <div className="mt-4 space-y-2">
          {GROUPES.map((g) => {
            const ouvert = !!ouverts[g.id];
            const retenus = g.taux.filter((t) => (quantites[t.id] || 0) > 0).length;
            return (
              <div key={g.id} className="rounded-xl border border-black/10">
                <button
                  type="button"
                  onClick={() => setOuverts((p) => ({ ...p, [g.id]: !p[g.id] }))}
                  aria-expanded={ouvert}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="text-[15px] font-medium text-cfrq-deep">{g.titre}</span>
                  <span className="flex items-center gap-2 text-[13px] text-cfrq-ink/55">
                    {retenus > 0 && (
                      <span className="rounded-full bg-cfrq-tint px-2 py-0.5 font-medium text-cfrq-leaf">
                        {retenus}
                      </span>
                    )}
                    <span aria-hidden="true">{ouvert ? "−" : "+"}</span>
                  </span>
                </button>

                {ouvert && (
                  <div className="border-t border-black/10 px-4 py-3">
                    <p className="mb-3 text-[12.5px] leading-relaxed text-cfrq-ink/65">{g.definition}</p>
                    <div className="space-y-2">
                      {g.taux.map((t) => {
                        const q = quantites[t.id] || 0;
                        const montant = q > 0 ? valeurLigne(t.id, q) : 0;
                        return (
                          <div key={t.id} className="flex items-start gap-3">
                            <input
                              type="number"
                              min={0}
                              step={pasDeSaisie(t.unite)}
                              value={q || ""}
                              placeholder="0"
                              onChange={(e) => poser(t.id, Number(e.target.value) || 0)}
                              className="h-9 w-[72px] shrink-0 rounded-lg border border-black/15 bg-white px-2 text-right text-[15px] outline-none focus:border-cfrq-green"
                              aria-label={`${t.nom}, en ${LIBELLE_QUANTITE[t.unite]}`}
                            />
                            <span className="mt-1 flex-1 text-[13.5px] leading-snug text-cfrq-deep">
                              {t.nom}
                              <span className="block text-[12px] text-cfrq-ink/55">
                                {cad.format(t.total)}{t.unite.replace("$", "")} · {LIBELLE_QUANTITE[t.unite]}
                                {t.surFacture && " · factures à l'appui possibles"}
                                {t.note && ` · ${t.note}`}
                              </span>
                            </span>
                            <span className="mt-1 w-[86px] shrink-0 text-right text-[13.5px] font-medium text-cfrq-deep">
                              {montant > 0 ? cad.format(montant) : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <h2 className="mt-8 font-display text-[22px] font-medium text-cfrq-deep">Pour le rapport</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <input
            type="text"
            value={proprietaire}
            onChange={(e) => setProprietaire(e.target.value)}
            placeholder="Nom du propriétaire"
            className="h-11 rounded-lg border border-black/15 bg-white px-3 text-[15px] outline-none focus:border-cfrq-green"
            aria-label="Nom du propriétaire"
          />
          <input
            type="text"
            value={municipalite}
            onChange={(e) => setMunicipalite(e.target.value)}
            placeholder="Municipalité"
            className="h-11 rounded-lg border border-black/15 bg-white px-3 text-[15px] outline-none focus:border-cfrq-green"
            aria-label="Municipalité"
          />
          <input
            type="text"
            value={lots}
            onChange={(e) => setLots(e.target.value)}
            placeholder="Numéro(s) de lot"
            className="h-11 rounded-lg border border-black/15 bg-white px-3 text-[15px] outline-none focus:border-cfrq-green"
            aria-label="Numéros de lot"
          />
        </div>
      </div>

      {/* ------------------------------- RAPPORT ------------------------------- */}
      <div className="rtf-rapport rounded-2xl border border-black/5 bg-white p-6 shadow-sm sm:p-8">
        <div className="rtf-ecran-seulement mb-6 flex items-center justify-between gap-4">
          <h2 className="font-display text-[22px] font-medium text-cfrq-deep">Votre rapport</h2>
          <button
            type="button"
            onClick={() => window.print()}
            className="h-11 shrink-0 rounded-lg bg-cfrq-green px-5 text-[15px] font-medium text-[#123005] transition-colors hover:bg-cfrq-green-hover"
          >
            Imprimer en PDF
          </button>
        </div>

        {/* En-tête qui n'apparaît que sur la feuille imprimée. */}
        <div className="rtf-impression-seulement mb-6 hidden border-b border-black/15 pb-4">
          <img
            src={withBaseAsset("/signature/logo-cfrq-transparent.png")}
            alt="CFRQ, Conseillers Forestiers de la Région de Québec"
            className="h-[46px] w-auto"
          />
          <p className="mt-3 text-[11px] leading-snug text-black/60">
            {site.nomComplet} · {site.adresse.ligne1}, {site.adresse.ville} {site.adresse.code} ·{" "}
            {site.tel} · {site.courriel}
          </p>
        </div>

        <h3 className="font-display text-[20px] font-medium leading-snug text-cfrq-deep">
          Remboursement des taxes foncières
          <span className="block text-[15px] font-normal text-cfrq-ink/65">
            Producteur forestier reconnu · estimation fondée sur la grille {ANNEE_GRILLE} du MRNF
          </span>
        </h3>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13.5px] sm:grid-cols-3">
          {proprietaire && (
            <div>
              <dt className="text-cfrq-ink/55">Propriétaire</dt>
              <dd className="font-medium text-cfrq-deep">{proprietaire}</dd>
            </div>
          )}
          {municipalite && (
            <div>
              <dt className="text-cfrq-ink/55">Municipalité</dt>
              <dd className="font-medium text-cfrq-deep">{municipalite}</dd>
            </div>
          )}
          {lots && (
            <div>
              <dt className="text-cfrq-ink/55">Lot(s)</dt>
              <dd className="font-medium text-cfrq-deep">{lots}</dd>
            </div>
          )}
          <div>
            <dt className="text-cfrq-ink/55">Superficie</dt>
            <dd className="font-medium text-cfrq-deep">{nombre.format(superficie)} ha</dd>
          </div>
          <div>
            <dt className="text-cfrq-ink/55">Taxes annuelles</dt>
            <dd className="font-medium text-cfrq-deep">{cad.format(taxesTotales)}</dd>
          </div>
          <div>
            <dt className="text-cfrq-ink/55">Date</dt>
            <dd className="font-medium text-cfrq-deep">{aujourdhui}</dd>
          </div>
        </dl>

        {/* --- Le chiffre qui compte --- */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-cfrq-tint p-4">
            <div className="text-[12.5px] text-cfrq-leaf">Remboursement, année 1</div>
            <div className="mt-1 text-[28px] font-medium leading-none text-cfrq-deep">
              {cad.format(an1?.remboursement ?? 0)}
            </div>
          </div>
          <div className="rounded-xl bg-cfrq-tint p-4">
            <div className="text-[12.5px] text-cfrq-leaf">Sur {ANNEES_REPORT} ans</div>
            <div className="mt-1 text-[28px] font-medium leading-none text-cfrq-deep">
              {cad.format(projection.totalRemboursement)}
            </div>
          </div>
        </div>

        {depenses === 0 ? (
          <p className="mt-4 rounded-xl border border-black/10 bg-cfrq-cream p-4 text-[14px] leading-relaxed text-cfrq-deep">
            Aucun travail retenu pour l'instant. Le remboursement n'est pas fonction des taxes seules :
            il faut des dépenses de mise en valeur admissibles pour y avoir droit. Choisissez des
            travaux à gauche pour voir le calcul se remplir.
          </p>
        ) : (
          <p className="mt-4 text-[14px] leading-relaxed text-cfrq-deep">
            Les travaux retenus valent{" "}
            <strong className="font-medium">{cad.format(depenses)}</strong> de dépenses admissibles.
            Vos taxes de l'année étant de {cad.format(taxesTotales)}, vous en utilisez{" "}
            {cad.format(an1.utilise)} tout de suite et reportez {cad.format(an1.reporte)}.
            {anneesCouvertes > 1 ? (
              <>
                {" "}Ces travaux couvrent une partie de vos taxes pendant{" "}
                <strong className="font-medium">{anneesCouvertes} années</strong>.
              </>
            ) : (
              <> Ces travaux couvrent vos taxes pour l'année en cours.</>
            )}
            {projection.soldeAnnule > 0.5 && (
              <>
                {" "}Attention :{" "}
                <strong className="font-medium">{cad.format(projection.soldeAnnule)}</strong> de
                dépenses ne serviraient jamais. Le crédit vaut {ANNEES_REPORT} ans, et le solde qui
                n'a pas été utilisé au terme du délai est annulé, pas reporté plus loin. Sur la
                période, vos taxes ne peuvent absorber que {cad.format(projection.totalTaxes)} de
                dépenses : étaler les travaux sur plusieurs années, pour que chacune ouvre son propre
                délai de {ANNEES_REPORT} ans, en sauverait une partie.
              </>
            )}
          </p>
        )}

        {/* --- Détail des travaux --- */}
        {lignes.length > 0 && (
          <section className="mt-7">
            <h4 className="text-[15px] font-medium text-cfrq-deep">Travaux retenus</h4>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-black/15 text-left text-cfrq-ink/60">
                    <th className="py-1.5 pr-2 font-medium">Traitement</th>
                    <th className="py-1.5 px-2 text-right font-medium">Quantité</th>
                    <th className="py-1.5 px-2 text-right font-medium">Taux</th>
                    <th className="py-1.5 pl-2 text-right font-medium">Dépense</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l.taux.id} className="border-b border-black/5 align-top">
                      <td className="py-1.5 pr-2 text-cfrq-deep">
                        {l.taux.nom}
                        <span className="block text-[11.5px] text-cfrq-ink/50">{l.groupe}</span>
                      </td>
                      <td className="py-1.5 px-2 text-right whitespace-nowrap text-cfrq-deep">
                        {nombre.format(l.quantite)} {LIBELLE_QUANTITE[l.taux.unite]}
                      </td>
                      <td className="py-1.5 px-2 text-right whitespace-nowrap text-cfrq-ink/70">
                        {cad.format(l.taux.total)}{l.taux.unite.replace("$", "")}
                      </td>
                      <td className="py-1.5 pl-2 text-right whitespace-nowrap font-medium text-cfrq-deep">
                        {cad.format(l.montant)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="py-2 pr-2 text-right font-medium text-cfrq-deep">
                      Dépenses admissibles
                    </td>
                    <td className="py-2 pl-2 text-right text-[15px] font-medium text-cfrq-deep">
                      {cad.format(depenses)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {(foretFaune || surFacture) && (
              <p className="mt-2 text-[12px] leading-relaxed text-cfrq-ink/60">
                Montants incluant{" "}
                {[
                  foretFaune && "la majoration de 10 % pour travaux forêt-faune",
                  surFacture && "le doublement des postes admissibles sur présentation de factures",
                ]
                  .filter(Boolean)
                  .join(" et ")}
                .
              </p>
            )}
          </section>
        )}

        {/* --- Projection --- */}
        <section className="mt-7">
          <h4 className="text-[15px] font-medium text-cfrq-deep">
            Vos taxes sur {ANNEES_REPORT} ans
          </h4>
          <p className="mt-1 text-[12.5px] leading-relaxed text-cfrq-ink/65">
            Les travaux sont portés à l'année 1 ; les années suivantes vivent sur le report. Taxes
            indexées de {nombre.format(indexation)} % par année.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-black/15 text-left text-cfrq-ink/60">
                  <th className="py-1.5 pr-2 font-medium">Année</th>
                  <th className="py-1.5 px-2 text-right font-medium">Taxes</th>
                  <th className="py-1.5 px-2 text-right font-medium">Dépenses utilisées</th>
                  <th className="py-1.5 px-2 text-right font-medium">Remboursement</th>
                  <th className="py-1.5 px-2 text-right font-medium">Taxes nettes</th>
                  <th className="py-1.5 pl-2 text-right font-medium">Report</th>
                </tr>
              </thead>
              <tbody>
                {projection.annees.map((a) => (
                  <tr
                    key={a.annee}
                    className={`border-b border-black/5 ${a.remboursement > 0.5 ? "" : "text-cfrq-ink/40"}`}
                  >
                    <td className="py-1.5 pr-2">{a.annee}</td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">{cad.format(a.taxes)}</td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">{cad.format(a.utilise)}</td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap font-medium text-cfrq-leaf">
                      {cad.format(a.remboursement)}
                    </td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">{cad.format(a.taxesNettes)}</td>
                    <td className="py-1.5 pl-2 text-right whitespace-nowrap">{cad.format(a.reporte)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium text-cfrq-deep">
                  <td className="py-2 pr-2">Total</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">{cad.format(projection.totalTaxes)}</td>
                  <td className="py-2 px-2" />
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    {cad.format(projection.totalRemboursement)}
                  </td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    {cad.format(projection.totalTaxesNettes)}
                  </td>
                  <td className="py-2 pl-2" />
                </tr>
                {projection.soldeAnnule > 0.5 && (
                  <tr className="text-cfrq-ink/70">
                    <td colSpan={3} className="py-1.5 pr-2">
                      Solde annulé au terme des {ANNEES_REPORT} ans
                    </td>
                    <td colSpan={3} className="py-1.5 pl-2 text-right whitespace-nowrap font-medium">
                      {cad.format(projection.soldeAnnule)} de dépenses jamais utilisées
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </section>

        {/* --- Le programme, en clair --- */}
        <section className="mt-7">
          <h4 className="text-[15px] font-medium text-cfrq-deep">Comment le programme fonctionne</h4>
          <p className="mt-2 text-[13px] leading-relaxed text-cfrq-ink/80">
            Le propriétaire de forêt privée qui détient un certificat de producteur forestier reconnu
            peut obtenir un remboursement des taxes foncières de sa propriété forestière, sous forme
            d'un crédit d'impôt équivalant à {Math.round(PART_REMBOURSABLE * 100)} % du montant des
            taxes municipales et scolaires.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-cfrq-ink/80">
            Ce remboursement n'est pas automatique : il est commandé par les dépenses de mise en valeur
            admissibles, attestées par le rapport d'un ingénieur forestier. On ne rembourse jamais plus
            de taxes qu'on n'a fait de travaux. Le calcul est donc{" "}
            {Math.round(PART_REMBOURSABLE * 100)} % du plus petit des deux montants, les dépenses ou
            les taxes.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-cfrq-ink/80">
            Si les dépenses d'une année dépassent les taxes de cette même année, l'excédent n'est pas
            perdu tout de suite : il se reporte pour obtenir un remboursement à l'intérieur d'une
            période qui n'excède pas {ANNEES_REPORT} ans. Le crédit a toutefois une fin : au terme de
            ces {ANNEES_REPORT} ans, le solde qui n'a pas servi est annulé. C'est pourquoi il vaut
            souvent mieux étaler les travaux sur plusieurs années que de tout concentrer sur une
            seule. Depuis le 1<sup>er</sup> janvier 2022, le producteur peut aussi demander un
            remboursement même si la valeur des travaux de l'année est inférieure au montant des
            taxes.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-cfrq-ink/80">
            La demande se fait à Revenu Québec, dans la déclaration de revenus : partie C de l'annexe E
            pour un particulier, formulaire FM-220.3 pour une société.
          </p>
        </section>

        {/* --- Définitions --- */}
        {groupesUtilises.length > 0 && (
          <section className="mt-7">
            <h4 className="text-[15px] font-medium text-cfrq-deep">
              Définitions des traitements retenus
            </h4>
            <p className="mt-1 text-[12px] text-cfrq-ink/60">
              Annexe 1 du Règlement sur le remboursement des taxes foncières des producteurs forestiers
              reconnus (RLRQ, chapitre A-18.1, r. 12.1).
            </p>
            <dl className="mt-3 space-y-3">
              {groupesUtilises.map((g) => (
                <div key={g.id}>
                  <dt className="text-[13.5px] font-medium text-cfrq-deep">{g.titre}</dt>
                  <dd className="mt-0.5 text-[12.5px] leading-relaxed text-cfrq-ink/75">{g.definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* --- Mentions --- */}
        <section className="mt-7 border-t border-black/10 pt-4">
          <p className="text-[11.5px] leading-relaxed text-cfrq-ink/60">
            Estimation indicative préparée à titre informatif. Elle ne remplace ni le rapport de
            l'ingénieur forestier exigé par le programme, ni un avis fiscal. L'admissibilité réelle
            suppose un certificat de producteur forestier reconnu valide, l'enregistrement des
            superficies à vocation forestière, une propriété d'au moins {SUPERFICIE_MINIMALE_HA} ha
            d'un seul tenant et des dépenses effectivement réalisées et attestées. Les taux sont ceux
            de la grille {ANNEE_GRILLE} et sont révisés annuellement par le ministère.
          </p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-cfrq-ink/60">
            Sources :{" "}
            <a href={SOURCE_GRILLE} className="underline" target="_blank" rel="noopener noreferrer">
              Grille des valeurs des dépenses admissibles {ANNEE_GRILLE} (MRNF)
            </a>{" "}
            ·{" "}
            <a href={SOURCE_REGLEMENT} className="underline" target="_blank" rel="noopener noreferrer">
              Règlement A-18.1, r. 12.1
            </a>
            . Préparé par {site.nom}, {site.nomComplet}, {site.tel}, {site.courriel}.
          </p>
        </section>
      </div>
    </div>
  );
}
