// Dossier FICTIF pour la page de démonstration de l'espace client
// (/espace-client/demo, servie seulement par le serveur de développement, voir
// astro.config.mjs). Même forme que ce que EspaceClient charge de Supabase, avec
// des données inventées : aucune personne, aucun lot, aucun document réel.
//
// Sert à voir et tester le tableau de bord sans compte ni connexion. Les documents
// n'ont pas de fichier (storage_path null) : leurs boutons sont inactifs.
import type { Dossier } from "../components/EspaceClient";

// Petit rectangle en degrés autour d'un point de Saint-Raymond (fictif).
function rectangle(lon: number, lat: number, dLon: number, dLat: number) {
  return {
    type: "Polygon",
    coordinates: [[[lon, lat], [lon + dLon, lat], [lon + dLon, lat + dLat], [lon, lat + dLat], [lon, lat]]],
  };
}

const LON = -71.84;
const LAT = 46.9;

const features = [
  { type: "Feature", geometry: rectangle(LON, LAT, 0.012, 0.006), properties: { couche: "propriete", nom: "Propriété 01" } },
  { type: "Feature", geometry: rectangle(LON, LAT, 0.006, 0.006), properties: { couche: "peuplement", appellation: "Érablière à bouleau jaune", hectares: 24.1, classe_age: "70 ans", densite: "B", hauteur_m: 19 } },
  { type: "Feature", geometry: rectangle(LON + 0.006, LAT, 0.004, 0.006), properties: { couche: "peuplement", appellation: "Sapinière à bouleau blanc", hectares: 12.4, classe_age: "50 ans", densite: "C", hauteur_m: 14 } },
  { type: "Feature", geometry: rectangle(LON + 0.01, LAT, 0.002, 0.006), properties: { couche: "peuplement", appellation: "Agricole", hectares: 6.1 } },
  { type: "Feature", geometry: { type: "LineString", coordinates: [[LON + 0.001, LAT + 0.001], [LON + 0.009, LAT + 0.005]] }, properties: { couche: "hydro", type: "Ruisseau intermittent" } },
  { type: "Feature", geometry: rectangle(LON + 0.006, LAT + 0.001, 0.003, 0.003), properties: { couche: "travaux", traitement: "Éclaircie précommerciale", annee: 2024, hectares: 3.2 } },
];

export const dossierDemo: Dossier = {
  producteur: { id: 0, nom: "TREMBLAY JEAN", no_prod: "DEMO-2041", statut: "Producteur forestier reconnu", type_proprio: "Individu" },
  proprietes: [
    { id: 1, producteur_id: 0, no_propriete: "01", municipalite: "Saint-Raymond", mrc: "Portneuf", region: "Capitale-Nationale", superficie_totale: 42.6, superficie_boisee: null },
    { id: 2, producteur_id: 0, no_propriete: "02", municipalite: "Saint-Raymond", mrc: "Portneuf", region: "Capitale-Nationale", superficie_totale: 18.3, superficie_boisee: null },
  ],
  lots: [
    { id: 1, propriete_id: 1, no_lot: "9 999 001", municipalite: "Saint-Raymond", superficie_totale: 30.2 },
    { id: 2, propriete_id: 1, no_lot: "9 999 002", municipalite: "Saint-Raymond", superficie_totale: 12.4 },
    { id: 3, propriete_id: 2, no_lot: "9 999 010", municipalite: "Saint-Raymond", superficie_totale: 18.3 },
  ],
  paf: [],
  travaux: [],
  documents: [
    { id: 1, producteur_id: 0, type_document: "paf", nom_document: "Plan d'aménagement forestier 2021 (lot 9999001)", date_document: "2021", reference: null, storage_path: null, taille: "2 140 Ko" },
    { id: 2, producteur_id: 0, type_document: "paf", nom_document: "Plan d'aménagement forestier 2021 (lot 9999010)", date_document: "2021", reference: null, storage_path: null, taille: "1 870 Ko" },
    { id: 3, producteur_id: 0, type_document: "prescription", nom_document: "Prescription sylvicole 2024", date_document: "2024", reference: "9990000240012", storage_path: null, taille: "410 Ko" },
    { id: 4, producteur_id: 0, type_document: "prescription", nom_document: "Prescription sylvicole 2025 (version 2)", date_document: "2025", reference: "9990000250004", storage_path: null, taille: "388 Ko" },
    { id: 5, producteur_id: 0, type_document: "prescription", nom_document: "Prescription sylvicole 2025", date_document: "2025", reference: "9990000250004", storage_path: null, taille: "372 Ko" },
    { id: 6, producteur_id: 0, type_document: "rapport", nom_document: "Rapport d'exécution, octobre 2024", date_document: "2024", reference: "9990000240012", storage_path: null, taille: "295 Ko" },
    { id: 7, producteur_id: 0, type_document: "rapport", nom_document: "Rapport d'exécution, juillet 2025", date_document: "2025", reference: "9990000250004", storage_path: null, taille: "301 Ko" },
    { id: 8, producteur_id: 0, type_document: "rtf", nom_document: "Rapport de taxes foncières 2024", date_document: "2024", reference: null, storage_path: null, taille: "120 Ko" },
    { id: 9, producteur_id: 0, type_document: "rtf", nom_document: "Rapport de taxes foncières 2025 (1 de 2)", date_document: "2025", reference: null, storage_path: null, taille: "118 Ko" },
    { id: 10, producteur_id: 0, type_document: "rtf", nom_document: "Rapport de taxes foncières 2025 (2 de 2)", date_document: "2025", reference: null, storage_path: null, taille: "121 Ko" },
  ],
  carte: {
    geojson: { type: "FeatureCollection", features },
    bbox: [LON, LAT, LON + 0.012, LAT + 0.006],
  },
  bilan: {
    producteur_id: 0, total_valeur: 18450, total_aide: 14200, total_part: 4250,
    superficie_ha: 9.2, nb_traitements: 3, annee_min: 2023, annee_max: 2025,
  },
};
