// Compte créé mais pas encore relié à un dossier : le client dit qui il est, un
// employé de CFRQ relie son compte au bon dossier (vue employé, « Demandes d'accès »).
// Un compte dont le courriel confirmé est celui du dossier dans PlaniLogix n'arrive
// jamais ici : il est titulaire d'office (migration 20261009160000_liaison_par_courriel).
// Ce qui arrive ici, c'est une adresse que CFRQ n'a pas au dossier : aucune liaison
// automatique sur la foi d'un nom ou d'un lot, que n'importe qui peut écrire ; une
// personne de CFRQ tranche. La demande part par portail_demander_acces, puis
// notifier-acces avise cfrq@cfrq.ca.
import { useEffect, useState, type ChangeEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import { withBase } from "../lib/url";
import { site } from "../data/site";

export type ValeursAcces = { nom: string; municipalite: string; telephone: string; no_producteur: string; lots: string };
export type MaDemande = { id: number; statut: "en_attente" | "reliee" | "refusee"; nom: string; municipalite: string; telephone: string | null; no_producteur: string | null; lots?: string | null } | null;

const champ =
  "h-12 w-full rounded-[10px] border border-black/15 bg-white px-4 text-[16px] outline-none transition-shadow focus:border-cfrq-green focus:shadow-[0_0_0_3px_rgba(90,189,42,.18)]";

export function FormulaireAcces({
  initial,
  envoi,
  erreur,
  onEnvoyer,
  onAnnuler,
}: {
  initial?: Partial<ValeursAcces>;
  envoi: boolean;
  erreur?: string;
  onEnvoyer: (v: ValeursAcces) => void;
  onAnnuler?: () => void;
}) {
  const [v, setV] = useState<ValeursAcces>({
    nom: initial?.nom ?? "", municipalite: initial?.municipalite ?? "",
    telephone: initial?.telephone ?? "", no_producteur: initial?.no_producteur ?? "", lots: initial?.lots ?? "",
  });
  const maj = (k: keyof ValeursAcces) => (e: ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const valide = v.nom.trim().length >= 2 && v.municipalite.trim().length >= 2;

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => { e.preventDefault(); if (valide && !envoi) onEnvoyer(v); }}
    >
      <label className="block">
        <span className="text-[14px] font-medium text-cfrq-deep">Votre nom, ou celui de votre entreprise</span>
        <input className={`mt-1.5 ${champ}`} value={v.nom} onChange={maj("nom")} autoComplete="name" required maxLength={120} />
      </label>
      <label className="block">
        <span className="text-[14px] font-medium text-cfrq-deep">Municipalité où se trouve votre boisé</span>
        <input className={`mt-1.5 ${champ}`} value={v.municipalite} onChange={maj("municipalite")} required maxLength={120} />
      </label>
      <label className="block">
        <span className="text-[14px] font-medium text-cfrq-deep">Numéro(s) de lot <span className="font-normal text-cfrq-ink/50">(facultatif, sur votre compte de taxes ou votre plan)</span></span>
        <input className={`mt-1.5 ${champ}`} value={v.lots} onChange={maj("lots")} placeholder="Ex. : 5 833 738" maxLength={200} />
      </label>
      <label className="block">
        <span className="text-[14px] font-medium text-cfrq-deep">Téléphone <span className="font-normal text-cfrq-ink/50">(pour vous joindre au besoin)</span></span>
        <input className={`mt-1.5 ${champ}`} value={v.telephone} onChange={maj("telephone")} type="tel" autoComplete="tel" maxLength={40} />
      </label>
      <label className="block">
        <span className="text-[14px] font-medium text-cfrq-deep">Numéro de producteur <span className="font-normal text-cfrq-ink/50">(facultatif, s'il figure sur vos documents)</span></span>
        <input className={`mt-1.5 ${champ}`} value={v.no_producteur} onChange={maj("no_producteur")} maxLength={40} />
      </label>
      {erreur && <p className="text-[14px] text-red-600" role="alert">{erreur}</p>}
      <div className="flex flex-wrap gap-2.5 pt-1">
        <button
          type="submit"
          disabled={!valide || envoi}
          className="rounded-[10px] bg-cfrq-green px-5 py-3 text-[15px] font-semibold text-[#123005] transition-colors hover:bg-cfrq-green-hover disabled:opacity-50"
        >
          {envoi ? "Envoi…" : "Envoyer ma demande"}
        </button>
        {onAnnuler && (
          <button type="button" onClick={onAnnuler} className="rounded-[10px] border border-black/15 px-5 py-3 text-[15px] text-cfrq-leaf transition-colors hover:bg-cfrq-tint">
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

export function DemandeRecue({ demande, courriel, onModifier }: { demande: NonNullable<MaDemande>; courriel: string | null; onModifier: () => void }) {
  return (
    <div className="mt-6 rounded-2xl border border-cfrq-green/30 bg-cfrq-tint/60 p-5">
      <p className="font-medium text-cfrq-deep">✓ Demande reçue</p>
      <p className="mt-1.5 text-[15px] leading-relaxed text-cfrq-ink/75">
        Nous relions votre compte au dossier de <strong className="font-semibold">{demande.nom}</strong> ({demande.municipalite}).
        Vous recevrez un courriel{courriel ? <> à <strong className="font-semibold">{courriel}</strong></> : null} dès que votre espace sera prêt.
      </p>
      <button onClick={onModifier} className="mt-3 text-[14px] font-medium text-cfrq-leaf underline-offset-2 hover:underline">
        Modifier ma demande
      </button>
    </div>
  );
}

export default function CompteNonRelie({ courriel, onDeconnexion }: { courriel: string | null; onDeconnexion: () => void }) {
  const [demande, setDemande] = useState<MaDemande>(null);
  const [chargement, setChargement] = useState(true);
  const [edition, setEdition] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    supabase.rpc("portail_ma_demande").then(({ data }) => {
      setDemande((data as MaDemande) ?? null);
      setChargement(false);
    });
  }, []);

  async function envoyer(v: ValeursAcces) {
    setEnvoi(true);
    setErreur("");
    const { error } = await supabase.rpc("portail_demander_acces", {
      p_nom: v.nom, p_municipalite: v.municipalite, p_telephone: v.telephone || null, p_no_producteur: v.no_producteur || null, p_lots: v.lots || null,
    });
    if (error) {
      setErreur("Votre demande n'a pas pu être envoyée. Réessayez, ou appelez-nous.");
      setEnvoi(false);
      return;
    }
    // L'avis à CFRQ ne bloque jamais le client : la demande est en base, un employé la verra.
    await supabase.functions.invoke("notifier-acces", { body: { type: "nouvelle_demande", origine: window.location.origin } }).catch(() => {});
    const { data } = await supabase.rpc("portail_ma_demande");
    setDemande((data as MaDemande) ?? null);
    setEdition(false);
    setEnvoi(false);
  }

  const enAttente = demande?.statut === "en_attente";
  const refusee = demande?.statut === "refusee";

  return (
    <div className="flex min-h-screen items-center justify-center bg-cfrq-cream px-5 py-10">
      <div className="w-full max-w-[560px] rounded-3xl border border-black/[.07] bg-white p-[clamp(26px,5vw,42px)]">
        <span className="inline-flex items-center gap-2 rounded-full bg-cfrq-tint px-3.5 py-[6px] text-[12px] font-bold uppercase tracking-[0.12em] text-cfrq-leaf">
          <span className="h-[7px] w-[7px] flex-none rounded-full bg-cfrq-green" aria-hidden="true" />
          Compte créé
        </span>
        <h1 className="mt-5 font-display text-[clamp(23px,4.5vw,30px)] font-medium leading-[1.15] text-cfrq-deep">
          Il reste à relier votre espace à votre dossier forestier
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-cfrq-ink/70">
          Votre compte {courriel ? <strong className="font-semibold text-cfrq-deep">{courriel}</strong> : "est bien créé"} fonctionne,
          mais nous ne trouvons pas cette adresse dans nos dossiers.
        </p>
        <p className="mt-3 text-[16px] leading-relaxed text-cfrq-ink/70">
          Vous nous avez déjà donné une autre adresse ? Déconnectez-vous et créez votre espace avec celle-là :
          votre dossier s'ouvrira dès que vous l'aurez confirmée. Sinon, dites-nous qui vous êtes : un membre de
          notre équipe vérifie et relie votre compte au dossier de votre boisé.
        </p>

        {chargement ? (
          <p className="mt-6 text-[15px] text-cfrq-ink/55">Chargement…</p>
        ) : enAttente && !edition ? (
          <DemandeRecue demande={demande!} courriel={courriel} onModifier={() => setEdition(true)} />
        ) : (
          <>
            {refusee && !edition && (
              <p className="mt-5 rounded-xl bg-[#fff6dc] p-4 text-[14.5px] leading-relaxed text-[#6b4e00]">
                Nous n'avons pas pu relier votre compte à partir de votre dernière demande. Vérifiez vos informations, ou appelez-nous au {site.tel}.
              </p>
            )}
            <FormulaireAcces
              initial={demande ? { nom: demande.nom, municipalite: demande.municipalite, telephone: demande.telephone ?? "", no_producteur: demande.no_producteur ?? "", lots: demande.lots ?? "" } : undefined}
              envoi={envoi}
              erreur={erreur}
              onEnvoyer={envoyer}
              onAnnuler={enAttente ? () => setEdition(false) : undefined}
            />
          </>
        )}

        <p className="mt-6 text-[14px] text-cfrq-ink/60">
          Vous préférez nous parler ? Appelez-nous au{" "}
          <a href={site.telHref} className="font-medium text-cfrq-leaf">{site.tel}</a> ou écrivez à{" "}
          <a href={`mailto:${site.courriel}`} className="font-medium text-cfrq-leaf">{site.courriel}</a>.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/[.07] pt-5">
          <a href={withBase("/")} className="text-[14px] text-cfrq-leaf hover:text-cfrq-green">← Retour au site</a>
          <button onClick={onDeconnexion} className="rounded-full border border-black/15 px-3.5 py-2 text-[13px] text-cfrq-leaf transition-colors hover:bg-cfrq-tint">
            Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
}
