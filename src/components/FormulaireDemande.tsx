// Formulaire de demande envoyé à CFRQ (F2/F6 « Ajouter une terre »,
// F3 « Voir une terre convoitée », F4 « Inviter un tiers »). Réutilise l'Edge
// Function publique capter-lead (branche générique -> capter_prospect_web ->
// planilogix.leads_web), avec honeypot et repli mailto. Aucun changement DB.
import { useEffect, useState } from "react";
import { site } from "../data/site";

const LEADS_ENDPOINT =
  import.meta.env.PUBLIC_LEADS_ENDPOINT ||
  "https://bpxzznykbikbqbvraqxj.supabase.co/functions/v1/capter-lead";

export type Champ = {
  nom: string;
  label: string;
  type?: "text" | "email" | "tel" | "textarea" | "select";
  options?: string[];
  requis?: boolean;
  placeholder?: string;
};

export type ConfigDemande = {
  source: string;       // slug ≤60, ex. "espace-ajouter-terre"
  titre: string;
  intro: string;
  champs: Champ[];
  submitLabel: string;
  merci: string;        // message de confirmation
};

type Props = {
  config: ConfigDemande;
  courriel?: string | null;   // courriel du client connecté (préremplissage)
  identite?: Record<string, any>; // Producteur / No prod / producteur_id -> details
  onClose: () => void;
};

