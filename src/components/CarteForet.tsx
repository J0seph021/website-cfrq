import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../lib/supabaseClient";
import { analyseDepuisProps, sparklineCourbe, COULEUR_STATUT, LEGENDE_CAPITAL } from "../lib/foret/adaptateur";
import PanneauProjection from "./PanneauProjection";

type FeatureCollection = { type: "FeatureCollection"; features: any[] };
type Bbox = [number, number, number, number];
type Doc = { reference?: string; type_document?: string; storage_path?: string; nom_document?: string };

interface Props {
  /** FeatureCollection déjà chargée (couches taguées par propriété `couche`). */
  data: FeatureCollection;
  /** Cadre [minLng, minLat, maxLng, maxLat] pour le zoom initial. */
  bbox?: Bbox | null;
  /** Documents du producteur (table public.documents), pour lier les PDF au clic. */
  documents?: Doc[];
}

// Couches affichables, dans l'ordre d'empilement (du bas vers le haut).
const COUCHES = [
  { id: "peuplement", label: "Peuplements" },
  { id: "travaux", label: "Travaux réalisés" },
  { id: "hydro", label: "Ruisseaux et écoulements" },
  { id: "prescription", label: "Prescriptions" },
  { id: "propriete", label: "Limites de propriété" },
] as const;

// Palette pour colorer les peuplements par appellation.
const PALETTE = [
  "#2f7d32", "#7cb342", "#c0ca33", "#00897b", "#558b2f",
  "#9e7d3a", "#6d4c41", "#43a047", "#a1887f", "#33691e",
  "#26a69a", "#9ccc65", "#827717", "#5d8a3a", "#4e6a2f",
];

const COULEUR_TRAVAUX = "#e03131";      // rouge : travaux réalisés (demande focus group)
const COULEUR_PRESCRIPTION = "#111111"; // noir : prescriptions, pour ne plus les confondre avec les ruisseaux
const COULEUR_PROPRIETE = "#ffffff";
const COULEUR_PEUPLEMENT_CONTOUR = "#ffffff"; // contour pointillé blanc entre peuplements
const COULEUR_HYDRO = "#2b8ae6"; // bleu : ruisseaux LiDAR (le bleu est libre, prescriptions en noir)

// Couches MapLibre rattachées à chaque couche logique (pour un affichage/masquage groupé).
const LAYERS_PAR_COUCHE: Record<string, string[]> = {
  peuplement: ["peuplement-fill", "peuplement-line"],
  travaux: ["travaux-fill"],
  hydro: ["hydro-perm", "hydro-int"],
  prescription: ["prescription-hit", "prescription-casing", "prescription-line"],
  propriete: ["propriete-line"],
};

const estPetitEcran = () => typeof window !== "undefined" && window.innerWidth < 640;

function couleurAppellations(features: any[]): { expr: any; legende: { nom: string; couleur: string }[] } {
  const noms = Array.from(
    new Set(
      features
        .filter((f) => f.properties?.couche === "peuplement")
        .map((f) => f.properties?.appellation ?? "Non classé")
    )
  ).sort();
  const legende = noms.map((nom, i) => ({ nom, couleur: PALETTE[i % PALETTE.length] }));
  const expr: any = ["match", ["coalesce", ["get", "appellation"], "Non classé"]];
  for (const { nom, couleur } of legende) expr.push(nom, couleur);
  expr.push("#9e9e9e"); // défaut
  return { expr, legende };
}

