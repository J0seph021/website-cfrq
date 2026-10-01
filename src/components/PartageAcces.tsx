// « Qui a accès à votre espace » : le titulaire du dossier donne lui-même l'accès à
// un co-propriétaire, un proche, sa banque ou son notaire, voit en tout temps qui a
// accès et retire un accès d'un clic. Aucune approbation de CFRQ.
//
// L'accès suit le courriel CONFIRMÉ du tiers, et le retrait vaut dès la requête
// suivante : tout est vérifié en base (supabase/migrations/20261001150000_partages_acces.sql).
// Le tiers reçoit un courriel d'invitation (Edge Function notifier-acces).
// En vue employé : la liste et le retrait seulement (le client appelle : « enlevez
// mon ex »), jamais l'ajout d'un accès au nom du client.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Invite = {
  id: number;
  nom: string;
  courriel: string;
  relation: string | null;
  cree_le: string;
  invitation_envoyee_le: string | null;
  statut: "actif" | "en_attente";
};

type Partages = {
  peut_inviter: boolean;
  titulaires: { courriel: string; vous: boolean }[];
  invites: Invite[];
};

// Clés permises par la contrainte de partages_acces.relation.
export const RELATIONS: Record<string, string> = {
  coproprietaire: "Co-propriétaire",
  conjoint: "Conjoint ou conjointe",
  famille: "Membre de la famille",
  institution_financiere: "Institution financière",
  notaire_comptable: "Notaire ou comptable",
  autre: "Autre",
};

const DEMO: Partages = {
  peut_inviter: true,
  titulaires: [{ courriel: "demo@exemple.test", vous: true }],
  invites: [
    { id: 1, nom: "Marie Tremblay", courriel: "marie.tremblay@exemple.test", relation: "conjoint", cree_le: "2026-09-12T14:00:00Z", invitation_envoyee_le: "2026-09-12T14:00:00Z", statut: "actif" },
    { id: 2, nom: "Caisse Desjardins de Portneuf", courriel: "conseiller@exemple.test", relation: "institution_financiere", cree_le: "2026-09-28T14:00:00Z", invitation_envoyee_le: "2026-09-28T14:00:00Z", statut: "en_attente" },
  ],
};

const dateCourte = (iso: string) => new Date(iso).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });

function initiales(t: string): string {
  const mots = t.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return (mots.length > 1 ? mots[0][0] + mots[1][0] : (mots[0] ?? "?").slice(0, 2)).toUpperCase();
}

// supabase.functions.invoke rend une erreur pour toute réponse non 2xx ; le statut
// est dans error.context (la Response).
async function envoyerInvitation(id: number): Promise<"ok" | "deja" | "echec"> {
  const { error } = await supabase.functions.invoke("notifier-acces", {
    body: { type: "invitation", partage_id: id, origine: window.location.origin },
  });
  if (!error) return "ok";
  return (error as { context?: Response }).context?.status === 429 ? "deja" : "echec";
}

