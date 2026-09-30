// « Bientôt dans votre espace » : les fonctionnalités à venir, chacune avec un bouton
// « M'aviser quand c'est prêt ». Chaque clic est gardé en base
// (public.interets_fonctionnalites, via portail_aviser_moi) : on saura ce que les
// clients veulent vraiment avant de le bâtir, et à qui écrire le jour de la sortie.
// Aucun courriel n'est envoyé au clic.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Les clés doivent rester celles permises par la contrainte de la table.
export const A_VENIR = [
  {
    cle: "valeur_foret",
    icone: "📈",
    titre: "La valeur de votre forêt",
    texte: "Ce que valent vos peuplements aujourd'hui, et comment ce capital grandit avec le temps et les bons travaux.",
  },
  {
    cle: "portrait",
    icone: "🧭",
    titre: "Votre Portrait des forêts",
    texte: "Carbone, faune, potentiel acéricole, fiscalité : des relevés sur mesure pour votre boisé.",
  },
  {
    cle: "suivi_travaux",
    icone: "🚜",
    titre: "Le suivi de vos travaux en cours",
    texte: "Où en sont vos travaux, de la prescription jusqu'à la fin du chantier.",
  },
] as const;

export default function Bientot({
  vueEmploye = false,
  apercu = false,
  onNeutralise,
}: {
  vueEmploye?: boolean;
  /** Démonstration locale : pas d'appel à la base, le bouton répond tout de suite. */
  apercu?: boolean;
  onNeutralise?: (message: string) => void;
}) {
  const [inscrits, setInscrits] = useState<Set<string>>(new Set());
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    if (apercu) return;
    supabase.rpc("portail_mes_interets").then(({ data }) => {
      if (Array.isArray(data)) setInscrits(new Set(data as string[]));
    });
  }, [apercu]);

  async function aviser(cle: string) {
    if (vueEmploye) {
      onNeutralise?.("Inscription désactivée : vous consultez le dossier d'un client.");
      return;
    }
    if (apercu) {
      setInscrits((s) => new Set(s).add(cle));
      return;
    }
    setEnCours(cle);
    setErreur(false);
    const { data, error } = await supabase.rpc("portail_aviser_moi", { p_fonctionnalite: cle });
    setEnCours(null);
    if (!error && (data as { ok?: boolean })?.ok) setInscrits((s) => new Set(s).add(cle));
    else setErreur(true);
  }

  return (
    <section id="bientot" data-visite="bientot" className="scroll-mt-28 rounded-2xl border border-cfrq-green/20 bg-gradient-to-br from-cfrq-tint to-white p-6 md:p-8">
      <p className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-cfrq-leaf">Bientôt dans votre espace</p>
      <h2 className="mt-2 font-display text-xl font-medium text-cfrq-deep">Votre forêt, encore mieux comprise</h2>
      <p className="mt-2 max-w-2xl text-[15.5px] leading-relaxed text-cfrq-ink/75">
        Nous préparons de nouveaux outils pour votre boisé. Dites-nous lesquels vous intéressent : nous vous écrirons le jour où ils seront prêts.
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {A_VENIR.map((f) => {
          const inscrit = inscrits.has(f.cle);
          return (
            <div key={f.cle} className="flex flex-col rounded-xl border border-black/5 bg-white p-5">
              <div className="flex items-center justify-between">
                <span aria-hidden className="text-2xl">{f.icone}</span>
                <span className="rounded-full bg-cfrq-tint px-2.5 py-0.5 text-[12px] font-medium text-cfrq-leaf">Bientôt</span>
              </div>
              <h3 className="mt-3 font-medium text-cfrq-deep">{f.titre}</h3>
              <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-cfrq-ink/65">{f.texte}</p>
              {inscrit ? (
                <p className="mt-4 text-[14px] font-medium text-cfrq-leaf">✓ Nous vous aviserons</p>
              ) : (
                <button
                  onClick={() => aviser(f.cle)}
                  disabled={enCours === f.cle}
                  className="mt-4 rounded-lg border border-cfrq-green/40 px-4 py-2.5 text-[14px] font-medium text-cfrq-leaf transition-colors hover:bg-cfrq-tint disabled:opacity-60"
                >
                  {enCours === f.cle ? "…" : "M'aviser quand c'est prêt"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {erreur && <p className="mt-3 text-[13.5px] text-red-600" role="alert">Votre inscription n'a pas pu être enregistrée. Réessayez dans un instant.</p>}
    </section>
  );
}
