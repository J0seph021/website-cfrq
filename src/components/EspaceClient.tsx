import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { withBase } from "../lib/url";
import { site } from "../data/site";
import CarteForet from "./CarteForet";

type Row = Record<string, any>;
export interface Dossier {
  producteur: Row | null;
  proprietes: Row[];
  lots: Row[];
  paf: Row[];
  travaux: Row[];
  documents: Row[];
  carte: Row | null;
}

const nf = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfEnt = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });
const ha = (v: any) => (v == null ? "—" : nf.format(Number(v)) + " ha");

// Facteur de stock de carbone (moyenne provinciale): ~188 tC/ha x 3,667 (CO2/C) ~ 690 t CO2eq/ha.
// Source: MRNF / RNCan (reservoirs forestiers du Quebec meridional). Estimation pedagogique, jamais une mesure du lot.
const FACTEUR_CO2_PAR_HA = 690;

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
          const p = Math.min(1, (t - t0) / duration);
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
      className={`transition-all duration-700 ease-out ${vu ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"} ${className}`}
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

function essencesDistinctes(peuplements: Row[]): number {
  const s = new Set<string>();
  for (const p of peuplements) {
    String(p.essences ?? "")
      .split(/[\s,;/]+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 1)
      .forEach((x) => s.add(x));
  }
  return s.size;
}

