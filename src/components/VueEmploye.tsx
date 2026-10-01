// Vue employé de l'espace client : un employé CFRQ (courriel @cfrq.ca) ouvre le
// dossier d'un client et voit EXACTEMENT ce que le client voit, pour l'accompagner
// au téléphone. Rien n'est simulé côté navigateur : la sélection est posée en base
// (portail_voir_client) et c'est current_producteur_id(), au coeur de chaque
// politique RLS, qui redirige la lecture vers le dossier choisi. La vue expire
// d'elle-même après 12 h et chaque ouverture est journalisée.
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export type ClientPortail = {
  id: number;
  nom: string | null;
  no_prod: string | null;
  municipalite: string | null;
  nb_documents: number;
  a_carte: boolean;
  a_compte: boolean;
};

// Rôle dans le dossier affiché : le sien (titulaire), celui qu'un titulaire a
// partagé avec la personne (invite), ou celui qu'un employé consulte.
export type RoleDossier = "titulaire" | "invite" | "employe";
export type DossierAccessible = { id: number; nom: string | null; no_prod: string | null; role: "titulaire" | "invite" };

export type Moi = {
  employe: boolean;
  producteur_id: number | null;
  vue_employe: boolean;
  client: { id: number; nom: string | null; no_prod: string | null } | null;
  role?: RoleDossier | null;
  dossiers?: DossierAccessible[];
};

const nfEnt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });

export type SuggestionDossier = { id: number; nom: string | null; no_prod: string | null; municipalite: string | null; a_compte: boolean; score: number };
export type DemandeAccesEmploye = {
  id: number;
  courriel: string;
  nom: string;
  municipalite: string;
  telephone: string | null;
  no_producteur: string | null;
  lots?: string | null;
  cree_le: string;
  suggestions: SuggestionDossier[];
};

/* ------------------------------------------------------------------ */
/* Demandes d'accès : un client s'est inscrit mais son compte n'est    */
/* relié à aucun dossier. On relie à la main, jamais automatiquement.   */
/* ------------------------------------------------------------------ */