export default function CarteForet({ data, bbox, documents = [] }: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const enveloppe = useRef<HTMLDivElement>(null);
  const carte = useRef<maplibregl.Map | null>(null);
  const [visibles, setVisibles] = useState<Record<string, boolean>>({
    peuplement: true, travaux: true, hydro: true, prescription: true, propriete: true,
  });
  // Sur mobile, les panneaux démarrent repliés pour laisser voir la carte.
  const [couchesOuvert, setCouchesOuvert] = useState(!estPetitEcran());
  const [legendeOuverte, setLegendeOuverte] = useState(!estPetitEcran());
  const [pleinEcran, setPleinEcran] = useState(false);
  const [astuce, setAstuce] = useState(true);
  // E2 : mode « capital forestier » (colore les peuplements par statut de maturité).
  const [capital, setCapital] = useState(false);
  // E3 : peuplement sélectionné pour le panneau de projection avec/sans intervention.
  const [selPeup, setSelPeup] = useState<Record<string, any> | null>(null);

  const { expr: couleurPeuplement, legende } = useMemo(
    () => couleurAppellations(data?.features ?? []),
    [data]
  );

  const anneeCourante = useMemo(() => new Date().getFullYear(), []);

  // Enrichit chaque feature de peuplement d'une couleur de capital (_capital),
  // calculée une fois par le moteur, pour la couche colorée E2. Ne mute jamais
  // la donnée d'origine (clone superficiel des features de peuplement).
  const dataCapital = useMemo<FeatureCollection>(() => {
    const feats = (data?.features ?? []).map((f) => {
      if (f?.properties?.couche !== "peuplement") return f;
      const a = analyseDepuisProps(f.properties, anneeCourante);
      return { ...f, properties: { ...f.properties, _capital: COULEUR_STATUT[a.couleur] } };
    });
    return { type: "FeatureCollection", features: feats };
  }, [data, anneeCourante]);
  const dataCapitalRef = useRef(dataCapital);
  dataCapitalRef.current = dataCapital;

  // Index des documents par numéro de prescription (pour le clic sur un polygone).
  const docsParRef = useMemo(() => {
    const m = new Map<string, Doc[]>();
    for (const d of documents) {
      if (!d.reference) continue;
      const arr = m.get(d.reference);
      if (arr) arr.push(d); else m.set(d.reference, [d]);
    }
    return m;
  }, [documents]);
  const docsRef = useRef(docsParRef);
  docsRef.current = docsParRef;
  const anneeRef = useRef(anneeCourante);
  anneeRef.current = anneeCourante;
  // Dernier peuplement cliqué : le bouton « projection » du popup le relit (E3).
  const dernierPeup = useRef<Record<string, any> | null>(null);

  // Ouvre un PDF via une URL signée temporaire (RLS: le client n'accède qu'à ses propres documents).
  useEffect(() => {
    (window as any).__cfrqDoc = async (path: string) => {
      const { data: s } = await supabase.storage.from("documents").createSignedUrl(path, 300);
      if (s?.signedUrl) window.open(s.signedUrl, "_blank", "noopener");
    };
    // Pont popup (HTML injecté) -> React : ouvre le panneau de projection E3.
    (window as any).__cfrqProjeter = () => { if (dernierPeup.current) setSelPeup(dernierPeup.current); };
    if ((window as any).__carteDebugOn) {
      (window as any).__contenuPopup = (p: any) => contenuPopup(p, docsRef.current, anneeRef.current);
      (window as any).__ouvrirProjection = (p: any) => setSelPeup(p);
    }
  }, []);

  // E2 : bascule le remplissage des peuplements entre couleur d'appellation et
  // couleur de capital (croissance/maturité/décroissance) calculée par le moteur.
  useEffect(() => {
    const map = carte.current;
    if (!map || !map.getLayer("peuplement-fill")) return;
    map.setPaintProperty(
      "peuplement-fill", "fill-color",
      capital ? ["coalesce", ["get", "_capital"], COULEUR_STATUT.gris] : couleurPeuplement,
    );
    map.setPaintProperty("peuplement-fill", "fill-opacity", capital ? 0.68 : 0.55);
  }, [capital, couleurPeuplement]);

  useEffect(() => {
    if (!conteneur.current || carte.current) return;

    const map = new maplibregl.Map({
      container: conteneur.current,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          ortho: {
            type: "raster",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            attribution: "Imagerie © Esri · Données CFRQ / PlaniLogix",
          },
        },
        layers: [{ id: "ortho", type: "raster", source: "ortho" }],
      },
      center: [-72.2, 46.8],
      zoom: 9,
      cooperativeGestures: estPetitEcran(), // un doigt fait défiler la page, deux doigts déplacent la carte
    });
    carte.current = map;
    // Poignée de diagnostic, activée seulement si une page de test pose le drapeau.
    if ((window as any).__carteDebugOn) ((window as any).__cartesDebug ??= []).push(map);
    // Les erreurs MapLibre (style, source, WebGL) sont silencieuses par défaut :
    // les journaliser permet de diagnostiquer à distance un incident chez un client.
    map.on("error", (e: any) => console.error("[carte] erreur MapLibre:", e?.error?.message ?? e));
    const canvas = map.getCanvas();
    canvas.addEventListener("webglcontextlost", (ev) => {
      console.error("[carte] contexte WebGL perdu — récupération en attente");
      ev.preventDefault(); // requis pour que le navigateur autorise la restauration
    });
    canvas.addEventListener("webglcontextrestored", () => {
      console.warn("[carte] contexte WebGL restauré — repeinture");
      map.triggerRepaint();
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // Bouton « plein écran » maison (superposition CSS) : fonctionne aussi sur iPhone,
    // contrairement à l'API Fullscreen native que Safari iOS n'expose pas.
    const ctrlPleinEcran: any = {
      onAdd() {
        const wrap = document.createElement("div");
        wrap.className = "maplibregl-ctrl maplibregl-ctrl-group";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = "Plein écran";
        btn.setAttribute("aria-label", "Afficher la carte en plein écran");
        btn.style.fontSize = "15px";
        btn.textContent = "⛶";
        btn.addEventListener("click", () => setPleinEcran((p) => !p));
        wrap.appendChild(btn);
        return wrap;
      },
      onRemove() {},
    };
    map.addControl(ctrlPleinEcran, "top-right");
    if (!estPetitEcran()) map.scrollZoom.disable();

    map.on("load", () => {
      map.addSource("foret", { type: "geojson", data: dataCapitalRef.current });
      map.addLayer({
        id: "peuplement-fill", source: "foret", type: "fill",
        filter: ["==", ["get", "couche"], "peuplement"],
        paint: { "fill-color": couleurPeuplement, "fill-opacity": 0.55 },
      });
      // Contour pointillé blanc : sépare nettement des peuplements tous en nuances de vert.
      map.addLayer({
        id: "peuplement-line", source: "foret", type: "line",
        filter: ["==", ["get", "couche"], "peuplement"],
        paint: { "line-color": COULEUR_PEUPLEMENT_CONTOUR, "line-width": 1.3, "line-opacity": 0.85, "line-dasharray": [2.5, 1.5] },
      });
      map.addLayer({
        id: "travaux-fill", source: "foret", type: "fill",
        filter: ["==", ["get", "couche"], "travaux"],
        paint: { "fill-color": COULEUR_TRAVAUX, "fill-opacity": 0.4, "fill-outline-color": COULEUR_TRAVAUX },
      });
      // Ruisseaux LiDAR (A5 focus group) : permanents en trait plein, plus large
      // pour les ruisseaux que pour les zones de permanence ; intermittents en
      // pointillé fin. Par-dessus les remplissages, sous les prescriptions.
      map.addLayer({
        id: "hydro-perm", source: "foret", type: "line",
        filter: ["all", ["==", ["get", "couche"], "hydro"], ["!=", ["get", "classe"], "2. Intermitent"]],
        paint: {
          "line-color": COULEUR_HYDRO,
          "line-width": ["match", ["get", "classe"], "4. Permanent", 2.2, 1.4],
          "line-opacity": 0.95,
        },
      });
      map.addLayer({
        id: "hydro-int", source: "foret", type: "line",
        filter: ["all", ["==", ["get", "couche"], "hydro"], ["==", ["get", "classe"], "2. Intermitent"]],
        paint: { "line-color": COULEUR_HYDRO, "line-width": 1.1, "line-opacity": 0.8, "line-dasharray": [3, 2] },
      });
      // Zone cliquable des prescriptions : remplissage invisible sur tout le polygone.
      // Sans lui, la seule cible de clic était la ligne pointillée de 2 px — quasi
      // impossible à viser (retour focus group : « plus capable de sélectionner »).
      map.addLayer({
        id: "prescription-hit", source: "foret", type: "fill",
        filter: ["==", ["get", "couche"], "prescription"],
        paint: { "fill-color": "#000000", "fill-opacity": 0 },
      });
      // Prescriptions en noir, avec un liseré blanc dessous pour rester lisibles sur l'imagerie.
      map.addLayer({
        id: "prescription-casing", source: "foret", type: "line",
        filter: ["==", ["get", "couche"], "prescription"],
        paint: { "line-color": "#ffffff", "line-width": 4, "line-opacity": 0.55 },
      });
      map.addLayer({
        id: "prescription-line", source: "foret", type: "line",
        filter: ["==", ["get", "couche"], "prescription"],
        paint: { "line-color": COULEUR_PRESCRIPTION, "line-width": 2, "line-dasharray": [2, 1.5] },
      });
      map.addLayer({
        id: "propriete-line", source: "foret", type: "line",
        filter: ["==", ["get", "couche"], "propriete"],
        paint: { "line-color": COULEUR_PROPRIETE, "line-width": 2.5 },
      });

      if (bbox && bbox.length === 4) {
        map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 30, animate: false });
      }

      const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "290px" });
      // Ordre = priorité de popup quand les polygones se superposent (le dernier gagne).
      const cibles = ["peuplement-fill", "travaux-fill", "prescription-hit", "propriete-line"];
      for (const couche of cibles) {
        map.on("mouseenter", couche, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", couche, () => { map.getCanvas().style.cursor = ""; });
        map.on("click", couche, (e) => {
          const p = e.features?.[0]?.properties as Record<string, any> | undefined;
          if (!p) return;
          if (p.couche === "peuplement") dernierPeup.current = p; // pour le bouton « projection »
          popup.setLngLat(e.lngLat).setHTML(contenuPopup(p, docsRef.current, anneeRef.current)).addTo(map);
        });
      }
      // Masque l'astuce dès la première interaction avec la carte.
      map.on("click", () => setAstuce(false));
    });

    const onResize = () => map.resize();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); map.remove(); carte.current = null; };
  }, [data, bbox, couleurPeuplement]);

  function basculer(id: string) {
    setVisibles((v) => {
      const nv = { ...v, [id]: !v[id] };
      const map = carte.current;
      if (map) {
        for (const l of LAYERS_PAR_COUCHE[id] ?? []) {
          if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", nv[id] ? "visible" : "none");
        }
      }
      return nv;
    });
  }

  // Plein écran (superposition CSS) : redimensionne la carte, verrouille le défilement
  // de la page, active la molette pour zoomer, et laisse Échap pour en sortir.
  useEffect(() => {
    const map = carte.current;
    if (!map) return;
    const t = setTimeout(() => map.resize(), 60);
    document.body.style.overflow = pleinEcran ? "hidden" : "";
    if (pleinEcran) map.scrollZoom.enable();
    else if (!estPetitEcran()) map.scrollZoom.disable();
    const onEchap = (e: KeyboardEvent) => { if (e.key === "Escape") setPleinEcran(false); };
    if (pleinEcran) window.addEventListener("keydown", onEchap);
    return () => { clearTimeout(t); document.body.style.overflow = ""; window.removeEventListener("keydown", onEchap); };
  }, [pleinEcran]);

  const pastille = (id: string) => {
    if (id === "travaux") return { background: COULEUR_TRAVAUX, border: "none" };
    if (id === "hydro") return { background: "transparent", border: `2px solid ${COULEUR_HYDRO}` };
    if (id === "prescription") return { background: "transparent", border: `2px dashed ${COULEUR_PRESCRIPTION}` };
    if (id === "propriete") return { background: "transparent", border: "2px solid #b9c2cc" };
    return { background: "#558b2f", border: "none" };
  };

  return (
    <>
    <div
      ref={enveloppe}
      // JAMAIS `relative` et `fixed` ensemble : même spécificité CSS, l'ordre de la
      // feuille Tailwind décidait et `relative` gagnait -> le plein écran ne se
      // positionnait jamais (carte effondrée à 0 px, page verrouillée).
      className={`overflow-hidden bg-cfrq-deep ${pleinEcran ? "fixed inset-0 z-[60] h-dvh w-screen rounded-none" : "relative h-[68vh] min-h-[460px] rounded-2xl border border-black/5 sm:h-[560px]"}`}
    >
      {/* className statique : MapLibre ajoute ses propres classes ici, un re-render React ne doit pas les écraser. */}
      <div ref={conteneur} className="h-full w-full" />

      {/* Sortie de plein écran toujours visible (pas d'Échap sur mobile). */}
      {pleinEcran && (
        <button
          onClick={() => setPleinEcran(false)}
          className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full bg-white/95 px-4 py-2 text-[13.5px] font-medium text-cfrq-deep shadow-lg backdrop-blur"
        >
          ✕ Quitter le plein écran
        </button>
      )}

      {/* Couches (repliable) */}
      <div className="absolute left-2 top-2 sm:left-3 sm:top-3">
        {couchesOuvert ? (
          <div className="rounded-xl bg-white/95 p-3 text-[13px] shadow-lg backdrop-blur">
            <button onClick={() => setCouchesOuvert(false)}
              className="mb-1.5 flex w-full items-center justify-between gap-4 font-medium text-cfrq-deep">
              Couches <span aria-hidden className="text-black/40">✕</span>
            </button>
            <div className="space-y-1">
              {COUCHES.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 text-black/70">
                  <input type="checkbox" checked={visibles[c.id]} onChange={() => basculer(c.id)} className="accent-cfrq-green" />
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm" style={pastille(c.id)} />
                    {c.label}
                  </span>
                </label>
              ))}
            </div>
            {/* E2 : vue « capital forestier » — recolore les peuplements par statut. */}
            <label className="mt-2 flex cursor-pointer items-start gap-2 border-t border-black/10 pt-2 text-black/70">
              <input type="checkbox" checked={capital} onChange={() => setCapital((v) => !v)} className="mt-0.5 accent-cfrq-green" />
              <span>
                <span className="inline-flex items-center gap-1.5 font-medium text-cfrq-deep">
                  <span className="inline-flex">
                    <span className="inline-block h-3 w-2 rounded-l-sm" style={{ background: COULEUR_STATUT.vert }} />
                    <span className="inline-block h-3 w-2" style={{ background: COULEUR_STATUT.jaune }} />
                    <span className="inline-block h-3 w-2 rounded-r-sm" style={{ background: COULEUR_STATUT.rouge }} />
                  </span>
                  Capital forestier
                </span>
                <span className="block text-[11.5px] leading-tight text-black/50">Croissance / mûr / décroissance</span>
              </span>
            </label>
          </div>
        ) : (
          <button onClick={() => setCouchesOuvert(true)}
            className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-2 text-[13px] font-medium text-cfrq-deep shadow-lg backdrop-blur">
            <span aria-hidden>▦</span> Couches
          </button>
        )}
      </div>

      {/* Légende (repliable) : capital forestier en mode E2, sinon types de peuplement. */}
      {((capital ? true : legende.length > 0)) && visibles.peuplement && (
        <div className="absolute bottom-8 right-2 sm:bottom-3 sm:right-3">
          {legendeOuverte ? (
            <div className="max-h-[42vh] max-w-[230px] overflow-auto rounded-xl bg-white/95 p-3 text-[12px] shadow-lg backdrop-blur sm:max-h-[200px]">
              <button onClick={() => setLegendeOuverte(false)}
                className="mb-1.5 flex w-full items-center justify-between gap-4 font-medium text-cfrq-deep">
                {capital ? "Capital forestier" : "Types de peuplement"} <span aria-hidden className="text-black/40">✕</span>
              </button>
              <ul className="space-y-1">
                {(capital ? LEGENDE_CAPITAL : legende).map((l) => (
                  <li key={l.nom} className="flex items-center gap-2 text-black/70">
                    <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: l.couleur }} />
                    <span className="leading-tight">{l.nom}</span>
                  </li>
                ))}
              </ul>
              {capital && (
                <p className="mt-2 border-t border-black/10 pt-1.5 text-[10.5px] leading-tight text-black/45">
                  Estimation indicative (courbes Pothier-Savard). Cliquez un peuplement pour la projection.
                </p>
              )}
            </div>
          ) : (
            <button onClick={() => setLegendeOuverte(true)}
              className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-2 text-[12px] font-medium text-cfrq-deep shadow-lg backdrop-blur">
              <span aria-hidden>🎨</span> Légende
            </button>
          )}
        </div>
      )}

      {/* Astuce de découverte : cliquer un peuplement n'est pas évident (focus group). */}
      {astuce && (
        <div className="absolute bottom-8 left-2 max-w-[240px] sm:bottom-3 sm:left-3">
          <div className="flex items-start gap-2 rounded-xl bg-cfrq-deep/90 px-3 py-2 text-[12.5px] leading-snug text-white shadow-lg backdrop-blur">
            <span aria-hidden className="mt-px">👆</span>
            <span>Cliquez un peuplement pour voir son détail : essences, volume, traitement recommandé.</span>
            <button onClick={() => setAstuce(false)} aria-label="Fermer l'astuce"
              className="ml-0.5 shrink-0 leading-none text-white/60 hover:text-white">✕</button>
          </div>
        </div>
      )}
    </div>
    {/* E3 : projection avec / sans intervention du peuplement sélectionné. */}
    {selPeup && (
      <PanneauProjection props={selPeup} anneeCourante={anneeCourante} onClose={() => setSelPeup(null)} />
    )}
    </>
  );
}