export default function FormulaireDemande({ config, courriel, identite, onClose }: Props) {
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [website, setWebsite] = useState(""); // honeypot
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (nom: string, v: string) => setValeurs((s) => ({ ...s, [nom]: v }));

  // details = un objet {libellé -> valeur} : le courriel de notification à CFRQ
  // liste automatiquement ces paires, donc les libellés doivent être lisibles.
  function construireDetails() {
    const d: Record<string, any> = { ...(identite ?? {}) };
    for (const c of config.champs) {
      if (c.nom === "courriel" || c.nom === "nom" || c.nom === "telephone" || c.nom === "municipalite" || c.nom === "message") continue;
      const v = valeurs[c.nom];
      if (v) d[c.label] = v;
    }
    return d;
  }

  function fallbackMailto() {
    const lignes = config.champs.map((c) => `${c.label} : ${valeurs[c.nom] ?? ""}`);
    if (identite) for (const [k, v] of Object.entries(identite)) lignes.push(`${k} : ${v}`);
    window.location.href = `mailto:${site.courriel}?subject=${encodeURIComponent(config.titre)}&body=${encodeURIComponent(lignes.join("\n"))}`;
  }

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (envoi) return;
    const courrielVal = valeurs.courriel || courriel || "";
    if (!courrielVal) return;
    setEnvoi(true);
    try {
      const res = await fetch(LEADS_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: config.source,
          courriel: courrielVal,
          nom: valeurs.nom || identite?.["Producteur"] || undefined,
          telephone: valeurs.telephone || undefined,
          municipalite: valeurs.municipalite || undefined,
          message: valeurs.message || undefined,
          details: construireDetails(),
          website,
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
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={config.titre}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-black/5 px-5 py-4">
          <h3 className="text-[16px] font-semibold text-cfrq-deep">{config.titre}</h3>
          <button onClick={onClose} aria-label="Fermer" className="shrink-0 rounded-full bg-black/5 px-2.5 py-1 text-sm hover:bg-black/10">✕</button>
        </div>

        {envoye ? (
          <div className="px-5 py-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-cfrq-green/15 text-2xl">✓</div>
            <p className="text-[15px] leading-relaxed text-cfrq-deep">{config.merci}</p>
            <button onClick={onClose} className="mt-5 rounded-lg bg-cfrq-green px-5 py-2.5 text-[14px] font-medium text-[#123005] hover:bg-cfrq-green-hover">Fermer</button>
          </div>
        ) : (
          <form onSubmit={soumettre} className="flex flex-col gap-3 px-5 py-4">
            <p className="text-[14px] leading-relaxed text-cfrq-ink/75">{config.intro}</p>
            {/* Honeypot */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden value={website}
              onChange={(e) => setWebsite(e.target.value)} className="absolute" style={{ position: "absolute", left: "-9999px" }} />

            {config.champs.map((c) => (
              <label key={c.nom} className="flex flex-col gap-1 text-[13.5px] font-medium text-cfrq-deep">
                {c.label}{c.requis && <span className="text-cfrq-leaf"> *</span>}
                {c.type === "textarea" ? (
                  <textarea required={c.requis} value={valeurs[c.nom] ?? ""} onChange={(e) => set(c.nom, e.target.value)}
                    placeholder={c.placeholder} rows={3}
                    className="rounded-lg border border-black/15 bg-white px-3 py-2 text-[15px] font-normal outline-none focus:border-cfrq-green" />
                ) : c.type === "select" ? (
                  <select required={c.requis} value={valeurs[c.nom] ?? ""} onChange={(e) => set(c.nom, e.target.value)}
                    className="rounded-lg border border-black/15 bg-white px-3 py-2 text-[15px] font-normal outline-none focus:border-cfrq-green">
                    <option value="">Choisir…</option>
                    {c.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={c.type ?? "text"} required={c.requis}
                    value={valeurs[c.nom] ?? (c.nom === "courriel" && courriel ? courriel : "")}
                    onChange={(e) => set(c.nom, e.target.value)} placeholder={c.placeholder}
                    className="rounded-lg border border-black/15 bg-white px-3 py-2 text-[15px] font-normal outline-none focus:border-cfrq-green" />
                )}
              </label>
            ))}

            <button type="submit" disabled={envoi}
              className="mt-1 rounded-lg bg-cfrq-green px-5 py-2.5 text-[14.5px] font-medium text-[#123005] transition-colors hover:bg-cfrq-green-hover disabled:opacity-60">
              {envoi ? "Envoi…" : config.submitLabel}
            </button>
            <p className="text-[12px] leading-snug text-black/50">
              Votre demande est transmise à l'équipe CFRQ, qui fera le suivi avec vous. Aucune donnée n'est publiée.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

// Configurations des trois demandes du focus group (F2/F6, F3, F4).
export const DEMANDES: Record<string, ConfigDemande> = {
  ajouterTerre: {
    source: "espace-ajouter-terre",
    titre: "Ajouter une terre à mon dossier",
    intro: "Vous détenez une terre qui n'apparaît pas dans votre espace ? Donnez-nous ses coordonnées cadastrales et nous l'ajouterons à votre dossier.",
    submitLabel: "Envoyer la demande",
    merci: "Demande reçue. Nous ajouterons cette terre à votre dossier et vous reviendrons rapidement.",
    champs: [
      { nom: "no_lot", label: "Numéro de lot", requis: true, placeholder: "ex. 5 123 456" },
      { nom: "municipalite", label: "Municipalité", placeholder: "où se situe la terre" },
      { nom: "matricule", label: "Matricule (si connu)", placeholder: "numéro au rôle d'évaluation" },
      { nom: "message", label: "Précisions", type: "textarea", placeholder: "toute information utile" },
    ],
  },
  terreConvoitee: {
    source: "espace-terre-convoitee",
    titre: "Portrait d'une terre convoitée",
    intro: "Vous songez à acheter (ou à vendre) une terre ? Donnez-nous son numéro de lot et notre équipe préparera un portrait forestier pour vous aider à décider.",
    submitLabel: "Demander le portrait",
    merci: "Demande reçue. Nous préparons le portrait de cette terre et vous recontactons.",
    champs: [
      { nom: "no_lot", label: "Numéro de lot convoité", requis: true, placeholder: "ex. 5 123 456" },
      { nom: "municipalite", label: "Municipalité", placeholder: "où se situe la terre" },
      { nom: "message", label: "Contexte", type: "textarea", placeholder: "achat, vente, négociation en cours…" },
    ],
  },
  inviterTiers: {
    source: "espace-inviter-tiers",
    titre: "Donner accès à un tiers",
    intro: "Vous souhaitez qu'un co-propriétaire ou votre institution financière puisse consulter le portrait de votre forêt ? Indiquez-nous qui et nous organiserons l'accès.",
    submitLabel: "Envoyer la demande",
    merci: "Demande reçue. Nous organiserons l'accès pour cette personne et vous confirmerons.",
    champs: [
      { nom: "nom_tiers", label: "Nom du tiers", requis: true, placeholder: "personne ou institution" },
      { nom: "courriel_tiers", label: "Courriel du tiers", type: "email", placeholder: "pour lui donner accès" },
      { nom: "relation", label: "Lien avec vous", type: "select", options: ["Co-propriétaire", "Conjoint(e)", "Institution financière / banque", "Notaire / comptable", "Autre"] },
      { nom: "message", label: "Précisions", type: "textarea", placeholder: "ce que le tiers doit pouvoir consulter" },
    ],
  },
};