export default function PartageAcces({
  vueEmploye = false,
  apercu = false,
  onNeutralise,
}: {
  vueEmploye?: boolean;
  /** Démonstration locale : données d'exemple, aucun appel à la base. */
  apercu?: boolean;
  onNeutralise?: (message: string) => void;
}) {
  const [p, setP] = useState<Partages | null>(apercu ? DEMO : null);
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [aRetirer, setARetirer] = useState<number | null>(null);
  const [occupe, setOccupe] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [erreur, setErreur] = useState("");

  const charger = useCallback(async () => {
    if (apercu) return;
    const { data, error } = await supabase.rpc("portail_partages");
    if (!error) setP((data as Partages | null) ?? null);
  }, [apercu]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 6000);
    return () => clearTimeout(t);
  }, [note]);

  // Rien pour un tiers (la base rend null) ni si la lecture a échoué.
  if (!p) return null;

  async function retirer(inv: Invite) {
    setErreur("");
    if (apercu) {
      setP((s) => s && { ...s, invites: s.invites.filter((i) => i.id !== inv.id) });
      setARetirer(null);
      setNote(`${inv.nom} n'a plus accès à votre espace.`);
      return;
    }
    setOccupe(inv.id);
    const { error } = await supabase.rpc("portail_retirer_partage", { p_id: inv.id });
    setOccupe(null);
    setARetirer(null);
    if (error) { setErreur(error.message || "Le retrait n'a pas fonctionné. Réessayez."); return; }
    setNote(vueEmploye ? `Accès de ${inv.nom} retiré.` : `${inv.nom} n'a plus accès à votre espace.`);
    charger();
  }

  async function renvoyer(inv: Invite) {
    setErreur("");
    if (vueEmploye) { onNeutralise?.("Envoi désactivé : vous consultez le dossier d'un client."); return; }
    if (apercu) { setNote(`Invitation renvoyée à ${inv.courriel}.`); return; }
    setOccupe(inv.id);
    const r = await envoyerInvitation(inv.id);
    setOccupe(null);
    if (r === "ok") { setNote(`Invitation renvoyée à ${inv.courriel}.`); charger(); }
    else if (r === "deja") setErreur("Une invitation est partie il y a moins d'une heure. Laissez-lui le temps de la recevoir, et de regarder dans ses courriels indésirables.");
    else setErreur(`L'invitation n'a pas pu partir. ${inv.nom} peut quand même se connecter à cfrq.ca/espace-client avec l'adresse ${inv.courriel} : son accès est ouvert.`);
  }

  const bouton2 = "rounded-full border border-black/15 px-3.5 py-1.5 text-[13px] font-medium transition-colors";

  return (
    <section id="acces" data-visite="partage" className="scroll-mt-28 rounded-2xl border border-black/5 bg-white p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="font-display text-xl font-medium text-cfrq-deep">Qui a accès à votre espace</h2>
          <p className="mt-2 text-[15.5px] leading-relaxed text-cfrq-ink/75">
            Donnez l'accès à un co-propriétaire, un proche, votre banque ou votre notaire. Vous voyez toujours qui a accès, et vous retirez un accès d'un clic.
          </p>
        </div>
        {p.peut_inviter && (
          <button onClick={() => setAjoutOuvert(true)}
            className="shrink-0 rounded-lg bg-cfrq-green px-5 py-2.5 text-[14.5px] font-medium text-[#123005] transition-colors hover:bg-cfrq-green-hover">
            Donner accès à quelqu'un
          </button>
        )}
      </div>

      <ul className="mt-5 divide-y divide-black/[.06] rounded-xl border border-black/[.07]">
        {p.titulaires.map((t) => (
          <li key={t.courriel} className="flex items-center gap-3 px-4 py-3.5">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cfrq-green text-[12.5px] font-semibold text-[#123005]">{initiales(t.courriel)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-medium text-cfrq-deep">
                {t.vous ? "Vous" : t.courriel}
                <span className="ml-2 rounded-full bg-cfrq-tint px-2 py-0.5 align-middle text-[11.5px] font-medium text-cfrq-leaf">Titulaire</span>
              </p>
              <p className="truncate text-[13px] text-cfrq-ink/55">{t.vous ? t.courriel : "Compte relié au dossier par CFRQ"}</p>
            </div>
          </li>
        ))}
        {p.invites.map((i) => (
          <li key={i.id} className="flex flex-wrap items-start gap-x-3 gap-y-2.5 px-4 py-3.5 sm:items-center">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cfrq-tint text-[12.5px] font-semibold text-cfrq-leaf">{initiales(i.nom)}</span>
            <div className="min-w-0 flex-1 basis-[200px]">
              <p className="text-[14.5px] font-medium text-cfrq-deep [overflow-wrap:anywhere]">
                {i.nom}
                {i.relation && RELATIONS[i.relation] && <span className="font-normal text-cfrq-ink/55"> · {RELATIONS[i.relation]}</span>}
              </p>
              <p className="truncate text-[13px] text-cfrq-ink/55">{i.courriel}</p>
              <p className="mt-0.5 flex items-start gap-1.5 text-[12.5px] text-cfrq-ink/55">
                <span aria-hidden className={`mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full ${i.statut === "actif" ? "bg-cfrq-green" : "bg-amber-400"}`} />
                {i.statut === "actif"
                  ? `Accès actif depuis le ${dateCourte(i.cree_le)}`
                  : `Invitation envoyée, en attente de sa première connexion`}
              </p>
            </div>
            {aRetirer === i.id ? (
              <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                <span className="text-[13.5px] text-cfrq-deep">Retirer son accès ?</span>
                <button onClick={() => retirer(i)} disabled={occupe === i.id}
                  className="rounded-full bg-red-700 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-60">
                  {occupe === i.id ? "…" : "Oui, retirer"}
                </button>
                <button onClick={() => setARetirer(null)} className={`${bouton2} text-cfrq-ink/70 hover:bg-cfrq-tint`}>Annuler</button>
              </div>
            ) : (
              <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
                {i.statut === "en_attente" && !vueEmploye && (
                  <button onClick={() => renvoyer(i)} disabled={occupe === i.id} className={`${bouton2} text-cfrq-leaf hover:bg-cfrq-tint disabled:opacity-60`}>
                    {occupe === i.id ? "…" : "Renvoyer l'invitation"}
                  </button>
                )}
                <button onClick={() => { setErreur(""); setARetirer(i.id); }} className={`${bouton2} text-cfrq-ink/70 hover:border-red-700/40 hover:text-red-700`}>
                  Retirer l'accès
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {p.invites.length === 0 && (
        <p className="mt-3 text-[14px] text-cfrq-ink/60">Pour l'instant, personne d'autre n'a accès à votre espace.</p>
      )}
      {note && <p className="mt-3 text-[14px] font-medium text-cfrq-leaf" role="status" aria-live="polite">✓ {note}</p>}
      {erreur && <p className="mt-3 text-[13.5px] text-red-700" role="alert">{erreur}</p>}
      <p className="mt-4 text-[13px] leading-snug text-cfrq-ink/55">
        {vueEmploye
          ? "Vue employé : seul le client peut donner un accès. Vous pouvez en retirer un à sa demande."
          : "Les personnes invitées consultent votre espace sans rien pouvoir modifier. Votre équipe CFRQ y a aussi accès pour vous servir."}
      </p>

      {ajoutOuvert && (
        <DonnerAcces
          apercu={apercu}
          onFermer={() => setAjoutOuvert(false)}
          onAjoute={(inv) => {
            if (apercu) setP((s) => s && { ...s, invites: [...s.invites, inv] });
            else charger();
          }}
        />
      )}
    </section>
  );
}

function DonnerAcces({ apercu, onFermer, onAjoute }: { apercu: boolean; onFermer: () => void; onAjoute: (inv: Invite) => void }) {
  const [nom, setNom] = useState("");
  const [courriel, setCourriel] = useState("");
  const [relation, setRelation] = useState("");
  const [etat, setEtat] = useState<"saisie" | "envoi" | "fait">("saisie");
  const [courrielParti, setCourrielParti] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFermer]);

  async function donner() {
    setErr("");
    const c = courriel.trim().toLowerCase();
    if (nom.trim().length < 2) { setErr("Indiquez le nom de la personne."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) { setErr("Vérifiez l'adresse courriel."); return; }
    setEtat("envoi");
    if (apercu) {
      onAjoute({ id: Date.now(), nom: nom.trim(), courriel: c, relation: relation || null, cree_le: new Date().toISOString(), invitation_envoyee_le: new Date().toISOString(), statut: "en_attente" });
      setEtat("fait");
      return;
    }
    const { data, error } = await supabase.rpc("portail_partager", { p_courriel: c, p_nom: nom.trim(), p_relation: relation || null });
    if (error || !(data as { ok?: boolean })?.ok) {
      setErr(error?.message || "L'accès n'a pas pu être donné. Réessayez dans un instant.");
      setEtat("saisie");
      return;
    }
    const r = await envoyerInvitation(Number((data as { id: number }).id));
    setCourrielParti(r !== "echec");
    onAjoute(data as Invite);
    setEtat("fait");
  }

  const champ =
    "h-[46px] w-full rounded-[10px] border border-black/15 bg-white px-[14px] text-[15px] outline-none transition-shadow focus:border-cfrq-green focus:shadow-[0_0_0_3px_rgba(90,189,42,.18)]";

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:px-5" role="dialog" aria-modal="true" aria-labelledby="donner-acces-titre" onClick={onFermer}>
      <div className="max-h-[92vh] w-full max-w-[460px] overflow-auto rounded-t-2xl bg-white p-6 shadow-[0_30px_70px_rgba(0,0,0,.35)] sm:rounded-2xl sm:p-7" onClick={(e) => e.stopPropagation()}>
        {etat === "fait" ? (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-cfrq-green text-[22px] font-bold text-[#123005]">✓</div>
            <h2 id="donner-acces-titre" className="font-display text-[22px] text-cfrq-deep">C'est fait</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-cfrq-ink/70">
              {nom.trim()} a maintenant accès à votre espace.{" "}
              {courrielParti
                ? <>Nous venons de lui écrire à <strong className="font-medium text-cfrq-deep">{courriel.trim().toLowerCase()}</strong> pour lui expliquer comment se connecter.</>
                : <>Le courriel d'invitation n'a pas pu partir : dites-lui de se connecter à cfrq.ca/espace-client avec l'adresse <strong className="font-medium text-cfrq-deep">{courriel.trim().toLowerCase()}</strong>.</>}
            </p>
            <button onClick={onFermer} autoFocus className="mt-5 w-full rounded-[10px] bg-cfrq-green px-6 py-3 text-[15px] font-bold text-[#123005] transition-colors hover:bg-cfrq-green-hover">Terminé</button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); donner(); }} noValidate>
            <div className="flex items-start justify-between gap-3">
              <h2 id="donner-acces-titre" className="font-display text-[22px] text-cfrq-deep">Donner accès à quelqu'un</h2>
              <button type="button" onClick={onFermer} aria-label="Fermer" className="shrink-0 rounded-full bg-black/5 px-2.5 py-1 text-sm hover:bg-black/10">✕</button>
            </div>
            <p className="mt-1.5 text-[14px] leading-relaxed text-cfrq-ink/65">
              La personne recevra un courriel et se connectera avec cette adresse. Aucun mot de passe à lui transmettre.
            </p>

            <label htmlFor="acces-nom" className="mb-1.5 mt-4 block text-[13.5px] font-semibold text-cfrq-deep">Nom</label>
            <input id="acces-nom" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} autoComplete="off" autoFocus
              placeholder="ex. Marie Tremblay, ou le nom de votre caisse" className={champ} />

            <label htmlFor="acces-courriel" className="mb-1.5 mt-3 block text-[13.5px] font-semibold text-cfrq-deep">Courriel</label>
            <input id="acces-courriel" type="email" inputMode="email" value={courriel} onChange={(e) => setCourriel(e.target.value)} maxLength={254} autoComplete="off"
              placeholder="l'adresse avec laquelle elle se connectera" className={champ} />

            <label htmlFor="acces-relation" className="mb-1.5 mt-3 block text-[13.5px] font-semibold text-cfrq-deep">
              Lien avec vous <span className="font-normal text-cfrq-ink/50">(facultatif)</span>
            </label>
            <select id="acces-relation" value={relation} onChange={(e) => setRelation(e.target.value)} className={champ}>
              <option value="">Choisir…</option>
              {Object.entries(RELATIONS).map(([cle, label]) => <option key={cle} value={cle}>{label}</option>)}
            </select>

            <div className="mt-4 rounded-xl bg-cfrq-tint/60 p-3.5 text-[13.5px] leading-relaxed text-cfrq-ink/75">
              Cette personne pourra consulter tout votre espace : la carte, vos propriétés, vos travaux et vos documents. Elle ne pourra rien modifier, ni donner accès à d'autres. Vous pourrez retirer son accès en tout temps.
            </div>

            {err && <p className="mt-3 text-[13.5px] text-red-700" role="alert">{err}</p>}
            <div className="mt-5 flex gap-2.5">
              <button type="button" onClick={onFermer} className="flex-1 rounded-[10px] border border-black/15 px-4 py-3 text-[14px] text-cfrq-ink/70 transition-colors hover:bg-cfrq-tint">Annuler</button>
              <button type="submit" disabled={etat === "envoi"} className="flex-1 rounded-[10px] bg-cfrq-green px-4 py-3 text-[14px] font-bold text-[#123005] transition-colors hover:bg-cfrq-green-hover disabled:opacity-60">
                {etat === "envoi" ? "Un instant…" : "Donner l'accès"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