export function DemandesAccesVue({
  demandes,
  occupe,
  onRelier,
  onChercher,
  onRefuser,
}: {
  demandes: DemandeAccesEmploye[];
  occupe: number | null;
  onRelier: (d: DemandeAccesEmploye, producteurId: number, nomDossier: string | null) => void;
  onChercher: (d: DemandeAccesEmploye) => void;
  onRefuser: (d: DemandeAccesEmploye) => void;
}) {
  if (demandes.length === 0) return null;
  return (
    <section className="mb-6 rounded-2xl border border-cfrq-green/30 bg-white p-5">
      <h2 className="font-display text-[19px] font-medium text-cfrq-deep">
        Demandes d'accès <span className="ml-1 rounded-full bg-cfrq-green px-2.5 py-0.5 align-middle text-[13px] font-semibold text-[#123005]">{demandes.length}</span>
      </h2>
      <p className="mt-1 text-[14px] text-cfrq-ink/60">
        Ces clients ont créé leur compte. Reliez chacun à son dossier : il recevra un courriel l'avisant que son espace est prêt. Au moindre doute, appelez-le d'abord.
      </p>
      <ul className="mt-4 space-y-3">
        {demandes.map((d) => (
          <li key={d.id} className="rounded-xl border border-black/[.07] bg-cfrq-cream/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-cfrq-deep">{d.nom} <span className="font-normal text-cfrq-ink/60">· {d.municipalite}</span></p>
                <p className="mt-0.5 text-[13.5px] text-cfrq-ink/60">
                  {[d.courriel, d.telephone, d.no_producteur ? `nº ${d.no_producteur}` : null, d.lots ? `lot(s) ${d.lots}` : null,
                    `reçue le ${new Date(d.cree_le).toLocaleDateString("fr-CA", { day: "numeric", month: "long" })}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <button onClick={() => onRefuser(d)} disabled={occupe === d.id} className="text-[13px] text-cfrq-ink/50 underline-offset-2 hover:text-red-700 hover:underline">
                Refuser
              </button>
            </div>
            {d.suggestions.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {d.suggestions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-3.5 py-2.5">
                    <span className="min-w-0 text-[14.5px]">
                      <span className="font-medium text-cfrq-deep">{s.nom ?? "Dossier " + s.id}</span>
                      <span className="text-cfrq-ink/55"> · {[s.no_prod, s.municipalite].filter(Boolean).join(" · ")}</span>
                      {s.a_compte && <span className="ml-2 rounded-full bg-[#fff6dc] px-2 py-0.5 text-[12px] text-[#6b4e00]">a déjà un compte</span>}
                    </span>
                    <button
                      onClick={() => onRelier(d, s.id, s.nom)}
                      disabled={occupe === d.id}
                      className="rounded-full bg-cfrq-green px-3.5 py-1.5 text-[13px] font-semibold text-[#123005] transition-colors hover:bg-cfrq-green-hover disabled:opacity-60"
                    >
                      {occupe === d.id ? "…" : "Relier"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[14px] text-cfrq-ink/60">Aucun dossier ne ressemble à cette demande.</p>
            )}
            <button onClick={() => onChercher(d)} className="mt-2.5 text-[13.5px] font-medium text-cfrq-leaf underline-offset-2 hover:underline">
              Chercher un autre dossier →
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Sélecteur de dossier (page pleine ou fenêtre modale).               */
/* ------------------------------------------------------------------ */

export function ChoixClient({
  courriel,
  enModal = false,
  clientActuel = null,
  onFermer,
  onDeconnexion,
}: {
  courriel?: string | null;
  enModal?: boolean;
  clientActuel?: number | null;
  onFermer?: () => void;
  onDeconnexion?: () => void;
}) {
  const [recherche, setRecherche] = useState("");
  const [clients, setClients] = useState<ClientPortail[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [ouverture, setOuverture] = useState<number | null>(null);
  const champRef = useRef<HTMLInputElement>(null);
  // Demandes d'accès en attente, et celle pour laquelle on cherche un dossier à la main.
  const [demandes, setDemandes] = useState<DemandeAccesEmploye[]>([]);
  const [demandeActive, setDemandeActive] = useState<DemandeAccesEmploye | null>(null);
  const [occupe, setOccupe] = useState<number | null>(null);
  const [annonce, setAnnonce] = useState("");

  useEffect(() => {
    supabase.rpc("portail_demandes_acces").then(({ data }) => {
      if (Array.isArray(data)) setDemandes(data as DemandeAccesEmploye[]);
    });
  }, []);

  async function relier(d: DemandeAccesEmploye, producteurId: number, nomDossier: string | null) {
    if (occupe) return;
    setOccupe(d.id);
    setErreur("");
    const { error } = await supabase.rpc("portail_relier_demande", { p_demande_id: d.id, p_producteur_id: producteurId });
    if (error) {
      setErreur("Le compte n'a pas pu être relié. Réessayez.");
      setOccupe(null);
      return;
    }
    const avis = await supabase.functions
      .invoke("notifier-acces", { body: { type: "acces_pret", demande_id: d.id, origine: window.location.origin } })
      .catch(() => ({ error: true }));
    setDemandes((liste) => liste.filter((x) => x.id !== d.id));
    setDemandeActive(null);
    setOccupe(null);
    setAnnonce(
      `Compte ${d.courriel} relié au dossier ${nomDossier ?? producteurId}. ` +
        (avis?.error ? "Le courriel au client n'a pas pu partir : prévenez-le vous-même. " : "Le client a été avisé par courriel. ") +
        "Pensez à ajouter ce courriel à son dossier dans PlaniLogix.",
    );
  }

  async function refuser(d: DemandeAccesEmploye) {
    if (occupe || !window.confirm(`Refuser la demande de ${d.nom} ? Le client pourra en déposer une nouvelle.`)) return;
    setOccupe(d.id);
    await supabase.rpc("portail_refuser_demande", { p_demande_id: d.id });
    setDemandes((liste) => liste.filter((x) => x.id !== d.id));
    setOccupe(null);
  }

  function chercher(d: DemandeAccesEmploye) {
    setDemandeActive(d);
    setRecherche(d.nom.split(/\s+/).find((m) => m.length >= 3) ?? "");
    champRef.current?.focus();
  }

  useEffect(() => {
    champRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!enModal || !onFermer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enModal, onFermer]);

  // Recherche différée : la frappe ne déclenche qu'un appel une fois la saisie posée.
  useEffect(() => {
    let vivant = true;
    setChargement(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("portail_clients", {
        recherche: recherche.trim(),
        limite: 40,
      });
      if (!vivant) return;
      setErreur(error ? "La liste des dossiers n'a pas pu être chargée." : "");
      setClients((data as ClientPortail[]) ?? []);
      setChargement(false);
    }, recherche ? 250 : 0);
    return () => { vivant = false; clearTimeout(t); };
  }, [recherche]);

  async function ouvrir(c: ClientPortail) {
    // En recherche pour une demande d'accès : cliquer un dossier le relie, sans l'ouvrir.
    if (demandeActive) {
      await relier(demandeActive, c.id, c.nom);
      return;
    }
    if (ouverture) return;
    setOuverture(c.id);
    const { error } = await supabase.rpc("portail_voir_client", { p_producteur_id: c.id });
    if (error) {
      setErreur("Ce dossier n'a pas pu être ouvert. Réessayez.");
      setOuverture(null);
      return;
    }
    // Rechargement complet : toutes les requêtes du tableau de bord repartent
    // sur le dossier choisi, carte comprise.
    window.location.reload();
  }

  const liste = (
    <>
      {annonce && (
        <p className="mb-4 rounded-xl border border-cfrq-green/30 bg-cfrq-tint px-4 py-3 text-[14.5px] leading-relaxed text-cfrq-deep" role="status">
          ✓ {annonce}
        </p>
      )}
      <DemandesAccesVue demandes={demandes} occupe={occupe} onRelier={relier} onChercher={chercher} onRefuser={refuser} />
      {demandeActive && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#fff6dc] px-4 py-3 text-[14px] text-[#6b4e00]">
          <span>Choisissez ci-dessous le dossier à relier au compte de <strong>{demandeActive.nom}</strong> ({demandeActive.courriel}).</span>
          <button onClick={() => setDemandeActive(null)} className="font-medium underline-offset-2 hover:underline">Annuler</button>
        </div>
      )}
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cfrq-ink/40">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        </span>
        <input
          ref={champRef}
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Nom, numéro de producteur ou municipalité"
          aria-label="Rechercher un dossier client"
          className="h-[52px] w-full rounded-[12px] border border-black/15 bg-white pl-12 pr-4 text-[16px] outline-none transition-shadow focus:border-cfrq-green focus:shadow-[0_0_0_3px_rgba(90,189,42,.18)]"
        />
      </div>

      {erreur && <p className="mt-3 text-[14px] text-red-600" role="alert">{erreur}</p>}

      <div className="mt-4 overflow-hidden rounded-2xl border border-black/5 bg-white">
        {chargement ? (
          <p className="px-5 py-8 text-center text-[15px] text-cfrq-ink/55">Chargement des dossiers…</p>
        ) : clients.length === 0 ? (
          <p className="px-5 py-8 text-center text-[15px] text-cfrq-ink/55">
            {recherche ? "Aucun dossier ne correspond à votre recherche." : "Aucun dossier accessible."}
          </p>
        ) : (
          <ul className="divide-y divide-black/5">
            {clients.map((c) => {
              const actuel = c.id === clientActuel;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => ouvrir(c)}
                    disabled={!!ouverture}
                    className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition-colors hover:bg-cfrq-tint/60 disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-cfrq-deep">{c.nom ?? "Dossier " + c.id}</span>
                        {actuel && (
                          <span className="rounded-full bg-cfrq-green/20 px-2.5 py-0.5 text-[12px] font-medium text-cfrq-leaf">Dossier ouvert</span>
                        )}
                        {c.a_compte && (
                          <span className="rounded-full bg-cfrq-tint px-2.5 py-0.5 text-[12px] font-medium text-cfrq-leaf">Compte actif</span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[13.5px] text-cfrq-ink/55">
                        {[
                          c.no_prod,
                          c.municipalite,
                          c.a_carte ? "carte" : null,
                          c.nb_documents > 0 ? `${nfEnt.format(c.nb_documents)} document${c.nb_documents > 1 ? "s" : ""}` : null,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span aria-hidden className="shrink-0 text-cfrq-leaf">
                      {ouverture === c.id ? "…" : "→"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {clients.length === 40 && (
        <p className="mt-3 text-[13px] text-cfrq-ink/50">40 premiers dossiers affichés. Précisez votre recherche pour trouver les autres.</p>
      )}
      <p className="mt-3 text-[13px] text-cfrq-ink/50">
        Chaque ouverture de dossier est journalisée. La vue se referme d'elle-même après 12 h.
      </p>
    </>
  );

  if (enModal) {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 px-5 py-10"
        role="dialog"
        aria-modal="true"
        aria-label="Choisir un dossier client"
        onClick={onFermer}
      >
        <div
          className="w-full max-w-[640px] rounded-2xl bg-cfrq-cream p-6 shadow-[0_30px_70px_rgba(0,0,0,.35)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-[22px] font-medium text-cfrq-deep">Changer de dossier</h2>
              <p className="mt-1 text-[14px] text-cfrq-ink/60">Vous verrez l'espace du client tel qu'il le voit.</p>
            </div>
            <button
              onClick={onFermer}
              aria-label="Fermer"
              className="shrink-0 rounded-full border border-black/15 px-3 py-1.5 text-[13px] text-cfrq-leaf transition-colors hover:bg-cfrq-tint"
            >
              Fermer
            </button>
          </div>
          {liste}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cfrq-cream">
      <header className="border-b border-black/[.07] bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-[11px]">
          <div className="flex items-center gap-3">
            <span className="font-display text-xl text-cfrq-deep">
              CFR<span style={{ color: "#5abd2a" }}>Q</span>
            </span>
            <span className="border-l border-black/10 pl-3 text-[14px] text-cfrq-ink/60">Vue employé</span>
          </div>
          {onDeconnexion && (
            <button
              onClick={onDeconnexion}
              className="rounded-full border border-black/15 px-3.5 py-2 text-[13px] text-cfrq-leaf transition-colors hover:bg-cfrq-tint"
            >
              Déconnexion
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="font-display text-[clamp(24px,6vw,30px)] font-medium text-cfrq-deep">Quel dossier voulez-vous voir ?</h1>
        <p className="mt-1.5 text-[15.5px] leading-relaxed text-cfrq-ink/65">
          Ouvrez l'espace d'un client pour voir sa page exactement comme lui : ses cartes, ses documents, ses travaux.
          Pratique pour le guider au téléphone.{courriel ? ` Connecté comme ${courriel}.` : ""}
        </p>
        <div className="mt-6">{liste}</div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barre de rappel, fixée en bas : le haut de la page reste identique  */
/* à ce que voit le client.                                            */
/* ------------------------------------------------------------------ */

export function BarreEmploye({
  vue,
  client,
  onChanger,
  onQuitter,
}: {
  vue: boolean;
  client: { nom: string | null; no_prod: string | null } | null;
  onChanger: () => void;
  onQuitter: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-cfrq-green/30 bg-cfrq-deep/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-2.5">
        <p className="min-w-0 text-[14px] text-cfrq-cream">
          <span className="mr-2 inline-block rounded-full bg-cfrq-green px-2.5 py-0.5 text-[12px] font-semibold text-[#123005]">
            {vue ? "Vue employé" : "Employé CFRQ"}
          </span>
          {vue ? (
            <>
              Vous voyez l'espace de{" "}
              <strong className="font-semibold">{client?.nom ?? "ce client"}</strong>
              {client?.no_prod ? <span className="text-cfrq-cream/60"> ({client.no_prod})</span> : null}
            </>
          ) : (
            "Vous voyez votre propre espace."
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={onChanger}
            className={
              vue
                ? "rounded-full border border-cfrq-cream/30 px-3.5 py-1.5 text-[13px] font-medium text-cfrq-cream transition-colors hover:bg-white/10"
                : "rounded-full bg-cfrq-green px-3.5 py-1.5 text-[13px] font-semibold text-[#123005] transition-colors hover:bg-cfrq-green-hover"
            }
          >
            {vue ? "Changer de client" : "Voir l'espace d'un client"}
          </button>
          {vue && (
            <button
              onClick={onQuitter}
              className="rounded-full bg-cfrq-green px-3.5 py-1.5 text-[13px] font-semibold text-[#123005] transition-colors hover:bg-cfrq-green-hover"
            >
              Quitter la vue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
