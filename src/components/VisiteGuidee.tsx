import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
// Styles importés d'office : un import() de CSS à la demande est référencé par le
// build d'Astro sans que le fichier soit émis (404 en ligne, visite muette).
import "driver.js/dist/driver.css";
import "../styles/visite-guidee.css";

// Visite guidée de l'espace client : un mot d'accueil, puis des bulles posées sur
// les repères de la page (attributs data-visite). Elle s'ouvre seule à la première
// connexion ; le bouton « ? » de l'en-tête la relance en tout temps.
//
// « Déjà vue » est noté dans les métadonnées du compte Supabase (suit le client
// d'un appareil à l'autre) et dans le navigateur (repli si l'écriture échoue).
// Le code de driver.js n'est chargé qu'au lancement de la visite.

const CLE_LOCALE = "cfrq-visite-guidee";

function vueLocalement(): boolean {
  try { return !!localStorage.getItem(CLE_LOCALE); } catch { return false; }
}

function noterVue(apercu: boolean) {
  const quand = new Date().toISOString();
  try { localStorage.setItem(CLE_LOCALE, quand); } catch { /* navigation privée */ }
  if (!apercu) supabase.auth.updateUser({ data: { visite_guidee_vue: quand } }).catch(() => {});
}

type Etape = { cle: string; titre: string; texte: string; cote?: "top" | "bottom" | "left" | "right" };

function etapes(sansPeuplements: boolean): Etape[] {
  const aTaxes = !!document.querySelector('[data-visite="taxes"]');
  return [
    {
      cle: "sommaire", cote: "bottom",
      titre: "Tout est à un clic",
      texte: "Ce menu vous amène directement à chaque section de la page : votre carte, vos propriétés, votre plan et vos documents.",
    },
    {
      cle: "ingenieur",
      titre: "Une question ?",
      texte: "Votre ingénieur forestier est à un clic : appelez-nous ou écrivez-nous directement d'ici.",
    },
    {
      cle: "carte",
      titre: "Votre forêt, lot par lot",
      texte: sansPeuplements
        ? "Vos limites de propriété, vos travaux réalisés (en rouge), vos prescriptions et vos cours d'eau, sur photo aérienne. Touchez une zone de travaux pour ouvrir ses documents. Le bouton ⛶ affiche la carte en plein écran."
        : "Vos peuplements, vos travaux réalisés (en rouge) et vos prescriptions, sur photo aérienne. Touchez une zone pour voir son détail et ouvrir ses documents. Le bouton ⛶ affiche la carte en plein écran.",
    },
    {
      cle: "documents", cote: "bottom",
      titre: "Vos documents signés",
      texte: "Plans d'aménagement, prescriptions et rapports d'exécution : ouvrez-les en tout temps, même sur votre téléphone." +
        (aTaxes ? " Vos rapports de taxes foncières sont juste en dessous : c'est la pièce à remettre à votre comptable." : ""),
    },
    {
      cle: "bientot",
      titre: "Bientôt dans votre espace",
      texte: "De nouveaux outils s'en viennent. Touchez « M'aviser quand c'est prêt » sous ceux qui vous intéressent : nous vous écrirons le jour de leur sortie.",
    },
    {
      cle: "partage",
      titre: "Partagez votre espace",
      texte: "Donnez accès à un co-propriétaire, un proche, votre banque ou votre notaire, en quelques secondes. Vous voyez toujours qui a accès, et vous retirez un accès d'un clic.",
    },
    {
      cle: "demandes",
      titre: "Une demande à nous faire ?",
      texte: "Une terre absente de votre espace, ou un lot que vous songez à acheter : choisissez, et notre équipe fait le suivi avec vous.",
    },
    {
      cle: "motdepasse", cote: "bottom",
      titre: "Votre mot de passe",
      texte: "Vous préférez un mot de passe au lien reçu par courriel ? Choisissez-le ici, en tout temps : vous pourrez ensuite vous connecter des deux façons.",
    },
    {
      cle: "revoir", cote: "bottom",
      titre: "Revoir la visite",
      texte: "Ce bouton relance la visite en tout temps. Bonne découverte !",
    },
  ];
}

