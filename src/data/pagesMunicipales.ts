// Pages « Ingénieur forestier à {municipalité} » (/ingenieur-forestier/...).
//
// Pourquoi ces pages : Search Console montre que les propriétaires cherchent
// « ingénieur forestier » suivi du nom de leur ville. Sans page qui vise ces
// requêtes, CFRQ n'apparaît jamais dessus, même là où l'équipe travaille
// toutes les semaines (voir DOSSIER_requetes_municipalites.md).
//
// Ce qui les distingue d'un gabarit rempli à la chaîne : chaque page porte les
// travaux réellement faits dans la municipalité, tirés de PlaniLogix. Aucun
// concurrent ne peut écrire ces chiffres.
//
// Source : PlaniLogix, extraction du 2026-09-30. Un « dossier » est une
// prescription sylvicole, un plan d'aménagement ou une visite-conseil dont au
// moins un lot est situé dans la municipalité (prescription_lot.ville, qui
// contient le code géographique officiel, joint à la table municipalites).
// Les familles de travaux regroupent les codes de traitement du SIGGA
// (sigga.travaux.groupe et description).
//
// Vie privée : on publie des nombres de dossiers, jamais de propriétés ni de
// propriétaires. Dans une petite municipalité, « 1 propriété » désignerait un
// client. Seuil de publication : 10 dossiers et plus.
//
// Première vague : région de Québec, Portneuf et Mauricie (équipe Rive nord).

export type FamilleTravaux =
  | "recolte"
  | "feuillus"
  | "recuperation"
  | "eclaircieCom"
  | "eclairciePrecom"
  | "reboisement"
  | "degagement"
  | "paf";

export const FAMILLES: Record<FamilleTravaux, { titre: string; texte: string; lien: string }> = {
  recolte: {
    titre: "Récolte et coupes partielles",
    texte: "Martelage, coupes progressives et supervision du chantier : on choisit les arbres à récolter pour tirer la valeur du bois tout en gardant un boisé en santé.",
    lien: "/operation-forestieres",
  },
  feuillus: {
    titre: "Érablières et feuillus d'ombre",
    texte: "Jardinage et coupes progressives dans les peuplements d'érable à sucre, de bouleau jaune et de hêtre : le couvert forestier reste en place et les meilleurs arbres prennent de la valeur.",
    lien: "/amenagement",
  },
  recuperation: {
    titre: "Récupération après perturbation",
    texte: "Chablis, verglas ou insectes : on récupère le bois atteint avant qu'il perde sa valeur, puis on prépare la suite du peuplement.",
    lien: "/operation-forestieres",
  },
  eclaircieCom: {
    titre: "Éclaircie commerciale",
    texte: "Dans les plantations et les jeunes peuplements résineux, on retire une partie des tiges pour faire grossir les meilleures. Le bois récolté se vend déjà.",
    lien: "/operation-forestieres",
  },
  eclairciePrecom: {
    titre: "Éclaircie précommerciale",
    texte: "Dans une jeune forêt trop dense, on espace les tiges pour accélérer la croissance des arbres d'avenir.",
    lien: "/amenagement",
  },
  reboisement: {
    titre: "Reboisement",
    texte: "Plantation d'essences adaptées au terrain, avec les plants et l'aide financière des programmes.",
    lien: "/amenagement",
  },
  degagement: {
    titre: "Dégagement de plantations",
    texte: "Les premières années, on libère les jeunes plants de la végétation concurrente pour qu'ils prennent le dessus.",
    lien: "/amenagement",
  },
  paf: {
    titre: "Plans d'aménagement forestier",
    texte: "Le portrait complet du boisé et les travaux recommandés pour les dix prochaines années. C'est la porte d'entrée vers l'aide financière.",
    lien: "/amenagement",
  },
};