const STATUTS: Record<string, string> = {
  demande: "Demande", en_execution: "En exécution", rapport_soumis: "Rapport soumis",
  approuve: "Approuvé", refuse: "Refusé", paye: "Payé", complete: "Complété",
};

// Bloc « courbe de maturité » (E1) ajouté au popup d'un peuplement.
function blocMaturite(p: Record<string, any>, anneeCourante: number): string {
  const a = analyseDepuisProps(p, anneeCourante);
  if (!a.courbe) return ""; // essence/type éco absent : pas de courbe, on n'affiche rien.
  const dot = { vert: "#2f9e44", jaune: "#f59f00", rouge: "#e03131", gris: "#adb5bd" }[a.couleur];
  const svg = sparklineCourbe(a, 244, 92);
  const fiab = a.fiabilite === "bonne" ? "" : ` · fiabilité ${a.fiabilite}`;
  return `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #eee">`
    + `<div style="display:flex;align-items:center;gap:6px;font-weight:600;color:#1b3a13">`
    + `<span style="width:9px;height:9px;border-radius:50%;background:${dot};display:inline-block"></span>`
    + `Capital forestier${fiab}</div>`
    + `<div style="color:#374151;margin:2px 0 2px;font-size:11.5px;line-height:1.35">${a.message.replace(/[<>]/g, "")}</div>`
    + svg
    + `<button onclick="window.__cfrqProjeter();return false;" style="margin-top:6px;width:100%;padding:6px 8px;border:0;border-radius:6px;background:#1b3a13;color:#fff;font-weight:600;font-size:12px;cursor:pointer">Projection sur 50 ans (avec / sans intervention) →</button>`
    + `</div>`;
}

