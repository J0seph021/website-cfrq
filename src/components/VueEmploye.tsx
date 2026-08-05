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

export type Moi = {
  employe: boolean;
  producteur_id: number | null;
  vue_employe: boolean;
  client: { id: number; nom: string | null; no_prod: string | null } | null;
};

const nfEnt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });

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