/** Première phrase de la section « nos travaux », selon la famille dominante. */
export const PROFIL: Record<FamilleTravaux, string> = {
  recolte: "la récolte planifiée est au cœur de nos mandats : martelage, coupes partielles et supervision des chantiers.",
  feuillus: "une bonne partie de nos mandats touche les érablières et les peuplements de feuillus d'ombre.",
  recuperation: "une bonne partie de nos mandats consiste à récupérer le bois après un chablis, un verglas ou une épidémie d'insectes.",
  eclaircieCom: "nos mandats portent souvent sur l'éclaircie des plantations arrivées à l'âge de produire du bois.",
  eclairciePrecom: "nos mandats portent souvent sur les jeunes forêts à éclaircir.",
  reboisement: "le reboisement occupe une place importante dans nos mandats.",
  degagement: "nos mandats portent beaucoup sur les jeunes plantations : dégagement, entretien et suivi.",
  paf: "beaucoup de propriétaires commencent par un plan d'aménagement forestier.",
};

export type Mrc =
  | "Québec"
  | "La Jacques-Cartier"
  | "L'Île-d'Orléans"
  | "La Côte-de-Beaupré"
  | "Portneuf"
  | "Mékinac";

/** Ordre d'affichage des MRC, du plus près au plus loin du bureau. */
export const ORDRE_MRC: Mrc[] = ["Québec", "La Jacques-Cartier", "L'Île-d'Orléans", "La Côte-de-Beaupré", "Portneuf", "Mékinac"];

export const MRC_INFO: Record<Mrc, { region: "Capitale-Nationale" | "Mauricie"; agence: string; contexte: string; equipe: string[] }> = {
  Québec: {
    region: "Capitale-Nationale",
    agence: "Agence des forêts privées de Québec 03",
    contexte:
      "Dans l'agglomération de Québec, les boisés privés sont des boisés de proximité, souvent entourés de quartiers ou de terres agricoles. Chaque intervention doit tenir compte des voisins, des sentiers et de la réglementation municipale. Notre bureau de L'Ancienne-Lorette est à quelques minutes.",
    equipe: ["simon-proulx", "jean-benoit-girard", "alexandre-bouillon", "christian-dumont"],
  },
  "La Jacques-Cartier": {
    region: "Capitale-Nationale",
    agence: "Agence des forêts privées de Québec 03",
    contexte:
      "Au nord de Québec, la MRC de La Jacques-Cartier est un territoire de collines et de lacs où les boisés côtoient les résidences et les chalets. Beaucoup de propriétaires y veulent d'abord une forêt en santé et belle à parcourir, puis tirer profit des arbres mûrs sans dénaturer le paysage.",
    equipe: ["simon-proulx", "alexandre-bouillon", "jean-benoit-girard", "christian-dumont"],
  },
  "L'Île-d'Orléans": {
    region: "Capitale-Nationale",
    agence: "Agence des forêts privées de Québec 03",
    contexte:
      "Sur l'île d'Orléans, les boisés font partie du paysage agricole et patrimonial : érablières, boisés de ferme et bandes boisées entre les terres. On y aménage avec soin, en gardant le caractère de l'île.",
    equipe: ["simon-proulx", "jean-benoit-girard", "alexandre-bouillon", "christian-dumont"],
  },
  "La Côte-de-Beaupré": {
    region: "Capitale-Nationale",
    agence: "Agence des forêts privées de Québec 03",
    contexte:
      "Sur la Côte-de-Beaupré, les boisés privés s'étagent entre le fleuve et les premiers contreforts des Laurentides, souvent sur des terrains en pente où l'accès et le drainage demandent une bonne planification.",
    equipe: ["simon-proulx", "jean-benoit-girard", "alexandre-bouillon", "christian-dumont"],
  },
  Portneuf: {
    region: "Capitale-Nationale",
    agence: "Agence des forêts privées de Québec 03",
    contexte:
      "Entre Québec et la Mauricie, la MRC de Portneuf passe des basses terres du Saint-Laurent, avec leurs boisés de ferme et leurs érablières, aux collines boisées des Laurentides au nord. Christian Dumont, technicien forestier de notre équipe, est installé dans Portneuf.",
    equipe: ["christian-dumont", "simon-proulx", "jean-benoit-girard", "alexandre-bouillon"],
  },
  Mékinac: {
    region: "Mauricie",
    agence: "Agence régionale de mise en valeur des forêts privées mauriciennes",
    contexte:
      "Dans Mékinac, en Mauricie, la forêt occupe l'essentiel du territoire, entre lacs de villégiature et vallées agricoles. La tradition forestière y est forte, et bien des boisés privés sont aussi des terrains de villégiature.",
    equipe: ["christian-dumont", "simon-proulx", "jean-benoit-girard", "alexandre-bouillon"],
  },
};