function contenuPopup(p: Record<string, any>, docsParRef?: Map<string, Doc[]>, anneeCourante = new Date().getFullYear()): string {
  const esc = (s: any) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const ligne = (label: string, val: any, unite = "") =>
    val == null || val === ""
      ? ""
      : `<div style="display:flex;gap:10px;justify-content:space-between;padding:1px 0"><span style="color:#6b7280">${label}</span><span style="font-weight:500;text-align:right">${esc(val)}${unite}</span></div>`;
  const titre = (t: string, sous = "") =>
    `<div style="font-weight:600;color:#1b3a13">${esc(t)}</div>` +
    (sous ? `<div style="color:#6b7280;font-size:11px;margin-bottom:4px">${esc(sous)}</div>` : `<div style="height:4px"></div>`);
  const wrap = (inner: string) =>
    `<div style="max-height:260px;overflow:auto;font-size:12.5px;line-height:1.45;padding-right:4px">${inner}</div>`;
  // Liens vers les PDF (prescription, rapport) liés à un numéro de prescription.
  const liensDocs = (no?: string) => {
    const docs = no && docsParRef ? docsParRef.get(no) ?? [] : [];
    if (!docs.length) return "";
    const lbl = (t?: string) => (t === "prescription" ? "Prescription (PDF)" : t === "rapport" ? "Rapport d'exécution (PDF)" : "Document (PDF)");
    const lien = (d: Doc) =>
      `<a href="#" onclick="window.__cfrqDoc('${esc(d.storage_path)}');return false;" style="display:block;margin-top:4px;color:#1f6feb;font-weight:600;text-decoration:none">📄 ${lbl(d.type_document)}</a>`;
    return `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #eee">${docs.map(lien).join("")}</div>`;
  };

  switch (p.couche) {
    case "peuplement":
      return wrap(
        titre(p.appellation ?? "Peuplement", p.no_peup ? `Peuplement nº ${p.no_peup}` : "") +
        ligne("Essences", p.essences) +
        ligne("Superficie", p.superficie_ha, " ha") +
        ligne("Classe d'âge", p.classe_age) +
        ligne("Densité", p.densite) +
        ligne("Hauteur", p.hauteur_m, " m") +
        ligne("Surface terrière", p.surface_terriere, " m²/ha") +
        ligne("Diamètre moyen", p.diametre_moyen, " cm") +
        ligne("Volume", p.volume_m3_ha, " m³/ha") +
        ligne("Volume total", p.volume_total_m3, " m³") +
        ligne("Drainage", p.drainage) +
        ligne("Pente", p.pente) +
        ligne("Perturbation", p.perturbation) +
        (p.traitements_rec
          ? `<div style="margin-top:5px;padding-top:5px;border-top:1px solid #eee"><span style="color:#6b7280">Traitement recommandé</span><div style="font-weight:600;color:#2f7d32">${esc(p.traitements_rec)}</div></div>`
          : "") +
        ligne("Priorité", p.priorite) +
        blocMaturite(p, anneeCourante)
      );
    case "travaux":
      return wrap(
        titre("Travaux réalisés", p.no_prescription ? `Prescription nº ${p.no_prescription}` : "") +
        (p.traitement ? `<div style="font-weight:600;color:#2f7d32;margin-bottom:3px">${esc(p.traitement)}</div>` : "") +
        ligne("Année", p.annee) +
        ligne("Superficie", p.hectares, " ha") +
        liensDocs(p.no_prescription)
      );
    case "prescription":
      return wrap(
        titre("Prescription sylvicole", p.no_prescription ? `nº ${p.no_prescription}` : "") +
        (p.traitement ? `<div style="font-weight:600;color:#2f7d32;margin:2px 0 4px">${esc(p.traitement)}</div>` : "") +
        ligne("Statut", STATUTS[p.statut] ?? p.statut) +
        ligne("Année", p.annee) +
        ligne("Superficie", p.hectares, " ha") +
        ligne("Lots", p.lots) +
        ligne("Prescrit par", p.prescrit_par) +
        ligne("Date du rapport", p.date_rapport) +
        liensDocs(p.no_prescription)
      );
    case "propriete":
      return wrap(titre("Limites de la propriété"));
    default:
      return wrap(titre("Élément"));
  }
}