async function lancer(sansPeuplements: boolean, apercu: boolean) {
  let driver: typeof import("driver.js").driver;
  try {
    ({ driver } = await import("driver.js"));
  } catch (e) {
    console.error("[visite] chargement impossible :", e);
    return;
  }
  // Une étape dont le repère est absent (pas de carte, pas de travaux…) est sautée.
  const steps = etapes(sansPeuplements)
    .map((e) => ({ e, el: document.querySelector(`[data-visite="${e.cle}"]`) }))
    .filter(({ el }) => el && (el as HTMLElement).offsetParent !== null)
    .map(({ e, el }) => ({
      element: el as Element,
      popover: { title: e.titre, description: e.texte, side: e.cote },
    }));
  if (!steps.length) return;
  const visite = driver({
    steps,
    showProgress: true,
    progressText: "{{current}} sur {{total}}",
    nextBtnText: "Suivant",
    prevBtnText: "Précédent",
    doneBtnText: "Terminer",
    popoverClass: "visite-cfrq",
    overlayColor: "#10240c",
    overlayOpacity: 0.55,
    stagePadding: 8,
    stageRadius: 16,
    smoothScroll: true,
    onDestroyed: () => noterVue(apercu),
  });
  visite.drive();
}

/** Bouton « ? » de l'en-tête, et ouverture automatique à la première connexion. */
export default function VisiteGuidee({ sansPeuplements, apercu = false }: { sansPeuplements: boolean; apercu?: boolean }) {
  const [accueil, setAccueil] = useState(false);
  const verifie = useRef(false);

  useEffect(() => {
    if (verifie.current) return;
    verifie.current = true;
    // Retour de paiement : la page défile vers le Portrait, on ne l'interrompt pas.
    if (new URLSearchParams(window.location.search).get("paye") === "1") return;
    let annule = false;
    (async () => {
      if (vueLocalement()) return;
      if (!apercu) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.user_metadata?.visite_guidee_vue) return;
      }
      // Laisser la page se poser (chiffres animés, carte) avant d'ouvrir l'accueil.
      setTimeout(() => { if (!annule) setAccueil(true); }, 900);
    })();
    return () => { annule = true; };
  }, [apercu]);

  function commencer() {
    setAccueil(false);
    window.scrollTo({ top: 0 });
    lancer(sansPeuplements, apercu);
  }

  function plusTard() {
    setAccueil(false);
    noterVue(apercu);
  }

  return (
    <>
      <button
        type="button"
        data-visite="revoir"
        onClick={() => lancer(sansPeuplements, apercu)}
        title="Visite guidée"
        aria-label="Lancer la visite guidée de votre espace"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-black/15 text-[15px] font-semibold text-cfrq-leaf transition-colors hover:bg-cfrq-tint"
      >
        ?
      </button>

      {accueil && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#10240c]/55 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="visite-titre">
          <div className="w-full max-w-[440px] rounded-3xl bg-white p-7 shadow-2xl">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-cfrq-tint text-[22px]" aria-hidden>🌲</span>
            <h2 id="visite-titre" className="mt-4 font-display text-[24px] font-medium leading-tight text-cfrq-deep">
              Bienvenue dans votre espace client
            </h2>
            <p className="mt-2.5 text-[15.5px] leading-relaxed text-cfrq-ink/70">
              Votre dossier forestier, réuni au même endroit. On vous fait faire le tour de la page ? Ça prend moins d'une minute.
            </p>
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row-reverse">
              <button type="button" onClick={commencer} autoFocus
                className="flex-1 rounded-xl bg-cfrq-green px-5 py-3 text-[15px] font-semibold text-[#123005] transition-colors hover:bg-cfrq-green-hover">
                Faire la visite
              </button>
              <button type="button" onClick={plusTard}
                className="flex-1 rounded-xl border border-black/15 px-5 py-3 text-[15px] font-medium text-cfrq-leaf transition-colors hover:bg-cfrq-tint">
                Pas maintenant
              </button>
            </div>
            <p className="mt-4 text-center text-[13px] text-cfrq-ink/50">
              Le bouton <span className="font-semibold text-cfrq-leaf">?</span> en haut de la page la relance en tout temps.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
