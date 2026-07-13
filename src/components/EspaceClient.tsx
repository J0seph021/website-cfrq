import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { withBase } from "../lib/url";
import { site } from "../data/site";
import CarteForet from "./CarteForet";
import CalculateurValeurBois from "./CalculateurValeurBois";
import FormulaireDemande, { DEMANDES, type ConfigDemande } from "./FormulaireDemande";

type Row = Record<string, any>;
export interface Dossier {
  producteur: Row | null;
  proprietes: Row[];
  lots: Row[];
  paf: Row[];
  travaux: Row[];
  documents: Row[];
  carte: Row | null;
  bilan: Row | null; // E5 : bilan des investissements (null si aucun travail récent)
}

const nf = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfEnt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });
const ha = (v: any) => (v == null ? "—" : nf.format(Number(v)) + " ha");
const cad = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

// Catalogue du produit "Portrait des forêts" (relevé patrimonial payant).
// Source: schéma portrait.releve_items du projet Supabase (complet 299$, volets 79$).
const PORTRAIT = {
  complet: { theme: "complet", titre: "Relevé complet", prix: 299, icone: "⭐", desc: "Les six volets réunis : le portrait intégral de votre forêt." },
  themes: [
    { theme: "bois", titre: "Valeur du bois", prix: 79, icone: "🌳" },
    { theme: "carbone", titre: "Carbone", prix: 79, icone: "🌍" },
    { theme: "acericulture", titre: "Potentiel acéricole", prix: 79, icone: "🍁" },
    { theme: "faune", titre: "Habitat faunique", prix: 79, icone: "🦌" },
    { theme: "biodiversite", titre: "Biodiversité", prix: 79, icone: "🌿" },
    { theme: "fiscalite", titre: "Leviers fiscaux", prix: 79, icone: "📋" },
  ],
};

// Liens de paiement Stripe (MODE TEST / bac à sable). Le token à usage unique du
// client est ajouté en client_reference_id pour que le webhook associe l'achat au
// bon dossier. Pour le lancement: recréer ces liens en LIVE et remplacer ces URLs.
const PAYMENT_LINKS: Record<string, string> = {
  complet:      "https://buy.stripe.com/test_dRm3cueyEe428pO3oifnO07",
  bois:         "https://buy.stripe.com/test_14A6oG0HO7FE21q2kefnO01",
  carbone:      "https://buy.stripe.com/test_28E3cu4Y46BAbC01gafnO02",
  acericulture: "https://buy.stripe.com/test_aFa9ASfCI0dc49ybUOfnO03",
  faune:        "https://buy.stripe.com/test_5kQeVc76c6BA8pOcYSfnO04",
  biodiversite: "https://buy.stripe.com/test_6oUfZg76cf86gWke2WfnO05",
  fiscalite:    "https://buy.stripe.com/test_4gMcN41LSaRQ9tS6AufnO06",
};

// Offre du relevé pour le client connecté (statut acheté par thème).
export type OffreItem = { theme: string; titre: string; prix_cents: number; achete: boolean; pdf?: boolean };
export type Offre = { nom?: string; statut?: string; items: OffreItem[] } | null;

/* ------------------------------------------------------------------ */
/* Hooks d'animation, tous neutralises sous prefers-reduced-motion.    */
/* ------------------------------------------------------------------ */

function useReducedMotion(): boolean {
  const [reduit, setReduit] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduit(mq.matches);
    const onChange = () => setReduit(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduit;
}

// Compteur qui monte de 0 a la valeur quand il entre dans le viewport.
// La valeur finale est affichee PAR DEFAUT (toujours dans le DOM): l'animation
// ne fait que la rejouer si elle peut tourner. Filet de securite garanti.
function CountUp({
  value, decimals = 0, duration = 1200, className,
}: { value: number; decimals?: number; duration?: number; className?: string }) {
  const reduit = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const demarre = useRef(false);
  const [affiche, setAffiche] = useState(value);
  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-CA", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);

  useEffect(() => {
    if (reduit) { setAffiche(value); return; }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setAffiche(value); return; }
    let raf = 0;
    let secours: ReturnType<typeof setTimeout>;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !demarre.current) {
        demarre.current = true;
        io.disconnect();
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, Math.max(0, (t - t0) / duration));
          setAffiche(value * (1 - Math.pow(1 - p, 3))); // easeOutCubic
          if (p < 1) raf = requestAnimationFrame(tick);
          else setAffiche(value);
        };
        setAffiche(0);
        raf = requestAnimationFrame(tick);
        secours = setTimeout(() => setAffiche(value), duration + 300); // valeur finale garantie meme si rAF est gele
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); clearTimeout(secours); };
  }, [value, reduit, duration]);

  return <span ref={ref} className={className}>{fmt(affiche)}</span>;
}