export interface PageMunicipale {
  slug: string;
  nom: string;
  mrc: Mrc;
  /** Dossiers dont un lot est dans la municipalité (voir l'en-tête). */
  dossiers: number;
  /** Première année de rapport dans PlaniLogix pour ces dossiers. */
  depuis: number;
  /** Dossiers par famille de travaux, du plus fréquent au moins fréquent. */
  travaux: Partial<Record<FamilleTravaux, number>>;
}

export const ANNEE_DONNEES = 2026;

export const PAGES_MUNICIPALES: PageMunicipale[] = [
  { slug: "saint-leonard-de-portneuf", nom: "Saint-Léonard-de-Portneuf", mrc: "Portneuf", dossiers: 95, depuis: 2021, travaux: { recolte: 30, feuillus: 13, eclaircieCom: 11, recuperation: 11, eclairciePrecom: 7, degagement: 5, reboisement: 5, paf: 1 } },
  { slug: "saint-raymond", nom: "Saint-Raymond", mrc: "Portneuf", dossiers: 71, depuis: 2021, travaux: { recolte: 32, recuperation: 9, feuillus: 8, degagement: 5, eclaircieCom: 4, eclairciePrecom: 3, reboisement: 1, paf: 1 } },
  { slug: "sainte-christine-d-auvergne", nom: "Sainte-Christine-d'Auvergne", mrc: "Portneuf", dossiers: 58, depuis: 2020, travaux: { recolte: 10, recuperation: 9, feuillus: 8, eclairciePrecom: 7, paf: 6, eclaircieCom: 3, degagement: 2, reboisement: 1 } },
  { slug: "quebec", nom: "Québec", mrc: "Québec", dossiers: 51, depuis: 2022, travaux: { recolte: 15, feuillus: 11, paf: 7, recuperation: 5, reboisement: 2, degagement: 1 } },
  { slug: "saint-ubalde", nom: "Saint-Ubalde", mrc: "Portneuf", dossiers: 42, depuis: 2022, travaux: { feuillus: 21, recuperation: 9, recolte: 7, eclaircieCom: 5, eclairciePrecom: 4, degagement: 2, paf: 2, reboisement: 2 } },
  { slug: "sainte-brigitte-de-laval", nom: "Sainte-Brigitte-de-Laval", mrc: "La Jacques-Cartier", dossiers: 34, depuis: 2023, travaux: { feuillus: 12, recolte: 8, recuperation: 5 } },
  { slug: "stoneham-et-tewkesbury", nom: "Stoneham-et-Tewkesbury", mrc: "La Jacques-Cartier", dossiers: 26, depuis: 2022, travaux: { feuillus: 6, recolte: 5, paf: 3, eclaircieCom: 2, recuperation: 2 } },
  { slug: "riviere-a-pierre", nom: "Rivière-à-Pierre", mrc: "Portneuf", dossiers: 25, depuis: 2022, travaux: { recolte: 9, eclairciePrecom: 5, eclaircieCom: 3, paf: 3, feuillus: 1 } },
  { slug: "saint-gilbert", nom: "Saint-Gilbert", mrc: "Portneuf", dossiers: 25, depuis: 2022, travaux: { recolte: 14, degagement: 3, eclaircieCom: 3, feuillus: 3, paf: 1, reboisement: 1, recuperation: 1 } },
  { slug: "deschambault-grondines", nom: "Deschambault-Grondines", mrc: "Portneuf", dossiers: 24, depuis: 2021, travaux: { recolte: 12, degagement: 3, feuillus: 3, eclaircieCom: 2, paf: 2, reboisement: 2, recuperation: 2 } },
  { slug: "saint-alban", nom: "Saint-Alban", mrc: "Portneuf", dossiers: 22, depuis: 2022, travaux: { degagement: 4, recolte: 4, feuillus: 3, paf: 3, reboisement: 3, recuperation: 1 } },
  { slug: "portneuf", nom: "Portneuf", mrc: "Portneuf", dossiers: 22, depuis: 2019, travaux: { recolte: 12, eclaircieCom: 3, degagement: 2, recuperation: 2, eclairciePrecom: 1, feuillus: 1, paf: 1, reboisement: 1 } },
  { slug: "sainte-famille-de-l-ile-d-orleans", nom: "Sainte-Famille-de-l'Île-d'Orléans", mrc: "L'Île-d'Orléans", dossiers: 20, depuis: 2023, travaux: { recolte: 11, feuillus: 8, paf: 1 } },
  { slug: "lac-beauport", nom: "Lac-Beauport", mrc: "La Jacques-Cartier", dossiers: 19, depuis: 2023, travaux: { feuillus: 11, recolte: 6, paf: 1 } },
  { slug: "notre-dame-de-montauban", nom: "Notre-Dame-de-Montauban", mrc: "Mékinac", dossiers: 19, depuis: 2023, travaux: { degagement: 6, reboisement: 6, feuillus: 3, recuperation: 3, recolte: 2 } },
  { slug: "cap-sante", nom: "Cap-Santé", mrc: "Portneuf", dossiers: 15, depuis: 2022, travaux: { degagement: 7, eclaircieCom: 3, feuillus: 3, recolte: 3, reboisement: 1 } },
  { slug: "saint-augustin-de-desmaures", nom: "Saint-Augustin-de-Desmaures", mrc: "Québec", dossiers: 14, depuis: 2023, travaux: { feuillus: 7, reboisement: 2, paf: 1, recuperation: 1 } },
  { slug: "saint-gabriel-de-valcartier", nom: "Saint-Gabriel-de-Valcartier", mrc: "La Jacques-Cartier", dossiers: 14, depuis: 2024, travaux: { degagement: 5, recolte: 3, eclairciePrecom: 2, feuillus: 1, reboisement: 1, recuperation: 1 } },
  { slug: "saint-basile", nom: "Saint-Basile", mrc: "Portneuf", dossiers: 14, depuis: 2022, travaux: { recolte: 5, eclaircieCom: 4, degagement: 3, feuillus: 3, paf: 1, recuperation: 1 } },
  { slug: "lac-aux-sables", nom: "Lac-aux-Sables", mrc: "Mékinac", dossiers: 13, depuis: 2022, travaux: { feuillus: 3, recuperation: 3, eclaircieCom: 1, recolte: 1 } },
  { slug: "chateau-richer", nom: "Château-Richer", mrc: "La Côte-de-Beaupré", dossiers: 12, depuis: 2022, travaux: { feuillus: 3, recolte: 3, paf: 1, reboisement: 1 } },
  { slug: "pont-rouge", nom: "Pont-Rouge", mrc: "Portneuf", dossiers: 11, depuis: 2022, travaux: { recolte: 9, eclaircieCom: 1, paf: 1 } },
  { slug: "neuville", nom: "Neuville", mrc: "Portneuf", dossiers: 10, depuis: 2022, travaux: { recolte: 4, reboisement: 2, degagement: 1, eclaircieCom: 1, paf: 1 } },
];

/** Familles de travaux triées, les plus fréquentes d'abord. */
export function travauxTries(p: PageMunicipale): [FamilleTravaux, number][] {
  return (Object.entries(p.travaux) as [FamilleTravaux, number][]).sort((a, b) => b[1] - a[1]);
}

/** Les autres pages de la même MRC, pour le maillage interne. */
export function voisines(p: PageMunicipale): PageMunicipale[] {
  return PAGES_MUNICIPALES.filter((q) => q.mrc === p.mrc && q.slug !== p.slug);
}
