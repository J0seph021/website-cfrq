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

export default function CarteForet({ data, bbox }: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<maplibregl.Map | null>(null);
  const [visibles, setVisibles] = useState<Record<string, boolean>>({
    peuplement: true, travaux: true, prescription: true, propriete: true,
  });
  // Sur mobile, les panneaux démarrent repliés pour laisser voir la carte.
  const [couchesOuvert, setCouchesOuvert] = useState(!estPetitEcran());
  const [legendeOuverte, setLegendeOuverte] = useState(!estPetitEcran());

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
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    if (!estPetitEcran()) map.scrollZoom.disable();

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

      if (bbox && bbox.length === 4) {
        map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 30, animate: false });
      }

      const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "290px" });
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

    const onResize = () => map.resize();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); map.remove(); carte.current = null; };
  }, [data, bbox, couleurPeuplement]);

  function basculer(id: string) {
    setVisibles((v) => {
      const nv = { ...v, [id]: !v[id] };
      const map = carte.current;
      if (map) {
        const l = id === "prescription" ? "prescription-line" : id === "propriete" ? "propriete-line" : `${id}-fill`;
        if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", nv[id] ? "visible" : "none");
      }
      return nv;
    });
  }

  const pastille = (id: string) => {
    if (id === "travaux") return { background: COULEUR_TRAVAUX, border: "none" };
    if (id === "prescription") return { background: "transparent", border: `2px dashed ${COULEUR_PRESCRIPTION}` };
    if (id === "propriete") return { background: "transparent", border: "2px solid #b9c2cc" };
    return { background: "#558b2f", border: "none" };
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-black/5 bg-cfrq-deep">
      <div ref={conteneur} className="h-[68vh] min-h-[460px] w-full sm:h-[560px]" />

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
          </div>
        ) : (
          <button onClick={() => setCouchesOuvert(true)}
            className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-2 text-[13px] font-medium text-cfrq-deep shadow-lg backdrop-blur">
            <span aria-hidden>▦</span> Couches
          </button>
        )}
      </div>

      {/* Légende des peuplements (repliable) */}
      {legende.length > 0 && visibles.peuplement && (
        <div className="absolute bottom-8 right-2 sm:bottom-3 sm:right-3">
          {legendeOuverte ? (
            <div className="max-h-[42vh] max-w-[230px] overflow-auto rounded-xl bg-white/95 p-3 text-[12px] shadow-lg backdrop-blur sm:max-h-[200px]">
              <button onClick={() => setLegendeOuverte(false)}
                className="mb-1.5 flex w-full items-center justify-between gap-4 font-medium text-cfrq-deep">
                Types de peuplement <span aria-hidden className="text-black/40">✕</span>
              </button>
              <ul className="space-y-1">
                {legende.map((l) => (
                  <li key={l.nom} className="flex items-center gap-2 text-black/70">
                    <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: l.couleur }} />
                    <span className="leading-tight">{l.nom}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <button onClick={() => setLegendeOuverte(true)}
              className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-2 text-[12px] font-medium text-cfrq-deep shadow-lg backdrop-blur">
              <span aria-hidden>🎨</span> Légende
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const STATUTS: Record<string, string> = {
  demande: "Demande", en_execution: "En exécution", rapport_soumis: "Rapport soumis",
  approuve: "Approuvé", refuse: "Refusé", paye: "Payé", complete: "Complété",
};

function contenuPopup(p: Record<string, any>): string {
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
        ligne("Priorité", p.priorite)
      );
    case "travaux":
      return wrap(titre("Travaux réalisés") + ligne("Superficie", p.hectares, " ha"));
    case "prescription":
      return wrap(
        titre("Prescription sylvicole", p.no_prescription ? `nº ${p.no_prescription}` : "") +
        ligne("Statut", STATUTS[p.statut] ?? p.statut) +
        ligne("Superficie", p.hectares, " ha") +
        (p.codes_travaux
          ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #eee"><span style="color:#6b7280">Traitements prescrits</span><div style="font-weight:600;color:#2f7d32">${esc(p.codes_travaux)}</div></div>`
          : "") +
        ligne("Programme", p.programmes) +
        ligne("Lots", p.lots) +
        ligne("Prescrit par", p.prescrit_par) +
        ligne("Date du rapport", p.date_rapport)
      );
    case "propriete":
      return wrap(titre("Limites de la propriété"));
    default:
      return wrap(titre("Élément"));
  }
}