// Apparition feutree au scroll. Contenu present d'emblee si mouvement reduit.
function Reveal({
  children, className = "", delay = 0,
}: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduit = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [vu, setVu] = useState(false);
  useEffect(() => {
    if (reduit) { setVu(true); return; }
    const el = ref.current;
    if (!el) { setVu(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) { setVu(true); io.disconnect(); }
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [reduit]);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: vu ? `${delay}ms` : "0ms" }}
      // Apparition par OPACITÉ SEULEMENT. Aucun utilitaire translate ici, dans aucun
      // état : Tailwind v4 émet la propriété CSS `translate`, et toute valeur non-none
      // (même l'identité 0px) fait de cet ancêtre le référentiel des descendants
      // position:fixed — le plein écran de la carte s'ancrait sur la section au lieu
      // du viewport. L'opacité n'a pas cet effet.
      className={`transition-opacity duration-700 ease-out ${vu ? "opacity-100" : "opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Derivations: tout vient des donnees reelles (geojson de la carte).  */
/* ------------------------------------------------------------------ */

const props = (carte: Row | null, couche: string): Row[] =>
  (carte?.geojson?.features ?? [])
    .filter((f: any) => f.properties?.couche === couche)
    .map((f: any) => f.properties as Row);

// Le champ "essences" est une liste de NOMS COMPLETS separes par " / "
// (ex. "Épinette blanche / Sapin baumier"). On decoupe UNIQUEMENT sur "/", puis
// on exclut les regroupements (Feuillus tolerants, Bouleaux...) et les non-arbres
// (Herbacees, Framboisier...) pour ne compter que de vraies essences d'arbres.
const NON_ESPECE = /aulne|feuillus|éricac|ericac|herbac|herbe|framboisier|noisetier|arbuste|non[-\s]?commerc|sapin et épinette|inconnu|dénud|denud|coupe|régénér|regener|eau\b|chemin|gravier|sol\b|friche/i;
const GROUPE_PLURIEL = new Set([
  "bouleaux", "épinettes", "epinettes", "érables", "erables", "peupliers", "pins",
  "sapins", "mélèzes", "melezes", "cerisiers", "chênes", "chenes", "frênes", "frenes",
  "ormes", "tilleuls", "aulnes", "feuillus", "résineux", "resineux",
]);

// Liste triee des vraies essences d'arbres recensees au dossier.
function essencesArbres(peuplements: Row[]): string[] {
  const s = new Set<string>();
  for (const p of peuplements) {
    for (const raw of String(p.essences ?? "").split("/")) {
      const sp = raw.trim();
      if (sp.length < 2) continue;
      const low = sp.toLowerCase();
      if (NON_ESPECE.test(low) || GROUPE_PLURIEL.has(low)) continue;
      s.add(sp);
    }
  }
  return [...s].sort((a, b) => a.localeCompare(b, "fr"));
}

// Appellations non forestières / perturbations à exclure des « peuplements les plus présents ».
const NON_APPELLATION = /anthropique|dénud|denud|coupe totale|gravièr|gravier|chemin|\beau\b|friche|inondé|inonde|résidentiel|residentiel|agricole/i;
function appellations(peuplements: Row[]): { nb: number; top: string[] } {
  const compte = new Map<string, number>();
  for (const p of peuplements) {
    const a = String(p.appellation ?? "").trim();
    if (!a || NON_APPELLATION.test(a)) continue;
    compte.set(a, (compte.get(a) ?? 0) + 1);
  }
  const top = [...compte.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([n]) => n);
  return { nb: compte.size, top };
}

// La table travaux n'est pas alimentee: les travaux reels vivent dans le geojson, dedupliques.
function travauxDepuisCarte(carte: Row | null): Row[] {
  const feats = props(carte, "travaux");
  const vus = new Set<string>();
  const out: Row[] = [];
  for (const p of feats) {
    const cle = [p.traitement, p.annee, p.no_prescription, p.hectares].join("|");
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push(p);
  }
  return out;
}

function prescriptionsDepuisCarte(carte: Row | null): Row[] {
  const feats = props(carte, "prescription");
  const vus = new Set<string>();
  const out: Row[] = [];
  for (const p of feats) {
    const cle = String(p.no_prescription ?? Math.random());
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push(p);
  }
  return out;
}

// Le champ priorite peut etre numerique ou textuel: comptage defensif sur le 1er caractere.
const estPrioriteHaute = (p: Row) => ["1", "2"].includes(String(p.priorite ?? "").trim().charAt(0));

const aStatut = (s: any) =>
  String(s ?? "").trim().toLowerCase();

function estProducteurReconnu(prod: Row | null): boolean {
  const s = aStatut(prod?.statut);
  return s.includes("prtf") || s.includes("reconn") || s.includes("oui");
}

// Nom lisible pour la salutation: retire le suffixe légal (INC, ENR, LTÉE…),
// met en casse de titre, mais préserve les sigles courts (ex. « AA »).
// Les noms sources sont en majuscules (« GOFOREST INC », « VOYER JACQUES »).
function nomAffiche(nom: string): string {
  const sansSuffixe = nom.replace(/\s*\b(inc|enr|ltée|ltee|senc|s\.e\.n\.c\.)\b\.?$/i, "").trim() || nom;
  return sansSuffixe
    .split(/\s+/)
    .map((mot) => (mot.length <= 2 ? mot.toUpperCase() : mot.charAt(0).toUpperCase() + mot.slice(1).toLowerCase()))
    .join(" ");
}

// Année d'un document : date_document est déjà un millésime (« 2018 ») ; repli sur le nom.
function anneeDoc(doc: Row): string | null {
  const d = String(doc.date_document ?? "").match(/\b(19|20)\d{2}\b/)?.[0];
  return d ?? String(doc.nom_document ?? "").match(/\b(19|20)\d{2}\b/)?.[0] ?? null;
}
// Titre lisible : prescriptions et rapports sont nommés par un numéro cryptique en base.
function titreDoc(doc: Row): string {
  if (doc.type_document === "prescription") return "Prescription sylvicole";
  if (doc.type_document === "rapport") return "Rapport d'exécution";
  return String(doc.nom_document ?? "Document");
}

/* ------------------------------------------------------------------ */
/* Vue presentationnelle (testable avec des donnees factices).         */
/* ------------------------------------------------------------------ */

/* Fenêtre « Définir un mot de passe » : la session est déjà valide, donc on
   pose le mot de passe directement (updateUser), sans courriel de récupération. */
function DefinirMotDePasse({ onClose }: { onClose: () => void }) {
  const [mdp, setMdp] = useState("");
  const [mdp2, setMdp2] = useState("");
  const [etat, setEtat] = useState<"saisie" | "envoi" | "ok">("saisie");
  const [err, setErr] = useState("");

  async function enregistrer() {
    setErr("");
    if (mdp.length < 8) { setErr("Le mot de passe doit compter au moins 8 caractères."); return; }
    if (mdp !== mdp2) { setErr("Les deux mots de passe ne correspondent pas."); return; }
    setEtat("envoi");
    const { error } = await supabase.auth.updateUser({ password: mdp });
    if (error) {
      setErr(/different from the old/i.test(error.message) ? "Choisissez un mot de passe différent de l'actuel." : "Une erreur est survenue. Réessayez.");
      setEtat("saisie");
      return;
    }
    setEtat("ok");
  }

  const champ =
    "h-[46px] w-full rounded-[10px] border border-black/15 px-[14px] text-[15px] outline-none transition-shadow focus:border-cfrq-green focus:shadow-[0_0_0_3px_rgba(90,189,42,.18)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-[400px] rounded-2xl bg-white p-7 shadow-[0_30px_70px_rgba(0,0,0,.35)]" onClick={(e) => e.stopPropagation()}>
        {etat === "ok" ? (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-cfrq-green text-[22px] font-bold text-[#123005]">✓</div>
            <h2 className="font-display text-[22px] text-cfrq-deep">Mot de passe enregistré</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-cfrq-ink/70">Vous pouvez maintenant vous connecter avec votre courriel et ce mot de passe, en plus du lien magique.</p>
            <button onClick={onClose} className="mt-5 w-full rounded-[10px] bg-cfrq-green px-6 py-3 text-[15px] font-bold text-[#123005] transition-colors hover:bg-cfrq-green-hover">Terminé</button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); enregistrer(); }}>
            <h2 className="font-display text-[22px] text-cfrq-deep">Définir un mot de passe</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-cfrq-ink/65">Optionnel. Pour vous connecter aussi par mot de passe, sans attendre le lien par courriel.</p>
            <label htmlFor="mdp-nouv" className="mb-1.5 mt-4 block text-[13.5px] font-semibold text-cfrq-deep">Nouveau mot de passe</label>
            <input id="mdp-nouv" type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete="new-password" minLength={8} placeholder="••••••••" className={champ} />
            <label htmlFor="mdp-conf" className="mb-1.5 mt-3 block text-[13.5px] font-semibold text-cfrq-deep">Confirmer</label>
            <input id="mdp-conf" type="password" value={mdp2} onChange={(e) => setMdp2(e.target.value)} autoComplete="new-password" minLength={8} placeholder="••••••••" className={champ} />
            {err && <p className="mt-2.5 text-[13.5px] text-red-600">{err}</p>}
            <div className="mt-5 flex gap-2.5">
              <button type="button" onClick={onClose} className="flex-1 rounded-[10px] border border-black/15 px-4 py-3 text-[14px] text-cfrq-ink/70 transition-colors hover:bg-cfrq-tint">Annuler</button>
              <button type="submit" disabled={etat === "envoi"} className="flex-1 rounded-[10px] bg-cfrq-green px-4 py-3 text-[14px] font-bold text-[#123005] transition-colors hover:bg-cfrq-green-hover disabled:opacity-60">{etat === "envoi" ? "Enregistrement…" : "Enregistrer"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function DashboardView({ d, offre = null, onLogout, courriel = null }: { d: Dossier; offre?: Offre; onLogout?: () => void; courriel?: string | null }) {
  const nom = d.producteur?.nom ?? "Votre dossier";
  const [achatEnCours, setAchatEnCours] = useState<string | null>(null);
  const [pwdOuvert, setPwdOuvert] = useState(false);
  const [demande, setDemande] = useState<ConfigDemande | null>(null); // F2/F3/F4/F6

  // Statut d'achat par thème (vide tant qu'aucun relevé n'existe: tout est offert à l'achat).
  const acheteParTheme = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const it of offre?.items ?? []) m.set(it.theme, it.achete);
    return m;
  }, [offre]);
  const themesUnitaires = ["bois", "carbone", "acericulture", "faune", "biodiversite", "fiscalite"];
  const toutAchete = themesUnitaires.every((t) => acheteParTheme.get(t));

  // Retour "back" depuis Stripe (bfcache) ou reprise de focus: on relâche l'état
  // de chargement, sinon les boutons restent désactivés (« … » figé).
  useEffect(() => {
    const relacher = () => setAchatEnCours(null);
    window.addEventListener("pageshow", relacher);
    window.addEventListener("focus", relacher);
    return () => {
      window.removeEventListener("pageshow", relacher);
      window.removeEventListener("focus", relacher);
    };
  }, []);

  // Retour après paiement (?paye=1): remerciement + on descend à la section Portrait.
  const [paye, setPaye] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("paye") !== "1") return;
    setPaye(true);
    const aller = () => document.getElementById("portrait")?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Deux passes: la 2e recale après le chargement de la carte et des images.
    const t1 = setTimeout(aller, 400);
    const t2 = setTimeout(aller, 1200);
    window.history.replaceState({}, "", window.location.pathname + "#portrait");
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  const initiales = nom.split(/\s+/).map((m: string) => m[0]).join("").slice(0, 2).toUpperCase();
  const nomJoli = d.producteur ? nomAffiche(nom) : null;

  // Agregats reels
  const peuplements = useMemo(() => props(d.carte, "peuplement"), [d.carte]);
  const nbPeuplements = peuplements.length;
  const especes = useMemo(() => essencesArbres(peuplements), [peuplements]);
  const nbEssences = especes.length;
  const { nb: nbAppellations, top: topAppellations } = useMemo(() => appellations(peuplements), [peuplements]);
  const travauxCarte = useMemo(() => travauxDepuisCarte(d.carte), [d.carte]);
  const [travauxOuvert, setTravauxOuvert] = useState(false);
  const LIMITE_TRAVAUX = 5;
  const [docsOuvert, setDocsOuvert] = useState(false);
  const LIMITE_DOCS = 6;
  const travauxTries = useMemo(
    () => [...travauxCarte].sort((a, b) => String(b.annee ?? "").localeCompare(String(a.annee ?? ""))),
    [travauxCarte]
  );
  const pafDocs = useMemo(() => d.documents.filter((x) => x.type_document === "paf"), [d.documents]);
  const prescriptions = useMemo(() => prescriptionsDepuisCarte(d.carte), [d.carte]);
  const nbPrioHaute = useMemo(() => peuplements.filter(estPrioriteHaute).length, [peuplements]);
  const nbTraitementRec = useMemo(
    () => peuplements.filter((p) => String(p.traitements_rec ?? "").trim().length > 0).length,
    [peuplements]
  );

  const superficieTotale = d.proprietes.reduce((t, p) => t + (Number(p.superficie_totale) || 0), 0);
  const superficieBoisee = d.proprietes.reduce((t, p) => t + (Number(p.superficie_boisee) || 0), 0);
  const lotsParPropriete = (id: number) => d.lots.filter((l) => l.propriete_id === id).length;
  const aPaf = d.paf.length > 0 || d.documents.some((x) => x.type_document === "paf");
  const reconnu = estProducteurReconnu(d.producteur);

  // Salutation selon l'heure
  const salutation = new Date().getHours() < 18 ? "Bonjour" : "Bonsoir";

  // Heros: cascade biodiversite -> superficie boisee -> proprietes
  const heros = useMemo(() => {
    if (nbEssences >= 8) {
      return {
        valeur: nbEssences, decimals: 0, mot: nbEssences > 1 ? "essences d'arbres" : "essence d'arbre",
        avant: "Votre forêt abrite",
        sous: `Sur ${nf2.format(superficieTotale)} hectares, nos forestiers ont cartographié ${nfEnt.format(nbPeuplements)} peuplements. Une forêt diversifiée, c'est une forêt en santé, que vous protégez.`,
      };
    }
    if (superficieBoisee >= 1) {
      return {
        valeur: superficieBoisee, decimals: 2, mot: "hectares boisés",
        avant: "Sous votre intendance,",
        sous: "Un milieu naturel que vous protégez, lot par lot.",
      };
    }
    return {
      valeur: d.proprietes.length, decimals: 0, mot: d.proprietes.length > 1 ? "propriétés forestières" : "propriété forestière",
      avant: "Votre forêt, regroupée en",
      sous: "Votre dossier forestier, réuni au même endroit.",
    };
  }, [nbEssences, superficieBoisee, superficieTotale, nbPeuplements, nbAppellations, d.proprietes.length]);

  // Sous-bande de reperes (on masque ce qui vaut 0)
  const reperes = [
    { valeur: superficieTotale, decimals: 1, suffixe: " ha", label: "Superficie totale" },
    { valeur: d.proprietes.length, decimals: 0, suffixe: "", label: d.proprietes.length > 1 ? "Propriétés" : "Propriété" },
    { valeur: d.lots.length, decimals: 0, suffixe: "", label: "Lots boisés" },
    { valeur: nbPeuplements, decimals: 0, suffixe: "", label: "Peuplements cartographiés" },
  ].filter((r) => r.valeur > 0);

  // Parcours (jalons reels)
  const jalons = [
    { fait: nbPeuplements > 0, label: "Forêt cartographiée" },
    { fait: aPaf, label: "Plan d'aménagement au dossier" },
    { fait: travauxCarte.length > 0, label: travauxCarte.length > 0 ? `${travauxCarte.length} travaux réalisés` : "Travaux réalisés" },
    { fait: prescriptions.length > 0, label: prescriptions.length > 0 ? `${prescriptions.length} prescriptions au dossier` : "Prescriptions" },
  ];
  const faits = jalons.filter((j) => j.fait).length;
  const totalJalons = jalons.length + 1; // +1 pour la prochaine etape, jamais cochee
  const pourcentage = Math.round((faits / totalJalons) * 100);

  // Prochaine meilleure action (unique)
  const action = useMemo(() => {
    if (nbPrioHaute > 0) {
      return {
        titre: "La prochaine étape pour votre forêt",
        sous: `Vos forestiers ont repéré ${nfEnt.format(nbPrioHaute)} peuplements prioritaires (priorité 1 et 2) qui gagneraient à recevoir des travaux bénéfiques à leur santé. Votre ingénieur peut vous expliquer lesquels, simplement.`,
        cta: "En parler à mon ingénieur", href: withBase("/contact"),
      };
    }
    if (prescriptions.some((p) => p.statut === "rapport_soumis")) {
      return {
        titre: "Un rapport vous attend",
        sous: "Un rapport d'exécution a été déposé à votre dossier. Vous pouvez le consulter dans vos documents.",
        cta: "Voir mes documents", href: "#documents",
      };
    }
    if (!aPaf) {
      return {
        titre: "La prochaine étape pour votre forêt",
        sous: "Un plan d'aménagement, c'est la feuille de route de votre boisé, et la clé qui ouvre l'accès aux programmes d'aide. C'est le bon moment pour en parler.",
        cta: "Créer mon plan", href: withBase("/contact"),
      };
    }
    return {
      titre: "Faites le point sur votre forêt",
      sous: "Votre ingénieur peut faire avec vous un tour d'horizon de votre boisé et des prochaines étapes possibles.",
      cta: "Faire le point avec mon ingénieur", href: withBase("/contact"),
    };
  }, [nbPrioHaute, prescriptions, aPaf]);

  // Ouvre un document via une URL signee temporaire (RLS: ses propres fichiers seulement).
  async function ouvrirDoc(path?: string) {
    if (!path) return;
    const { data } = await supabase.storage.from("documents").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }
  // Pour un travail: ouvrir d'abord la PRESCRIPTION reliee, sinon le rapport d'execution.
  const docPourTravail = (no?: string) =>
    no
      ? d.documents.find((x) => x.reference === no && x.type_document === "prescription") ??
        d.documents.find((x) => x.reference === no && x.type_document === "rapport")
      : undefined;

  // Documents hors PAF, du plus récent au plus ancien : l'année, réclamée au focus group,
  // est la clé pour s'y retrouver parmi les prescriptions.
  const docsHorsPaf = useMemo(
    () =>
      d.documents
        .filter((x) => x.type_document !== "paf")
        .sort(
          (a, b) =>
            (anneeDoc(b) ?? "").localeCompare(anneeDoc(a) ?? "") ||
            String(a.reference ?? "").localeCompare(String(b.reference ?? ""))
        ),
    [d.documents]
  );

  // Commande du Portrait (interim: courriel pre-rempli; voir TODO Stripe pour l'achat en ligne).
  const lienCommande = `mailto:${site.courriel}?subject=${encodeURIComponent(
    "Commande - Portrait des forêts"
  )}&body=${encodeURIComponent(
    `Bonjour,\n\nJe souhaite commander mon Portrait des forêts.\n\nDossier : ${nom}${
      d.producteur?.no_prod ? " (" + d.producteur.no_prod + ")" : ""
    }\n\nMerci.`
  )}`;

  // Achat d'un volet (ou du complet): on demande au serveur un token à usage unique
  // rattaché au dossier du client connecté, puis on l'envoie au paiement Stripe.
  // Si la commande en ligne n'est pas encore branchée, on retombe sur le courriel.
  async function acheter(theme: string) {
    if (achatEnCours) return;
    setAchatEnCours(theme);
    try {
      const { data, error } = await supabase.rpc("portrait_token_client");
      const token = (data as any)?.token as string | undefined;
      const base = PAYMENT_LINKS[theme];
      if (error || !token || !base) throw error ?? new Error("commande indisponible");
      const url = base + (base.includes("?") ? "&" : "?") + "client_reference_id=" + encodeURIComponent(token);
      window.location.href = url;
    } catch {
      setAchatEnCours(null);
      window.location.href = lienCommande; // repli: courriel pré-rempli
    }
  }

  // Télécharge un relevé déjà payé, directement depuis la page. On demande au serveur
  // un token frais rattaché au dossier du client connecté (portrait_token_client, borné
  // par current_producteur_id()), puis on ouvre la fonction 'telecharger' qui renvoie une
  // URL signée temporaire du bucket privé. Plus besoin du lien reçu par courriel.
  async function telecharger(theme: string) {
    const { data } = await supabase.rpc("portrait_token_client");
    const token = (data as any)?.token as string | undefined;
    if (!token) return;
    const base = import.meta.env.PUBLIC_SUPABASE_URL || "https://sfzcslpbysabsiszcpqm.supabase.co";
    window.open(
      `${base}/functions/v1/telecharger?t=${encodeURIComponent(token)}&theme=${encodeURIComponent(theme)}`,
      "_blank",
      "noopener"
    );
  }

  // Sommaire: uniquement les sections réellement affichées (ancrage + retour post-paiement).
  const sommaire = [
    d.carte?.geojson ? { id: "foret", label: "Ma forêt" } : null,
    { id: "parcours", label: "Mon parcours" },
    d.proprietes.length > 0 ? { id: "proprietes", label: "Mes propriétés" } : null,
    { id: "plan", label: "Mon plan" },
    travauxTries.length > 0 ? { id: "travaux", label: "Mes travaux" } : null,
    { id: "documents", label: "Mes documents" },
    { id: "portrait", label: "Mon Portrait" },
  ].filter(Boolean) as { id: string; label: string }[];

  return (
    <div className="min-h-screen bg-cfrq-cream">
      {pwdOuvert && <DefinirMotDePasse onClose={() => setPwdOuvert(false)} />}
      <div className="sticky top-0 z-30">
        <header className="border-b border-black/[.07] bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-[11px]">
            <div className="flex items-center gap-3">
              <a href={withBase("/")} className="font-display text-xl text-cfrq-deep" aria-label="Accueil CFRQ">
                CFR<span style={{ color: "#5abd2a" }}>Q</span>
              </a>
              <span className="hidden border-l border-black/10 pl-3 text-[14px] text-cfrq-ink/60 sm:inline">Espace client</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cfrq-green text-[13px] font-semibold text-[#123005]">{initiales}</span>
              <button onClick={() => setPwdOuvert(true)} className="rounded-full border border-black/15 px-3.5 py-2 text-[13px] text-cfrq-leaf transition-colors hover:bg-cfrq-tint">
                Mot de passe
              </button>
              {onLogout && (
                <button onClick={onLogout} className="rounded-full border border-black/15 px-3.5 py-2 text-[13px] text-cfrq-leaf transition-colors hover:bg-cfrq-tint">
                  Déconnexion
                </button>
              )}
            </div>
          </div>
        </header>
        <nav aria-label="Sommaire" className="border-b border-black/10 bg-cfrq-cream/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 py-2">
            {sommaire.map((s) => (
              <a key={s.id} href={`#${s.id}`}
                className="whitespace-nowrap rounded-full px-3 py-1.5 text-[13.5px] font-medium text-cfrq-leaf transition-colors hover:bg-cfrq-tint">
                {s.label}
              </a>
            ))}
          </div>
        </nav>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-8">
        {/* Salutation */}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-[clamp(24px,6vw,30px)] font-medium text-cfrq-deep">{salutation}{nomJoli ? `, ${nomJoli}` : ""}</h1>
          {d.producteur?.no_prod && (
            <span className="rounded-full bg-cfrq-green/[.18] px-3 py-1 text-[13px] font-medium text-cfrq-leaf">{d.producteur.no_prod}</span>
          )}
          {reconnu && (
            <span className="rounded-full bg-cfrq-tint px-3 py-1 text-[13px] font-medium text-cfrq-leaf">Producteur forestier reconnu</span>
          )}
        </div>
        <p className="mt-1 text-[15px] text-cfrq-ink/55">Voici votre forêt, à jour.</p>

        {/* Poste de commande : heros patrimonial + prochaine etape + ingenieur */}
        <div className="mt-6 flex flex-wrap gap-[18px]">
          {/* Heros patrimonial (colonne large) */}
          <div className="relative flex-[2] basis-[400px] overflow-hidden rounded-3xl border border-cfrq-green/[.18] bg-gradient-to-br from-cfrq-tint to-white p-[clamp(22px,4vw,34px)]">
            <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute -right-6 -top-6 h-44 w-44 text-cfrq-green/10 md:h-52 md:w-52" fill="currentColor">
              <path d="M12 2C7 6 4 10 4 15a8 8 0 0 0 16 0c0-5-3-9-8-13Zm0 4c3 2.5 5 5.5 5 9a5 5 0 0 1-5 5V6Z" />
            </svg>
            <div className="relative">
              <div className="text-[15px] font-medium text-cfrq-leaf">{heros.avant}</div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <CountUp value={heros.valeur} decimals={heros.decimals} className="font-display text-[clamp(52px,11vw,72px)] font-medium leading-[.9] text-cfrq-deep" />
                <span className="font-display text-[clamp(22px,5vw,28px)] font-medium text-cfrq-deep">{heros.mot}</span>
              </div>
              <p className="mt-4 max-w-[460px] text-[17px] leading-relaxed text-cfrq-ink/[.68]">{heros.sous}</p>
              {reperes.length >= 2 && (
                <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {reperes.map((r) => (
                    <div key={r.label} className="rounded-[14px] bg-white/70 px-3.5 py-3">
                      <div className="text-[12.5px] text-cfrq-ink/55">{r.label}</div>
                      <div className="mt-1 font-display text-2xl font-medium text-cfrq-deep">
                        <CountUp value={r.valeur} decimals={r.decimals} />{r.suffixe}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Colonne droite : prochaine etape + ingenieur */}
          <div className="flex flex-1 basis-[280px] flex-col gap-[18px]">
            <section className="rounded-3xl border border-cfrq-green/[.28] bg-white p-6">
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-cfrq-leaf">Votre prochaine étape</p>
              <h2 className="mt-2 font-display text-[21px] font-medium leading-snug text-cfrq-deep">{action.titre}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-cfrq-ink/65">{action.sous}</p>
              <a href={action.href} className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-cfrq-green px-[18px] py-2.5 text-[14.5px] font-semibold text-[#123005] transition-colors hover:bg-cfrq-green-hover">
                {action.cta} <span aria-hidden>→</span>
              </a>
            </section>

            <div className="rounded-3xl border border-black/5 bg-white p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cfrq-tint text-cfrq-leaf" aria-hidden>
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" strokeLinecap="round" />
                  </svg>
                </span>
                <div>
                  <div className="font-display text-[16px] font-medium text-cfrq-deep">Votre ingénieur forestier</div>
                  <p className="text-[13px] text-cfrq-ink/60">Une question ? On vous répond.</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2.5">
                <a href={site.telHref} className="flex-1 rounded-[10px] bg-cfrq-tint px-3 py-2.5 text-center text-[14px] font-semibold text-cfrq-leaf transition-colors hover:bg-[#dcebcb]">Appeler</a>
                <a href={`mailto:${site.courriel}`} className="flex-1 rounded-[10px] border border-cfrq-green/40 px-3 py-2.5 text-center text-[14px] font-semibold text-cfrq-leaf transition-colors hover:bg-cfrq-tint">Écrire</a>
              </div>
            </div>
          </div>
        </div>

        {/* Narration biodiversite / sante */}
        {(nbEssences >= 4 || nbAppellations >= 4) && (
          <Reveal className="mt-8">
            <div className="rounded-2xl bg-cfrq-tint p-6 md:p-8">
              <p className="font-display text-xl leading-relaxed text-cfrq-ink md:text-2xl">
                {superficieBoisee >= 1 ? `Sur vos ${nf.format(superficieBoisee)} hectares boisés, ` : "Sur votre forêt, "}
                nos forestiers ont cartographié {nfEnt.format(nbPeuplements)} peuplements et recensé {nfEnt.format(nbEssences)} essences d'arbres différentes. C'est le signe d'une forêt diversifiée et résiliente, mieux armée face aux insectes, aux maladies et au climat.
              </p>
              {topAppellations.length >= 2 && (
                <p className="mt-3 text-[15px] text-cfrq-ink/65">
                  Vos peuplements les plus présents : {topAppellations.join(", ")}.
                </p>
              )}
              {especes.length >= 4 && (
                <details className="group mt-3">
                  <summary className="cursor-pointer list-none text-[14px] font-medium text-cfrq-leaf">
                    Voir les {nfEnt.format(especes.length)} essences recensées
                  </summary>
                  <p className="mt-2 text-[14px] leading-relaxed text-cfrq-ink/70">{especes.join(", ")}.</p>
                </details>
              )}
            </div>
          </Reveal>
        )}

        {/* Carte interactive */}
        {d.carte?.geojson && (
          <Reveal className="mt-10">
            <section id="foret" className="scroll-mt-28">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h2 className="font-display text-xl font-medium text-cfrq-deep">Votre forêt, lot par lot</h2>
                <span className="text-[13px] text-black/50">Touchez un peuplement pour voir le détail</span>
              </div>
              <div className="mt-4">
                <CarteForet data={d.carte.geojson} bbox={d.carte.bbox} documents={d.documents} />
              </div>
            </section>
          </Reveal>
        )}

        {/* Parcours forestier (jauge) */}
        <Reveal className="mt-10">
          <section id="parcours" className="scroll-mt-28 rounded-2xl border border-black/5 bg-white p-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="font-display text-xl font-medium text-cfrq-deep">Votre parcours forestier</h2>
              <span className="text-[14px] font-medium text-cfrq-leaf">
                {faits} étape{faits > 1 ? "s" : ""} sur {totalJalons} accomplie{faits > 1 ? "s" : ""}
              </span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-cfrq-tint">
              <ParcoursBar pourcentage={pourcentage} />
            </div>
            <ul className="mt-5 space-y-3">
              {jalons.map((j, i) => (
                <li key={i} className="flex items-center gap-3 text-[15px]">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${j.fait ? "bg-cfrq-green text-[#123005]" : "border-2 border-dashed border-black/25"}`} aria-hidden>
                    {j.fait ? "✓" : ""}
                  </span>
                  <span className={j.fait ? "text-cfrq-deep" : "text-black/50"}>{j.label}</span>
                </li>
              ))}
              <li className="flex items-center gap-3 text-[15px]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-cfrq-green/50" aria-hidden></span>
                <a href={action.href} className="font-medium text-cfrq-leaf underline-offset-2 hover:underline">
                  Prochaine étape : {action.cta.toLowerCase()} <span aria-hidden>→</span>
                </a>
              </li>
            </ul>
          </section>
        </Reveal>

        {/* Ce que votre foret demande (sante) */}
        {nbTraitementRec > 0 && (
          <Reveal className="mt-10">
            <section className="rounded-2xl bg-white p-6">
              <h2 className="font-display text-xl font-medium text-cfrq-deep">Ce que votre forêt demande</h2>
              <p className="mt-2 max-w-2xl text-[15.5px] leading-relaxed text-black/65">
                {nfEnt.format(nbTraitementRec)} peuplements pourraient profiter d'un traitement doux recommandé par votre ingénieur
                {nbPrioHaute > 0 ? `, dont ${nfEnt.format(nbPrioHaute)} en priorité` : ""}. Chaque intervention vise la santé et la diversité de votre boisé, jamais la coupe à blanc.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  ["Éclaircie", "On retire quelques arbres pour donner de l'espace et de la lumière aux plus beaux."],
                  ["Jardinage", "On prélève quelques tiges ici et là pour garder une forêt de tous les âges."],
                  ["Coupe d'assainissement", "On retire les arbres malades ou abîmés pour protéger le reste du peuplement."],
                ].map(([t, exp]) => (
                  <details key={t} className="group rounded-xl bg-cfrq-tint p-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-cfrq-deep">
                      {t} <span className="text-cfrq-leaf transition-transform group-open:rotate-45" aria-hidden>+</span>
                    </summary>
                    <p className="mt-2 text-[14px] leading-relaxed text-cfrq-ink/75">{exp}</p>
                  </details>
                ))}
              </div>
            </section>
          </Reveal>
        )}

        {/* Mes proprietes */}
        {d.proprietes.length > 0 && (
          <Reveal className="mt-10">
            <section id="proprietes" className="scroll-mt-28">
              <h2 className="font-display text-xl font-medium text-cfrq-deep">Vos propriétés</h2>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-black/5 bg-white">
                <table className="w-full min-w-[460px] text-left text-[15px]">
                  <thead className="bg-cfrq-tint/60 text-[13px] uppercase tracking-wide text-cfrq-leaf">
                    <tr>
                      <th className="px-4 py-3 font-medium">Propriété</th>
                      <th className="px-4 py-3 font-medium">Municipalité</th>
                      <th className="hidden px-4 py-3 font-medium sm:table-cell">MRC</th>
                      <th className="px-4 py-3 font-medium">Superficie</th>
                      <th className="px-4 py-3 font-medium">Lots</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.proprietes.map((p) => (
                      <tr key={p.id} className="border-t border-black/5">
                        <td className="px-4 py-3 font-medium text-cfrq-deep">{p.no_propriete ? "No " + p.no_propriete : "—"}</td>
                        <td className="px-4 py-3 text-black/70">{p.municipalite ?? "—"}</td>
                        <td className="hidden px-4 py-3 text-black/60 sm:table-cell">{p.mrc ?? "—"}</td>
                        <td className="px-4 py-3 text-black/70">{ha(p.superficie_totale)}</td>
                        <td className="px-4 py-3 text-black/70">{lotsParPropriete(p.id)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </Reveal>
        )}

        {/* Plan d'amenagement */}
        <Reveal className="mt-10">
          <section id="plan" className="scroll-mt-28">
            <h2 className="font-display text-xl font-medium text-cfrq-deep">Votre plan d'aménagement</h2>
            <div className="mt-4 rounded-2xl border border-cfrq-green/15 bg-gradient-to-br from-cfrq-tint to-white p-6 md:p-8">
              {d.paf.length > 0 ? (
                <div className="space-y-4">
                  {d.paf.map((pf) => (
                    <div key={pf.id} className="text-[15px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-full bg-cfrq-green/20 px-3 py-1 text-[13px] font-medium text-cfrq-leaf">{pf.statut_courant ?? "Actif"}</span>
                        <span className="text-black/55">{pf.date_plan ?? ""}{pf.date_echeance ? " au " + pf.date_echeance : ""}</span>
                      </div>
                      {pf.no_plan && <div className="mt-3 text-black/70">Plan {pf.no_plan}</div>}
                    </div>
                  ))}
                </div>
              ) : pafDocs.length > 0 ? (
                <div>
                  <div className="flex items-start gap-4">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cfrq-green/15 text-2xl" aria-hidden>📘</span>
                    <div>
                      <div className="font-display text-lg font-medium text-cfrq-deep">Plan d'aménagement forestier</div>
                      <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-black/60">
                        La feuille de route de votre boisé : objectifs, peuplements et travaux recommandés. {pafDocs.length} document{pafDocs.length > 1 ? "s" : ""} à votre dossier.
                      </p>
                    </div>
                  </div>
                  <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                    {pafDocs.map((doc) => {
                      const annee = anneeDoc(doc);
                      return (
                        <li key={doc.id}>
                          <button onClick={() => ouvrirDoc(doc.storage_path)} disabled={!doc.storage_path}
                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-black/5 bg-white px-4 py-3 text-left transition-colors hover:border-cfrq-green/40 disabled:cursor-default">
                            <span className="flex items-center gap-2 font-medium text-cfrq-deep">
                              <span aria-hidden>📄</span>
                              <span className={doc.storage_path ? "hover:underline" : ""}>{doc.nom_document}</span>
                            </span>
                            <span className="shrink-0 text-[13px] font-medium text-cfrq-leaf">{annee ?? "Ouvrir"}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="text-[15px] leading-relaxed text-black/60">
                  Aucun plan d'aménagement structuré à votre dossier pour le moment. C'est l'étape qui donne accès aux programmes d'aide.{" "}
                  <a href={withBase("/contact")} className="font-medium text-cfrq-leaf hover:underline">Nous en parler</a>.
                </p>
              )}
            </div>
          </section>
        </Reveal>

        {/* Travaux realises (plafonnes, cliquables vers la prescription) */}
        {travauxTries.length > 0 && (
          <Reveal className="mt-10">
            <section id="travaux" className="scroll-mt-28">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h2 className="font-display text-xl font-medium text-cfrq-deep">Vos travaux réalisés</h2>
                <span className="text-[13px] text-black/50">{travauxTries.length} au total</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(travauxOuvert ? travauxTries : travauxTries.slice(0, LIMITE_TRAVAUX)).map((t, i) => {
                  const doc = docPourTravail(t.no_prescription);
                  const cliquable = !!doc?.storage_path;
                  const libelle = doc?.type_document === "rapport" ? "Voir le rapport" : "Voir la prescription";
                  const annee = String(t.annee ?? "").match(/\d{4}/)?.[0];
                  const Conteneur: any = cliquable ? "button" : "div";
                  return (
                    <Conteneur key={i}
                      onClick={cliquable ? () => ouvrirDoc(doc!.storage_path) : undefined}
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl border border-black/5 bg-white p-4 text-left ${cliquable ? "transition-colors hover:border-cfrq-green/40" : ""}`}>
                      <div>
                        <div className="text-[15.5px] font-medium text-cfrq-deep">{t.traitement ?? "Travaux réalisés"}</div>
                        <div className="mt-0.5 text-[13.5px] text-black/55">
                          {[t.hectares != null ? nf.format(Number(t.hectares)) + " ha" : null, cliquable ? libelle : null].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {annee && <span className="shrink-0 rounded-full bg-cfrq-tint px-3 py-1 text-[13px] font-medium text-cfrq-leaf">{annee}</span>}
                    </Conteneur>
                  );
                })}
              </div>
              {travauxTries.length > LIMITE_TRAVAUX && (
                <button onClick={() => setTravauxOuvert((o) => !o)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-cfrq-green/30 px-4 py-2.5 text-[14px] font-medium text-cfrq-leaf transition-colors hover:bg-cfrq-tint">
                  {travauxOuvert ? "Voir moins" : `Voir les ${travauxTries.length - LIMITE_TRAVAUX} autres travaux`}
                  <span aria-hidden className={`transition-transform ${travauxOuvert ? "rotate-180" : ""}`}>⌄</span>
                </button>
              )}
            </section>
          </Reveal>
        )}

        {/* Documents */}
        <Reveal className="mt-10">
          <section id="documents" className="scroll-mt-28">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="font-display text-xl font-medium text-cfrq-deep">Vos documents</h2>
              {docsHorsPaf.length > 0 && <span className="text-[13px] text-black/50">{docsHorsPaf.length} au total</span>}
            </div>
            <p className="mt-1 text-[14.5px] text-black/55">Vos plans, prescriptions et rapports signés, conservés au même endroit : un boisé documenté, plus facile à entretenir et à transmettre.</p>
            <div className="mt-4 rounded-2xl border border-black/5 bg-white p-6">
              {docsHorsPaf.length > 0 ? (
                <ul className="divide-y divide-black/5">
                  {(docsOuvert ? docsHorsPaf : docsHorsPaf.slice(0, LIMITE_DOCS)).map((doc) => {
                    const annee = anneeDoc(doc);
                    return (
                      <li key={doc.id}>
                        <button onClick={() => ouvrirDoc(doc.storage_path)} disabled={!doc.storage_path}
                          className="flex w-full items-center justify-between gap-3 py-3 text-left text-[15px] disabled:cursor-default">
                          <span className="flex items-center gap-2">
                            {doc.storage_path && <span aria-hidden>📄</span>}
                            <span className="flex flex-col">
                              <span className={`font-medium text-cfrq-deep ${doc.storage_path ? "hover:underline" : ""}`}>{titreDoc(doc)}</span>
                              {doc.reference && <span className="text-[12.5px] text-black/45">nº {doc.reference}</span>}
                            </span>
                          </span>
                          {annee ? (
                            <span className="shrink-0 rounded-full bg-cfrq-tint px-3 py-1 text-[13px] font-medium text-cfrq-leaf">{annee}</span>
                          ) : (
                            <span className="shrink-0 text-[13px] text-black/50">{doc.taille ?? doc.date_document}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[15px] text-black/60">Vos plans et rapports apparaîtront ici.</p>
              )}
            </div>
            {docsHorsPaf.length > LIMITE_DOCS && (
              <button onClick={() => setDocsOuvert((o) => !o)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-cfrq-green/30 px-4 py-2.5 text-[14px] font-medium text-cfrq-leaf transition-colors hover:bg-cfrq-tint">
                {docsOuvert ? "Voir moins" : `Voir les ${docsHorsPaf.length - LIMITE_DOCS} autres documents`}
                <span aria-hidden className={`transition-transform ${docsOuvert ? "rotate-180" : ""}`}>⌄</span>
              </button>
            )}
          </section>
        </Reveal>

        {/* E5 : bilan des investissements de l'agence (rendre visible ce qui a été investi). */}
        {d.bilan && Number(d.bilan.total_valeur) > 0 && (
          <Reveal className="mt-10">
            <BilanInvestissements bilan={d.bilan} />
          </Reveal>
        )}

        {/* B3 : calculateur de valeur du bois — le CLIENT remplit ses hypothèses.
            Placé entre le bilan et les programmes : un net marginal/négatif enchaîne
            naturellement sur « Saviez-vous que » (les programmes font la différence). */}
        <Reveal className="mt-10">
          <CalculateurValeurBois peuplements={peuplements} syndicatGuid={d.producteur?.syndicat_guid ?? null} />
        </Reveal>

        {/* Leviers et programmes (en second temps) */}
        <Reveal className="mt-10">
          <section className="rounded-2xl bg-cfrq-tint p-6 md:p-8">
            <h2 className="font-display text-xl font-medium text-cfrq-deep">Saviez-vous que...</h2>
            <p className="mt-2 max-w-2xl text-[15.5px] leading-relaxed text-cfrq-ink/75">
              {reconnu
                ? "Comme producteur forestier reconnu, vous pouvez récupérer une large part de vos taxes foncières — jusqu'à 85 % — et faire financer une partie de vos travaux par des programmes qui se combinent."
                : "Un propriétaire forestier reconnu peut récupérer jusqu'à 85 % de ses taxes foncières et faire financer une partie de ses travaux d'aménagement."}{" "}
              La plupart des propriétaires ignorent ces mesures. La reconnaissance, les demandes de subvention et la paperasse, c'est nous qui nous en occupons — votre ingénieur valide votre admissibilité.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <details className="group rounded-xl bg-white/70 p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-cfrq-deep">
                  Le remboursement de taxes foncières <span className="text-cfrq-leaf transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-2 text-[14px] leading-relaxed text-cfrq-ink/75">Un propriétaire forestier reconnu peut récupérer une part de ses taxes foncières liées à ses dépenses d'aménagement admissibles. Votre ingénieur valide l'admissibilité et monte la demande.</p>
              </details>
              <details className="group rounded-xl bg-white/70 p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-cfrq-deep">
                  Les programmes d'aide aux travaux <span className="text-cfrq-leaf transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-2 text-[14px] leading-relaxed text-cfrq-ink/75">Plusieurs travaux (éclaircie, reboisement, voirie) peuvent être soutenus financièrement. Le bon programme dépend de votre boisé et de votre plan d'aménagement.</p>
              </details>
            </div>
            <p className="mt-3 text-[13px] text-cfrq-ink/55">Aucun montant affiché ici n'est tiré de votre dossier. Les sommes réelles dépendent de votre admissibilité et de vos dépenses.</p>
          </section>
        </Reveal>

        {/* Votre Portrait des forets (releve patrimonial payant) */}
        <Reveal className="mt-10">
          <section id="portrait" className="scroll-mt-28 overflow-hidden rounded-2xl border border-cfrq-green/20 bg-gradient-to-br from-cfrq-tint to-white p-6 md:p-8">
            {paye && (
              <div className="mb-5 rounded-xl border border-cfrq-green/40 bg-white/80 p-4 text-[15px] leading-relaxed text-cfrq-deep">
                <strong className="font-medium">Merci, votre paiement est reçu.</strong> Vos relevés payés sont marqués « Payé » ci-dessous. Une copie vous est aussi envoyée par courriel.
              </div>
            )}
            <div className="max-w-2xl">
              <h2 className="font-display text-xl font-medium text-cfrq-deep">Allez plus loin : votre Portrait des forêts</h2>
              <p className="mt-2 text-[15.5px] leading-relaxed text-black/65">
                Le relevé de patrimoine de votre boisé, préparé par vos ingénieurs à partir de l'inventaire écoforestier et de vos données : sa valeur en bois, le carbone qu'il stocke, son potentiel acéricole, sa qualité d'habitat, sa richesse écologique et vos leviers fiscaux. Des chiffres propres à votre forêt.
              </p>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {/* Le complet, mis en avant */}
              <div className="flex flex-col rounded-xl border-2 border-cfrq-green/40 bg-white p-5 lg:row-span-2">
                <span className="w-fit rounded-full bg-cfrq-green/15 px-2.5 py-0.5 text-[12px] font-medium text-cfrq-leaf">Le plus complet</span>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-2xl" aria-hidden>{PORTRAIT.complet.icone}</span>
                  <span className="font-display text-lg font-medium text-cfrq-deep">{PORTRAIT.complet.titre}</span>
                </div>
                <div className="mt-1 font-display text-3xl font-medium text-cfrq-deep">{cad(PORTRAIT.complet.prix)}</div>
                <p className="mt-2 text-[14px] leading-relaxed text-black/60">{PORTRAIT.complet.desc}</p>
                {acheteParTheme.get("complet") ? (
                  <button onClick={() => telecharger("complet")}
                    className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-cfrq-green px-5 py-3 text-[15px] font-medium text-[#123005] transition-colors hover:bg-cfrq-green-hover">
                    Télécharger le relevé complet
                  </button>
                ) : toutAchete ? (
                  <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg bg-cfrq-tint px-4 py-2.5 text-[14px] font-medium text-cfrq-leaf">✓ Déjà à votre dossier</span>
                ) : (
                  <button onClick={() => acheter("complet")} disabled={!!achatEnCours}
                    className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-cfrq-green px-5 py-3 text-[15px] font-medium text-[#123005] transition-colors hover:bg-cfrq-green-hover disabled:opacity-60">
                    {achatEnCours === "complet" ? "Redirection…" : "Commander le complet"}
                  </button>
                )}
              </div>
              {/* Volets à l'unité */}
              <ul className="grid gap-2 sm:grid-cols-2 lg:col-span-2">
                {PORTRAIT.themes.map((t) => {
                  const paye = acheteParTheme.get(t.theme);
                  return (
                    <li key={t.theme} className="flex items-center justify-between gap-2 rounded-xl border border-black/5 bg-white px-4 py-3">
                      <span className="flex items-center gap-2 font-medium text-cfrq-deep"><span aria-hidden>{t.icone}</span>{t.titre}</span>
                      {paye ? (
                        <button onClick={() => telecharger(t.theme)}
                          aria-label={`Télécharger le volet ${t.titre}`}
                          className="shrink-0 rounded-full bg-cfrq-green/15 px-3.5 py-1.5 text-[13px] font-medium text-cfrq-leaf transition-colors hover:bg-cfrq-tint">
                          Télécharger
                        </button>
                      ) : (
                        <button onClick={() => acheter(t.theme)} disabled={!!achatEnCours}
                          aria-label={`Commander le volet ${t.titre} pour ${cad(t.prix)}`}
                          className="shrink-0 rounded-lg border border-cfrq-green/40 px-3.5 py-2 text-[14px] font-medium text-cfrq-leaf transition-colors hover:bg-cfrq-tint disabled:opacity-60">
                          {achatEnCours === t.theme ? "…" : cad(t.prix)}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            <p className="mt-5 text-[13.5px] text-black/55">Livré en PDF, taxes incluses. Une question, ou vous préférez commander de vive voix ? Appelez-nous au {site.tel}.</p>
          </section>
        </Reveal>

        {/* Transmettre votre foret (succession) */}
        {(travauxCarte.length > 0 || d.documents.length > 0) && (
          <Reveal className="mt-10">
            <section className="rounded-2xl bg-cfrq-deep p-6 text-cfrq-cream md:p-8">
              <h2 className="font-display text-xl font-medium">Transmettre votre forêt</h2>
              <p className="mt-2 max-w-2xl text-[15.5px] leading-relaxed text-cfrq-cream/80">
                Un boisé en santé et bien documenté, c'est un héritage en règle pour la relève. Vos travaux et vos rapports forment déjà un dossier solide à transmettre. Quand vous serez prêt, nous pouvons vous aider à préparer cette transmission.
              </p>
              <a href={withBase("/contact")} className="mt-4 inline-block rounded-lg bg-cfrq-green px-5 py-3 text-[15px] font-medium text-[#123005] transition-colors hover:bg-cfrq-green-hover">En discuter</a>
            </section>
          </Reveal>
        )}

        {/* Demandes à CFRQ (F2/F6 ajouter une terre, F3 terre convoitée, F4 inviter un tiers) */}
        <Reveal className="mt-10">
          <section className="rounded-2xl border border-black/5 bg-white p-6 md:p-8">
            <h2 className="font-display text-xl font-medium text-cfrq-deep">Une demande à nous faire ?</h2>
            <p className="mt-2 max-w-2xl text-[15.5px] leading-relaxed text-cfrq-ink/75">
              Notre équipe s'occupe du reste. Choisissez ce dont vous avez besoin et nous ferons le suivi avec vous.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                { cfg: DEMANDES.ajouterTerre, icone: "➕", titre: "Ajouter une terre", desc: "Une terre absente de votre espace ? On l'ajoute à votre dossier." },
                { cfg: DEMANDES.terreConvoitee, icone: "🔍", titre: "Portrait d'une terre convoitée", desc: "Un lot que vous songez à acheter ? On en prépare le portrait." },
                { cfg: DEMANDES.inviterTiers, icone: "👥", titre: "Donner accès à un tiers", desc: "Co-propriétaire, banque… on organise l'accès." },
              ].map((b) => (
                <button key={b.cfg.source} onClick={() => setDemande(b.cfg)}
                  className="flex flex-col items-start rounded-xl border border-black/5 bg-cfrq-tint/50 p-4 text-left transition-colors hover:border-cfrq-green/40 hover:bg-cfrq-tint">
                  <span aria-hidden className="text-2xl">{b.icone}</span>
                  <span className="mt-2 font-medium text-cfrq-deep">{b.titre}</span>
                  <span className="mt-1 text-[13px] leading-snug text-cfrq-ink/65">{b.desc}</span>
                </button>
              ))}
            </div>
          </section>
        </Reveal>
      </div>

      {/* Modal de demande (F2/F3/F4/F6) */}
      {demande && (
        <FormulaireDemande
          config={demande}
          courriel={courriel}
          identite={{
            Producteur: d.producteur?.nom,
            "No prod": d.producteur?.no_prod,
            producteur_id: d.producteur?.id,
          }}
          onClose={() => setDemande(null)}
        />
      )}
    </div>
  );
}

// E5 : bilan des investissements — rend visible ce que la société a investi chez le
// producteur (les gens croient souvent que tout est gratuit). Chiffres tirés du
// dossier réel (suivi_travaux), poussés par scripts/export-bilans.mjs.
export function BilanInvestissements({ bilan }: { bilan: Row }) {
  const valeur = Number(bilan.total_valeur) || 0;
  const aide = Number(bilan.total_aide) || 0;
  const part = Number(bilan.total_part) || 0;
  const anMin = Number(bilan.annee_min), anMax = Number(bilan.annee_max);
  const nbAns = anMin && anMax ? anMax - anMin + 1 : null;
  const periode = nbAns && nbAns > 1 ? `depuis ${nbAns} ans` : anMax ? `en ${anMax}` : "récemment";
  const superficie = Number(bilan.superficie_ha) || 0;
  return (
    <section className="overflow-hidden rounded-2xl border border-cfrq-green/20 bg-gradient-to-br from-cfrq-green/10 to-white p-6 md:p-8">
      <p className="text-[12px] font-medium uppercase tracking-wide text-cfrq-leaf">Les investissements dans votre forêt</p>
      <h2 className="mt-1 font-display text-xl font-medium text-cfrq-deep">
        {periode.charAt(0).toUpperCase() + periode.slice(1)}, {cad(valeur)} de travaux ont été réalisés chez vous
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-cfrq-ink/75">
        Aménager une forêt a un coût — et une grande part est financée par les programmes que nous mobilisons pour vous.
        Voici ce qui a été investi{superficie > 0 ? ` sur ${nf.format(superficie)} ha de vos boisés` : ""}.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white/80 p-4 text-center shadow-sm">
          <div className="font-display text-2xl font-semibold text-cfrq-deep">{cad(valeur)}</div>
          <div className="mt-0.5 text-[13px] text-cfrq-ink/65">Valeur totale des travaux</div>
        </div>
        <div className="rounded-xl bg-white/80 p-4 text-center shadow-sm">
          <div className="font-display text-2xl font-semibold text-cfrq-green">{cad(aide)}</div>
          <div className="mt-0.5 text-[13px] text-cfrq-ink/65">Financé par les programmes d'aide</div>
        </div>
        <div className="rounded-xl bg-white/80 p-4 text-center shadow-sm">
          <div className="font-display text-2xl font-semibold text-cfrq-deep">{cad(part)}</div>
          <div className="mt-0.5 text-[13px] text-cfrq-ink/65">Votre contribution</div>
        </div>
      </div>
      <p className="mt-3 text-[13px] text-cfrq-ink/55">
        Montants tirés de votre dossier (travaux déclarés{anMin ? `, ${anMin}–${anMax}` : ""}). La part des programmes dépend
        des travaux et de votre admissibilité.
      </p>
    </section>
  );
}

// Barre de progression: remplit jusqu'a pourcentage (timer, robuste meme onglet cache).
function ParcoursBar({ pourcentage }: { pourcentage: number }) {
  const reduit = useReducedMotion();
  const [largeur, setLargeur] = useState(0);
  useEffect(() => {
    if (reduit) { setLargeur(pourcentage); return; }
    const t = setTimeout(() => setLargeur(pourcentage), 150);
    return () => clearTimeout(t);
  }, [pourcentage, reduit]);
  return <div className="h-full rounded-full bg-cfrq-green transition-[width] duration-1000 ease-out" style={{ width: `${largeur}%` }} />;
}

/* ------------------------------------------------------------------ */
/* Wrapper: authentification + chargement des donnees (inchange).      */
/* ------------------------------------------------------------------ */

export default function EspaceClient() {
  const [loading, setLoading] = useState(true);
  const [d, setD] = useState<Dossier | null>(null);
  const [offre, setOffre] = useState<Offre>(null);
  const [courriel, setCourriel] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.replace(withBase("/espace-client")); return; }
      setCourriel(session.user?.email ?? null);
      const [prod, proprietes, lots, paf, travaux, docs, carte, bilan, offreRes] = await Promise.all([
        supabase.from("producteurs").select("*").maybeSingle(),
        supabase.from("proprietes").select("*").order("no_propriete"),
        supabase.from("lots").select("*"),
        supabase.from("paf").select("*"),
        supabase.from("travaux").select("*"),
        supabase.from("documents").select("*"),
        supabase.from("cartes").select("geojson,bbox").maybeSingle(),
        // E5 : bilan des investissements. Table absente/aucune ligne -> bilan = null.
        supabase.from("bilan_investissement").select("*").maybeSingle(),
        // Offre du Portrait (statut d'achat). RPC absente -> erreur silencieuse, offre = null.
        supabase.rpc("portrait_offre_client"),
      ]);
      if (!alive) return;
      setD({
        producteur: prod.data ?? null,
        proprietes: proprietes.data ?? [],
        lots: lots.data ?? [],
        paf: paf.data ?? [],
        travaux: travaux.data ?? [],
        documents: docs.data ?? [],
        carte: carte.data ?? null,
        bilan: bilan.data ?? null,
      });
      setOffre((offreRes?.data as Offre) ?? null);
      setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) window.location.replace(withBase("/espace-client"));
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  // Après un retour de paiement, le webhook Stripe peut prendre un instant à
  // marquer l'achat: on rafraîchit l'offre quelques fois pour afficher « Payé ».
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("paye") !== "1") return;
    let n = 0;
    const id = setInterval(async () => {
      const { data } = await supabase.rpc("portrait_offre_client");
      if (data) setOffre(data as Offre);
      if (++n >= 3) clearInterval(id);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.replace(withBase("/espace-client"));
  }

  if (loading || !d) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cfrq-cream text-cfrq-deep">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-cfrq-green border-t-transparent"></div>
          <p className="text-[15px] text-black/60">Chargement de votre dossier…</p>
        </div>
      </div>
    );
  }

  return <DashboardView d={d} offre={offre} onLogout={logout} courriel={courriel} />;
}