function appellations(peuplements: Row[]): { nb: number; top: string[] } {
  const compte = new Map<string, number>();
  for (const p of peuplements) {
    const a = String(p.appellation ?? "").trim();
    if (!a) continue;
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

/* ------------------------------------------------------------------ */
/* Vue presentationnelle (testable avec des donnees factices).         */
/* ------------------------------------------------------------------ */

export function DashboardView({ d, onLogout }: { d: Dossier; onLogout?: () => void }) {
  const nom = d.producteur?.nom ?? "Votre dossier";
  const initiales = nom.split(/\s+/).map((m: string) => m[0]).join("").slice(0, 2).toUpperCase();

  // Agregats reels
  const peuplements = useMemo(() => props(d.carte, "peuplement"), [d.carte]);
  const nbPeuplements = peuplements.length;
  const nbEssences = useMemo(() => essencesDistinctes(peuplements), [peuplements]);
  const { nb: nbAppellations, top: topAppellations } = useMemo(() => appellations(peuplements), [peuplements]);
  const travauxCarte = useMemo(() => travauxDepuisCarte(d.carte), [d.carte]);
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
        sous: `Sur ${nf2.format(superficieTotale)} hectares, nos forestiers ont cartographié ${nfEnt.format(nbPeuplements)} peuplements et recensé ${nfEnt.format(nbAppellations)} types distincts. Une forêt diversifiée, c'est une forêt en santé, que vous protégez.`,
      };
    }
    if (superficieBoisee > 0) {
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

  // Carbone (estimation honnete)
  const carbone = useMemo(() => {
    if (superficieBoisee <= 0) return null;
    const stock = Math.round((superficieBoisee * FACTEUR_CO2_PAR_HA) / 1000) * 1000;
    const seqMin = Math.round(superficieBoisee * 3);
    const seqMax = Math.round(superficieBoisee * 5);
    const voitures = Math.round(stock / 4.6 / 500) * 500;
    return { stock, seqMin, seqMax, voitures };
  }, [superficieBoisee]);

  // Ouvre un document via une URL signee temporaire (RLS: ses propres fichiers seulement).
  async function ouvrirDoc(path?: string) {
    if (!path) return;
    const { data } = await supabase.storage.from("documents").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }
  const docPourPrescription = (no?: string) =>
    no ? d.documents.find((x) => x.reference === no && (x.type_document === "rapport" || x.type_document === "prescription")) : undefined;

  // Travaux groupes par annee (frise)
  const travauxParAnnee = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const t of travauxCarte) {
      const a = String(t.annee ?? "").match(/\d{4}/)?.[0] ?? "Autres";
      if (!m.has(a)) m.set(a, []);
      m.get(a)!.push(t);
    }
    return [...m.entries()].sort((x, y) => y[0].localeCompare(x[0]));
  }, [travauxCarte]);

  const docsHorsPaf = d.documents.filter((x) => x.type_document !== "paf");

  return (
    <div className="min-h-screen bg-cfrq-cream">
      <header className="sticky top-0 z-30 bg-cfrq-deep text-cfrq-cream">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3">
            <a href={withBase("/")} className="font-display text-xl text-cfrq-cream" aria-label="Accueil CFRQ">
              CFR<span style={{ color: "#5abd2a" }}>Q</span>
            </a>
            <span className="hidden border-l border-white/20 pl-3 text-[14px] text-cfrq-cream/70 sm:inline">Espace client</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cfrq-green text-[13px] font-medium text-[#123005]">{initiales}</span>
            {onLogout && (
              <button onClick={onLogout} className="rounded-lg border border-white/25 px-3 py-2 text-[13px] text-cfrq-cream/90 transition-colors hover:bg-white/10">
                Déconnexion
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">
        {/* Salutation */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-medium text-cfrq-deep">{salutation}</h1>
          <span className="rounded-full bg-cfrq-green/20 px-3 py-1 text-[13px] font-medium text-cfrq-leaf">{nom}</span>
          {reconnu && (
            <span className="rounded-full bg-cfrq-tint px-3 py-1 text-[13px] font-medium text-cfrq-leaf">Producteur forestier reconnu</span>
          )}
        </div>
        <p className="mt-1 text-[15px] text-black/55">Voici votre forêt, à jour.</p>

        {/* Heros patrimonial */}
        <div className="relative mt-6 overflow-hidden rounded-3xl border border-cfrq-green/15 bg-gradient-to-br from-cfrq-tint to-white p-7 md:p-10">
          <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute -right-6 -top-6 h-44 w-44 text-cfrq-green/10 md:h-56 md:w-56" fill="currentColor">
            <path d="M12 2C7 6 4 10 4 15a8 8 0 0 0 16 0c0-5-3-9-8-13Zm0 4c3 2.5 5 5.5 5 9a5 5 0 0 1-5 5V6Z" />
          </svg>
          <div className="relative">
            <div className="text-[15px] font-medium text-cfrq-leaf">{heros.avant}</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <CountUp value={heros.valeur} decimals={heros.decimals} className="font-display text-6xl leading-none font-medium text-cfrq-deep md:text-7xl" />
              <span className="font-display text-2xl font-medium text-cfrq-deep md:text-3xl">{heros.mot}</span>
            </div>
            <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-cfrq-ink/70 md:text-[18px]">{heros.sous}</p>
          </div>
        </div>

        {/* Sous-bande de reperes */}
        {reperes.length >= 2 && (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {reperes.map((r) => (
              <div key={r.label} className="rounded-xl bg-white p-4">
                <div className="text-[13px] text-black/55">{r.label}</div>
                <div className="mt-1 font-display text-2xl font-medium text-cfrq-deep">
                  <CountUp value={r.valeur} decimals={r.decimals} />{r.suffixe}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Votre ingenieur de confiance */}
        <Reveal className="mt-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-cfrq-green/20 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-cfrq-tint text-cfrq-leaf" aria-hidden>
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" strokeLinecap="round" />
                </svg>
              </span>
              <div>
                <div className="font-display text-lg font-medium text-cfrq-deep">Votre ingénieur forestier</div>
                <p className="mt-0.5 max-w-md text-[15px] leading-relaxed text-black/60">
                  Une question sur votre boisé ? L'équipe des Conseillers forestiers de la région de Québec vous accompagne, sans jargon.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <a href={site.telHref} className="inline-flex items-center gap-2 rounded-lg bg-cfrq-green px-5 py-3 text-[15px] font-medium text-[#123005] transition-colors hover:bg-cfrq-green-hover">
                <span aria-hidden>📞</span> Appeler
              </a>
              <a href={`mailto:${site.courriel}`} className="inline-flex items-center gap-2 rounded-lg border border-cfrq-green/40 px-5 py-3 text-[15px] font-medium text-cfrq-leaf transition-colors hover:bg-cfrq-tint">
                <span aria-hidden>✉️</span> Écrire
              </a>
            </div>
          </div>
        </Reveal>

        {/* Narration biodiversite / sante */}
        {(nbEssences >= 4 || nbAppellations >= 4) && (
          <Reveal className="mt-8">
            <div className="rounded-2xl bg-cfrq-tint p-6 md:p-8">
              <p className="font-display text-xl leading-relaxed text-cfrq-ink md:text-2xl">
                {superficieBoisee > 0 ? `Sur vos ${nf.format(superficieBoisee)} hectares boisés, ` : "Sur votre forêt, "}
                nos forestiers ont recensé {nfEnt.format(nbAppellations)} types de peuplements et {nfEnt.format(nbEssences)} essences d'arbres différentes. C'est le signe d'une forêt diversifiée et résiliente, mieux armée face aux insectes, aux maladies et au climat.
              </p>
              {topAppellations.length >= 2 && (
                <p className="mt-3 text-[15px] text-cfrq-ink/65">
                  Vos peuplements les plus présents : {topAppellations.join(", ")}.
                </p>
              )}
            </div>
          </Reveal>
        )}

        {/* Carte interactive */}
        {d.carte?.geojson && (
          <Reveal className="mt-10">
            <section>
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
          <section className="rounded-2xl border border-black/5 bg-white p-6">
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
                <span className="font-medium text-cfrq-leaf">Prochaine étape : {action.cta.toLowerCase()}</span>
              </li>
            </ul>
          </section>
        </Reveal>

        {/* Prochaine meilleure action */}
        <Reveal className="mt-8">
          <section className="rounded-2xl border border-cfrq-green/25 bg-white p-6">
            <h2 className="font-display text-lg font-medium text-cfrq-deep">{action.titre}</h2>
            <p className="mt-2 max-w-2xl text-[15.5px] leading-relaxed text-black/65">{action.sous}</p>
            <a href={action.href} className="mt-4 inline-block rounded-lg bg-cfrq-green px-5 py-3 text-[15px] font-medium text-[#123005] transition-colors hover:bg-cfrq-green-hover">
              {action.cta}
            </a>
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
            <section>
              <h2 className="font-display text-xl font-medium text-cfrq-deep">Vos propriétés</h2>
              <div className="mt-4 overflow-hidden rounded-2xl border border-black/5 bg-white">
                <table className="w-full text-left text-[15px]">
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

        {/* Plan d'amenagement + Travaux (frise) */}
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <Reveal>
            <section>
              <h2 className="font-display text-xl font-medium text-cfrq-deep">Votre plan d'aménagement</h2>
              <div className="mt-4 rounded-2xl border border-black/5 bg-white p-6">
                {d.paf.length > 0 ? (
                  d.paf.map((pf) => (
                    <div key={pf.id} className="text-[15px]">
                      <div className="flex items-center justify-between">
                        <span className="rounded-full bg-cfrq-green/20 px-3 py-1 text-[13px] font-medium text-cfrq-leaf">{pf.statut_courant ?? "Actif"}</span>
                        <span className="text-black/55">{pf.date_plan ?? ""}{pf.date_echeance ? " → " + pf.date_echeance : ""}</span>
                      </div>
                      {pf.no_plan && <div className="mt-3 text-black/70">Plan {pf.no_plan}</div>}
                    </div>
                  ))
                ) : d.documents.some((x) => x.type_document === "paf") ? (
                  <ul className="divide-y divide-black/5">
                    {d.documents.filter((x) => x.type_document === "paf").map((doc) => (
                      <li key={doc.id}>
                        <button onClick={() => ouvrirDoc(doc.storage_path)} disabled={!doc.storage_path}
                          className="flex w-full items-center justify-between gap-3 py-3 text-left text-[15px] disabled:cursor-default">
                          <span className="flex items-center gap-2 font-medium text-cfrq-deep">
                            <span aria-hidden>📄</span>
                            <span className={doc.storage_path ? "hover:underline" : ""}>{doc.nom_document}</span>
                          </span>
                          <span className="shrink-0 text-[13px] text-black/50">{doc.date_document ?? doc.taille}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[15px] leading-relaxed text-black/60">
                    Aucun plan d'aménagement structuré à votre dossier pour le moment. C'est l'étape qui donne accès aux programmes d'aide.{" "}
                    <a href={withBase("/contact")} className="font-medium text-cfrq-leaf hover:underline">Nous en parler</a>.
                  </p>
                )}
              </div>
            </section>
          </Reveal>

          <Reveal delay={80}>
            <section>
              <h2 className="font-display text-xl font-medium text-cfrq-deep">Vos travaux, année par année</h2>
              {travauxParAnnee.length > 0 ? (
                <div className="mt-4 space-y-6">
                  {travauxParAnnee.map(([annee, liste]) => (
                    <div key={annee} className="relative pl-6">
                      <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full bg-cfrq-green" aria-hidden></span>
                      <span className="absolute left-1.5 top-4 h-[calc(100%-0.5rem)] w-px bg-cfrq-green/25" aria-hidden></span>
                      <div className="text-[13px] font-medium uppercase tracking-wide text-cfrq-leaf">{annee}</div>
                      <div className="mt-2 space-y-2">
                        {liste.map((t, i) => {
                          const doc = docPourPrescription(t.no_prescription);
                          return (
                            <div key={i} className="rounded-2xl border border-black/5 bg-white p-4">
                              <div className="text-[15.5px] font-medium text-cfrq-deep">{t.traitement ?? "Travaux réalisés"}</div>
                              <div className="mt-0.5 text-[13.5px] text-black/55">
                                {[t.hectares != null ? nf.format(Number(t.hectares)) + " ha" : null, t.no_prescription ? "Prescription " + t.no_prescription : null].filter(Boolean).join(" · ")}
                              </div>
                              {doc?.storage_path && (
                                <button onClick={() => ouvrirDoc(doc.storage_path)} className="mt-2 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-cfrq-leaf hover:underline">
                                  <span aria-hidden>📄</span> Voir le rapport
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-black/5 bg-white p-4 text-[15px] text-black/60">Aucun travail consigné pour le moment.</div>
              )}
            </section>
          </Reveal>
        </div>

        {/* Documents */}
        <Reveal className="mt-10">
          <section id="documents">
            <h2 className="font-display text-xl font-medium text-cfrq-deep">Vos documents</h2>
            <p className="mt-1 text-[14.5px] text-black/55">Vos plans, prescriptions et rapports signés, conservés au même endroit : un boisé documenté, plus facile à entretenir et à transmettre.</p>
            <div className="mt-4 rounded-2xl border border-black/5 bg-white p-6">
              {docsHorsPaf.length > 0 ? (
                <ul className="divide-y divide-black/5">
                  {docsHorsPaf.map((doc) => (
                    <li key={doc.id}>
                      <button onClick={() => ouvrirDoc(doc.storage_path)} disabled={!doc.storage_path}
                        className="flex w-full items-center justify-between gap-3 py-3 text-left text-[15px] disabled:cursor-default">
                        <span className="flex items-center gap-2 font-medium text-cfrq-deep">
                          {doc.storage_path && <span aria-hidden>📄</span>}
                          <span className={doc.storage_path ? "hover:underline" : ""}>{doc.nom_document}</span>
                        </span>
                        <span className="shrink-0 text-[13px] text-black/50">{doc.taille ?? doc.date_document}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[15px] text-black/60">Vos plans et rapports apparaîtront ici.</p>
              )}
            </div>
          </section>
        </Reveal>

        {/* Leviers et programmes (en second temps) */}
        <Reveal className="mt-10">
          <section className="rounded-2xl bg-cfrq-tint p-6 md:p-8">
            <h2 className="font-display text-xl font-medium text-cfrq-deep">Saviez-vous que...</h2>
            <p className="mt-2 max-w-2xl text-[15.5px] leading-relaxed text-cfrq-ink/75">
              {reconnu
                ? "Votre statut de producteur forestier reconnu peut vous donner accès à un allègement de vos taxes foncières et à des programmes d'aide pour vos travaux."
                : "Des programmes d'aide et un allègement de taxes foncières existent pour les propriétaires forestiers."}{" "}
              La plupart des propriétaires ignorent ces mesures. Votre ingénieur peut vérifier votre admissibilité.
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

        {/* Estimation carbone */}
        {carbone && (
          <Reveal className="mt-10">
            <section className="rounded-2xl bg-cfrq-tint p-6 md:p-8">
              <h2 className="font-display text-xl font-medium text-cfrq-deep">Estimation : le carbone de votre forêt</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-white/70 p-5">
                  <div className="text-[13px] text-cfrq-leaf">Carbone stocké (ordre de grandeur)</div>
                  <div className="mt-1 font-display text-3xl font-medium text-cfrq-deep">
                    <CountUp value={carbone.stock} /> t
                  </div>
                  <div className="mt-1 text-[13.5px] text-cfrq-ink/65">de CO₂, comparable aux émissions annuelles de près de {nfEnt.format(carbone.voitures)} voitures.</div>
                </div>
                <div className="rounded-xl bg-white/70 p-5">
                  <div className="text-[13px] text-cfrq-leaf">Capté chaque année (estimation)</div>
                  <div className="mt-1 font-display text-3xl font-medium text-cfrq-deep">{nfEnt.format(carbone.seqMin)} à {nfEnt.format(carbone.seqMax)} t</div>
                  <div className="mt-1 text-[13.5px] text-cfrq-ink/65">de CO₂ de plus chaque année pendant la croissance de votre forêt.</div>
                </div>
              </div>
              <details className="group mt-4">
                <summary className="cursor-pointer list-none text-[14px] font-medium text-cfrq-leaf">Comment ce chiffre est calculé</summary>
                <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-cfrq-ink/70">
                  Estimation pédagogique fondée sur des moyennes provinciales (MRNF, RNCan) appliquées à vos {nf.format(superficieBoisee)} hectares boisés, et non sur une mesure de votre lot. Le chiffre réel varie selon l'âge, les essences, la station et les travaux. Pour valoriser ce carbone (crédits compensatoires), il faut un projet certifié : parlez-en à votre ingénieur forestier.
                </p>
              </details>
            </section>
          </Reveal>
        )}

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
      </div>
    </div>
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

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.replace(withBase("/espace-client")); return; }
      const [prod, proprietes, lots, paf, travaux, docs, carte] = await Promise.all([
        supabase.from("producteurs").select("*").maybeSingle(),
        supabase.from("proprietes").select("*").order("no_propriete"),
        supabase.from("lots").select("*"),
        supabase.from("paf").select("*"),
        supabase.from("travaux").select("*"),
        supabase.from("documents").select("*"),
        supabase.from("cartes").select("geojson,bbox").maybeSingle(),
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
      });
      setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) window.location.replace(withBase("/espace-client"));
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
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

  return <DashboardView d={d} onLogout={logout} />;
}
