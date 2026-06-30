import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type FeatureCollection = { type: "FeatureCollection"; features: any[] };
type Bbox = [number, number, number, number];

interface Props {
  /** FeatureCollection déjà chargée (couches taguées par propriété `couche`). */
  data: FeatureCollection;
  /** Cadre [minLng, minLat, maxLng, maxLat] pour le zoom initial. */
  bbox?: Bbox | null;
}

// Couches affichables, dans l'ordre d'empilement (du bas vers le haut).
const COUCHES = [
  { id: "peuplement", label: "Peuplements" },
  { id: "travaux", label: "Travaux réalisés" },
  { id: "prescription", label: "Prescriptions" },
  { id: "propriete", label: "Limites de propriété" },
] as const;

// Palette pour colorer les peuplements par appellation.
const PALETTE = [
  "#2f7d32", "#7cb342", "#c0ca33", "#00897b", "#558b2f",
  "#9e7d3a", "#6d4c41", "#43a047", "#a1887f", "#33691e",
  "#26a69a", "#9ccc65", "#827717", "#5d8a3a", "#4e6a2f",
];

const COULEUR_TRAVAUX = "#e8a13a";
const COULEUR_PRESCRIPTION = "#1f6feb";
const COULEUR_PROPRIETE = "#ffffff";

function couleurAppellations(features: any[]): { expr: any; legende: { nom: string; couleur: string }[] } {
  const noms = Array.from(
    new Set(
      features
        .filter((f) => f.properties?.couche === "peuplement")
        .map((f) => f.properties?.appellation ?? "Non classé")
    )
  ).sort();
  const legende = noms.map((nom, i) => ({ nom, couleur: PALETTE[i % PALETTE.length] }));
  // Expression MapLibre: match sur l'appellation -> couleur.
  const expr: any = ["match", ["coalesce", ["get", "appellation"], "Non classé"]];
  for (const { nom, couleur } of legende) expr.push(nom, couleur);
  expr.push("#9e9e9e"); // défaut
  return { expr, legende };
}

export default function CarteForet({ data, bbox }: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<maplibregl.Map | null>(null);
  const [visibles, setVisibles] = useState<Record<string, boolean>>({
    peuplement: true,
    travaux: true,
    prescription: true,
    propriete: true,
  });

  const { expr: couleurPeuplement, legende } = useMemo(
    () => couleurAppellations(data?.features ?? []),
    [data]
  );

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
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "Imagerie © Esri · Données CFRQ / PlaniLogix",
          },
        },
        layers: [{ id: "ortho", type: "raster", source: "ortho" }],
      },
      center: [-72.2, 46.8],
      zoom: 9,
    });
    carte.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.scrollZoom.disable(); // évite de capturer le scroll de la page; molette + ctrl ou boutons +/-

    map.on("load", () => {
      map.addSource("foret", { type: "geojson", data });

      map.addLayer({
        id: "peuplement-fill", source: "foret", type: "fill",
        filter: ["==", ["get", "couche"], "peuplement"],
        paint: { "fill-color": couleurPeuplement, "fill-opacity": 0.55, "fill-outline-color": "#1b5e20" },
      });
      map.addLayer({
        id: "travaux-fill", source: "foret", type: "fill",
        filter: ["==", ["get", "couche"], "travaux"],
        paint: { "fill-color": COULEUR_TRAVAUX, "fill-opacity": 0.45 },
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

      // Zoom sur la propriété.
      if (bbox && bbox.length === 4) {
        map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40, animate: false });
      }

      // Popups d'information.
      const popup = new maplibregl.Popup({ closeButton: false, maxWidth: "260px" });
      const cibles = ["peuplement-fill", "travaux-fill", "prescription-line", "propriete-line"];
      for (const couche of cibles) {
        map.on("mouseenter", couche, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", couche, () => { map.getCanvas().style.cursor = ""; popup.remove(); });
        map.on("click", couche, (e) => {
          const p = e.features?.[0]?.properties as Record<string, any> | undefined;
          if (!p) return;
          popup.setLngLat(e.lngLat).setHTML(contenuPopup(p)).addTo(map);
        });
      }
    });

    return () => { map.remove(); carte.current = null; };
  }, [data, bbox, couleurPeuplement]);

  function basculer(id: string) {
    setVisibles((v) => {
      const nv = { ...v, [id]: !v[id] };
      const map = carte.current;
      if (map) {
        const layers = id === "prescription" ? ["prescription-line"]
          : id === "propriete" ? ["propriete-line"]
          : [`${id}-fill`];
        for (const l of layers) {
          if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", nv[id] ? "visible" : "none");
        }
      }
      return nv;
    });
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-black/5 bg-cfrq-deep">
      <div ref={conteneur} className="h-[460px] w-full" />

      {/* Contrôles de couches */}
      <div className="absolute left-3 top-3 rounded-xl bg-white/95 p-3 text-[13px] shadow-lg backdrop-blur">
        <div className="mb-1.5 font-medium text-cfrq-deep">Couches</div>
        <div className="space-y-1">
          {COUCHES.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 text-black/70">
              <input type="checkbox" checked={visibles[c.id]} onChange={() => basculer(c.id)}
                className="accent-cfrq-green" />
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm" style={{
                  background: c.id === "travaux" ? COULEUR_TRAVAUX
                    : c.id === "prescription" ? "transparent"
                    : c.id === "propriete" ? "transparent" : "#558b2f",
                  border: c.id === "prescription" ? `2px dashed ${COULEUR_PRESCRIPTION}`
                    : c.id === "propriete" ? "2px solid #b9c2cc" : "none",
                }} />
                {c.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Légende des peuplements */}
      {legende.length > 0 && visibles.peuplement && (
        <div className="absolute bottom-3 right-3 max-h-[180px] max-w-[230px] overflow-auto rounded-xl bg-white/95 p-3 text-[12px] shadow-lg backdrop-blur">
          <div className="mb-1.5 font-medium text-cfrq-deep">Types de peuplement</div>
          <ul className="space-y-1">
            {legende.map((l) => (
              <li key={l.nom} className="flex items-center gap-2 text-black/70">
                <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: l.couleur }} />
                <span className="leading-tight">{l.nom}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function contenuPopup(p: Record<string, any>): string {
  const esc = (s: any) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const ligne = (label: string, val: any) =>
    val == null || val === "" ? "" : `<div style="display:flex;gap:8px;justify-content:space-between"><span style="color:#6b7280">${label}</span><span style="font-weight:500;text-align:right">${esc(val)}</span></div>`;
  const titre = (t: string) => `<div style="font-weight:600;color:#1b3a13;margin-bottom:4px">${t}</div>`;

  switch (p.couche) {
    case "peuplement":
      return titre(p.appellation ?? "Peuplement") +
        ligne("Essences", p.essences) +
        ligne("Superficie", p.superficie_ha != null ? `${p.superficie_ha} ha` : null) +
        ligne("Âge", p.classe_age);
    case "travaux":
      return titre("Travaux réalisés") + ligne("Superficie", p.hectares != null ? `${p.hectares} ha` : null);
    case "prescription":
      return titre("Prescription " + (p.no_prescription ?? "")) +
        ligne("Statut", p.statut) +
        ligne("Superficie", p.hectares != null ? `${p.hectares} ha` : null);
    case "propriete":
      return titre("Limites de la propriété");
    default:
      return titre("Élément");
  }
}
