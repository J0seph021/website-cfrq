// Pages « Ingénieur forestier dans {secteur} » (/ingenieur-forestier/...).
//
// Pourquoi ces pages : Search Console montre que les propriétaires cherchent
// « ingénieur forestier » suivi du nom de leur ville ou de leur région. Sans
// page qui vise ces requêtes, CFRQ n'apparaît jamais dessus, même là où
// l'équipe travaille toutes les semaines.
//
// Une page par secteur (MRC, ou région pour la Mauricie) plutôt qu'une page
// par municipalité : sans chiffres, des pages municipales seraient presque
// identiques d'une ville à l'autre, ce que Google traite comme des pages
// satellites. Chaque page de secteur nomme plutôt toutes les municipalités où
// l'on travaille, avec une ancre par municipalité (/portneuf/#saint-raymond).
//
// AUCUN NOMBRE, ni sur les pages ni dans ce fichier (le dépôt est public).
// Décision de Joseph, 2026-09-30 : un concurrent qui verrait le volume de
// CFRQ par secteur pourrait cibler ses secteurs forts. On dit qu'on y
// travaille et quels travaux on y fait, jamais combien. Les municipalités sont
// en ordre alphabétique pour que l'ordre ne trahisse pas le volume; les
// familles de travaux sont rangées de la plus fréquente à la moins fréquente.
//
// Source : PlaniLogix, extraction du 2026-09-30. Les lots d'un dossier
// (prescription_lot.ville, qui contient le code géographique officiel) sont
// joints à la table municipalites; les familles regroupent les codes de
// traitement du SIGGA (sigga.travaux.groupe et description). Ce n'est PAS
// relié en direct : pour mettre à jour, refaire l'extraction et modifier ce
// fichier. Une municipalité n'est listée qu'à partir de quelques dossiers,
// pour ne nommer que des endroits où l'on travaille vraiment.
//
// Tout le territoire, découpé par MRC. Regroupements : la Beauce (trois MRC),
// Charlevoix (deux MRC), Montmagny et L'Islet, la Mauricie et la Côte-Nord.
// Écartés faute de dossiers suffisants : Bécancour, Drummond,
// Nicolet-Yamaska et Le Granit.

export type FamilleTravaux =
  | "recolte"
  | "feuillus"
  | "recuperation"
  | "eclaircieCom"
  | "eclairciePrecom"
  | "reboisement"
  | "degagement"
  | "paf";

export const FAMILLES: Record<FamilleTravaux, { titre: string; court: string; texte: string; lien: string }> = {
  recolte: {
    titre: "Récolte et coupes partielles",
    court: "récolte",
    texte: "Martelage, coupes progressives et supervision du chantier : on choisit les arbres à récolter pour tirer la valeur du bois tout en gardant un boisé en santé.",
    lien: "/operation-forestieres",
  },
  feuillus: {
    titre: "Érablières et feuillus d'ombre",
    court: "érablières et feuillus",
    texte: "Jardinage et coupes progressives dans les peuplements d'érable à sucre, de bouleau jaune et de hêtre : le couvert forestier reste en place et les meilleurs arbres prennent de la valeur.",
    lien: "/amenagement",
  },
  recuperation: {
    titre: "Récupération après perturbation",
    court: "récupération",
    texte: "Chablis, verglas ou insectes : on récupère le bois atteint avant qu'il perde sa valeur, puis on prépare la suite du peuplement.",
    lien: "/operation-forestieres",
  },
  eclaircieCom: {
    titre: "Éclaircie commerciale",
    court: "éclaircie commerciale",
    texte: "Dans les plantations et les jeunes peuplements résineux, on retire une partie des tiges pour faire grossir les meilleures. Le bois récolté se vend déjà.",
    lien: "/operation-forestieres",
  },
  eclairciePrecom: {
    titre: "Éclaircie précommerciale",
    court: "éclaircie précommerciale",
    texte: "Dans une jeune forêt trop dense, on espace les tiges pour accélérer la croissance des arbres d'avenir.",
    lien: "/amenagement",
  },
  reboisement: {
    titre: "Reboisement",
    court: "reboisement",
    texte: "Plantation d'essences adaptées au terrain, avec les plants et l'aide financière des programmes.",
    lien: "/amenagement",
  },
  degagement: {
    titre: "Dégagement de plantations",
    court: "dégagement de plantations",
    texte: "Les premières années, on libère les jeunes plants de la végétation concurrente pour qu'ils prennent le dessus.",
    lien: "/amenagement",
  },
  paf: {
    titre: "Plans d'aménagement forestier",
    court: "plan d'aménagement",
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

export interface Municipalite {
  nom: string;
  /** Familles de travaux, de la plus fréquente à la moins fréquente (vide : visites-conseils seulement). */
  travaux: FamilleTravaux[];
}

export type Region = "Capitale-Nationale" | "Côte-Nord" | "Mauricie" | "Chaudière-Appalaches" | "Centre-du-Québec";

/** Ordre des régions dans les listes. */
export const REGIONS: Region[] = ["Capitale-Nationale", "Chaudière-Appalaches", "Centre-du-Québec", "Mauricie", "Côte-Nord"];

export interface Secteur {
  slug: string;
  /** Nom court du secteur, pour les listes et les liens. */
  nom: string;
  /** Complément de lieu : « dans Portneuf », « à l'île d'Orléans »... */
  dans: string;
  /** Nom administratif, pour le fil d'Ariane et les données structurées. */
  etiquette: string;
  region: Region;
  /** Équipe qui couvre le secteur, telle que nommée sur /notre-equipe/. */
  rive: "Rive nord" | "Rive sud";
  agence: string;
  contexte: string;
  /** Ids de /notre-equipe/, le plus local d'abord. */
  equipe: string[];
  /** Municipalités citées dans la description Google (les plus connues, pas les plus actives). */
  vedettes: string[];
  travaux: FamilleTravaux[];
  municipalites: Municipalite[];
}

const AGENCE_03 = "Agence des forêts privées de Québec 03";
const EQUIPE_QUEBEC = ["simon-proulx", "jean-benoit-girard", "alexandre-bouillon", "christian-dumont"];
const EQUIPE_PORTNEUF = ["christian-dumont", "simon-proulx", "jean-benoit-girard", "alexandre-bouillon"];
const EQUIPE_APPALACHES = ["pierre-cadorette", "gabrielle-kelly-poulin", "cedric-maheu", "camay-boisvert"];
const EQUIPE_CHAUDIERE = ["cedric-maheu", "camay-boisvert", "ann-renee-rheaume", "mathieu-jolibois"];
const EQUIPE_BOIS_FRANCS = ["frank-olivier-soucy", "ann-renee-rheaume", "louis-chabot", "camay-boisvert"];
const AGENCE_APPALACHES = "Agence de mise en valeur des forêts privées des Appalaches";
const AGENCE_CHAUDIERE = "Agence régionale de mise en valeur des forêts privées de la Chaudière";
const AGENCE_BOIS_FRANCS = "Agence forestière des Bois-Francs";

/** Ordre d'affichage : du bureau de L'Ancienne-Lorette vers l'extérieur. */
export const SECTEURS: Secteur[] = [
  {
    slug: "quebec",
    nom: "Québec",
    dans: "à Québec",
    etiquette: "Agglomération de Québec",
    region: "Capitale-Nationale",
    rive: "Rive nord",
    agence: AGENCE_03,
    contexte:
      "Dans l'agglomération de Québec, les boisés privés sont des boisés de proximité, souvent entourés de quartiers ou de terres agricoles. Chaque intervention doit tenir compte des voisins, des sentiers et de la réglementation municipale. Notre bureau de L'Ancienne-Lorette est à quelques minutes.",
    equipe: EQUIPE_QUEBEC,
    vedettes: ["Saint-Augustin-de-Desmaures"],
    travaux: ["feuillus", "recolte", "paf", "recuperation", "reboisement", "degagement"],
    municipalites: [
      { nom: "Québec", travaux: ["recolte", "feuillus", "paf", "recuperation", "reboisement", "degagement"] },
      { nom: "Saint-Augustin-de-Desmaures", travaux: ["feuillus", "reboisement", "paf", "recuperation"] },
    ],
  },
  {
    slug: "la-jacques-cartier",
    nom: "La Jacques-Cartier",
    dans: "dans La Jacques-Cartier",
    etiquette: "MRC de La Jacques-Cartier",
    region: "Capitale-Nationale",
    rive: "Rive nord",
    agence: AGENCE_03,
    contexte:
      "Au nord de Québec, la MRC de La Jacques-Cartier est un territoire de collines et de lacs où les boisés côtoient les résidences et les chalets. Beaucoup de propriétaires y veulent d'abord une forêt en santé et belle à parcourir, puis tirer profit des arbres mûrs sans dénaturer le paysage.",
    equipe: ["simon-proulx", "alexandre-bouillon", "jean-benoit-girard", "christian-dumont"],
    vedettes: ["Stoneham-et-Tewkesbury", "Lac-Beauport", "Sainte-Brigitte-de-Laval"],
    travaux: ["feuillus", "recolte", "recuperation", "paf", "degagement", "eclaircieCom", "eclairciePrecom", "reboisement"],
    municipalites: [
      { nom: "Lac-Beauport", travaux: ["feuillus", "recolte", "paf"] },
      { nom: "Lac-Delage", travaux: ["feuillus"] },
      { nom: "Saint-Gabriel-de-Valcartier", travaux: ["degagement", "recolte", "eclairciePrecom", "feuillus", "reboisement", "recuperation"] },
      { nom: "Sainte-Brigitte-de-Laval", travaux: ["feuillus", "recolte", "recuperation"] },
      { nom: "Sainte-Catherine-de-la-Jacques-Cartier", travaux: ["paf"] },
      { nom: "Stoneham-et-Tewkesbury", travaux: ["feuillus", "recolte", "paf", "eclaircieCom", "recuperation"] },
    ],
  },
  {
    slug: "ile-d-orleans",
    nom: "Île d'Orléans",
    dans: "à l'île d'Orléans",
    etiquette: "MRC de L'Île-d'Orléans",
    region: "Capitale-Nationale",
    rive: "Rive nord",
    agence: AGENCE_03,
    contexte:
      "Sur l'île d'Orléans, les boisés font partie du paysage agricole et patrimonial : érablières, boisés de ferme et bandes boisées entre les terres. On y aménage avec soin, en gardant le caractère de l'île.",
    equipe: EQUIPE_QUEBEC,
    vedettes: ["Sainte-Famille", "Saint-Jean", "Saint-Pierre"],
    travaux: ["recolte", "feuillus", "degagement", "eclaircieCom", "paf", "reboisement", "recuperation"],
    municipalites: [
      { nom: "Saint-Jean-de-l'Île-d'Orléans", travaux: ["degagement", "eclaircieCom", "reboisement", "recolte"] },
      { nom: "Saint-Pierre-de-l'Île-d'Orléans", travaux: ["feuillus"] },
      { nom: "Sainte-Famille-de-l'Île-d'Orléans", travaux: ["recolte", "feuillus", "paf"] },
    ],
  },
  {
    slug: "cote-de-beaupre",
    nom: "Côte-de-Beaupré",
    dans: "sur la Côte-de-Beaupré",
    etiquette: "MRC de La Côte-de-Beaupré",
    region: "Capitale-Nationale",
    rive: "Rive nord",
    agence: AGENCE_03,
    contexte:
      "Sur la Côte-de-Beaupré, les boisés privés s'étagent entre le fleuve et les premiers contreforts des Laurentides, souvent sur des terrains en pente où l'accès et le drainage demandent une bonne planification.",
    equipe: EQUIPE_QUEBEC,
    vedettes: ["Château-Richer", "L'Ange-Gardien", "Boischatel"],
    travaux: ["feuillus", "recolte", "paf", "reboisement", "degagement"],
    municipalites: [
      { nom: "Boischatel", travaux: ["degagement"] },
      { nom: "Château-Richer", travaux: ["feuillus", "recolte", "paf", "reboisement"] },
      { nom: "L'Ange-Gardien", travaux: ["feuillus", "recolte", "paf"] },
      { nom: "Saint-Ferréol-les-Neiges", travaux: ["paf", "reboisement"] },
    ],
  },
  {
    slug: "portneuf",
    nom: "Portneuf",
    dans: "dans Portneuf",
    etiquette: "MRC de Portneuf",
    region: "Capitale-Nationale",
    rive: "Rive nord",
    agence: AGENCE_03,
    contexte:
      "Entre Québec et la Mauricie, la MRC de Portneuf passe des basses terres du Saint-Laurent, avec leurs boisés de ferme et leurs érablières, aux collines boisées des Laurentides au nord. Christian Dumont, technicien forestier de notre équipe, est installé dans Portneuf.",
    equipe: EQUIPE_PORTNEUF,
    vedettes: ["Saint-Raymond", "Pont-Rouge", "Saint-Ubalde"],
    travaux: ["recolte", "feuillus", "recuperation", "eclaircieCom", "degagement", "eclairciePrecom", "paf", "reboisement"],
    municipalites: [
      { nom: "Cap-Santé", travaux: ["degagement", "eclaircieCom", "feuillus", "recolte", "reboisement"] },
      { nom: "Deschambault-Grondines", travaux: ["recolte", "degagement", "feuillus", "eclaircieCom", "paf", "reboisement", "recuperation"] },
      { nom: "Lac-Blanc", travaux: ["recolte", "feuillus", "paf"] },
      { nom: "Lac-Sergent", travaux: [] },
      { nom: "Neuville", travaux: ["recolte", "reboisement", "degagement", "eclaircieCom", "paf"] },
      { nom: "Pont-Rouge", travaux: ["recolte", "eclaircieCom", "paf"] },
      { nom: "Portneuf", travaux: ["recolte", "eclaircieCom", "degagement", "recuperation", "eclairciePrecom", "feuillus", "paf", "reboisement"] },
      { nom: "Rivière-à-Pierre", travaux: ["recolte", "eclairciePrecom", "eclaircieCom", "paf", "feuillus"] },
      { nom: "Saint-Alban", travaux: ["degagement", "recolte", "feuillus", "paf", "reboisement", "recuperation"] },
      { nom: "Saint-Basile", travaux: ["recolte", "eclaircieCom", "degagement", "feuillus", "paf", "recuperation"] },
      { nom: "Saint-Casimir", travaux: ["paf", "degagement", "recolte"] },
      { nom: "Saint-Gilbert", travaux: ["recolte", "degagement", "eclaircieCom", "feuillus", "paf", "reboisement", "recuperation"] },
      { nom: "Saint-Léonard-de-Portneuf", travaux: ["recolte", "feuillus", "eclaircieCom", "recuperation", "eclairciePrecom", "degagement", "reboisement", "paf"] },
      { nom: "Saint-Raymond", travaux: ["recolte", "recuperation", "feuillus", "degagement", "eclaircieCom", "eclairciePrecom", "paf", "reboisement"] },
      { nom: "Saint-Thuribe", travaux: ["feuillus", "eclairciePrecom", "degagement", "recuperation"] },
      { nom: "Saint-Ubalde", travaux: ["feuillus", "recuperation", "recolte", "eclaircieCom", "eclairciePrecom", "degagement", "paf", "reboisement"] },
      { nom: "Sainte-Christine-d'Auvergne", travaux: ["recolte", "recuperation", "feuillus", "eclairciePrecom", "paf", "eclaircieCom", "degagement", "reboisement"] },
    ],
  },
  {
    slug: "charlevoix",
    nom: "Charlevoix",
    dans: "dans Charlevoix",
    etiquette: "MRC de Charlevoix et de Charlevoix-Est",
    region: "Capitale-Nationale",
    rive: "Rive nord",
    agence: AGENCE_03,
    contexte:
      "Dans Charlevoix, les boisés privés s'accrochent aux montagnes entre le fleuve et l'arrière-pays, de Baie-Saint-Paul à La Malbaie. Le relief accidenté demande une planification soignée des chemins et des travaux, dans une région reconnue réserve mondiale de la biosphère par l'UNESCO.",
    equipe: EQUIPE_QUEBEC,
    vedettes: ["Baie-Saint-Paul", "La Malbaie", "Les Éboulements"],
    travaux: ["recolte", "paf", "reboisement", "eclairciePrecom", "eclaircieCom", "recuperation", "degagement", "feuillus"],
    municipalites: [
      { nom: "Baie-Saint-Paul", travaux: ["eclairciePrecom", "feuillus", "paf"] },
      { nom: "La Malbaie", travaux: ["recolte", "reboisement", "paf", "eclaircieCom", "recuperation"] },
      { nom: "Les Éboulements", travaux: ["recolte", "paf", "eclaircieCom", "eclairciePrecom"] },
      { nom: "Petite-Rivière-Saint-François", travaux: ["reboisement", "degagement"] },
      { nom: "Saint-Aimé-des-Lacs", travaux: ["recolte", "eclairciePrecom"] },
      { nom: "Saint-Hilarion", travaux: ["recolte", "paf", "eclairciePrecom", "recuperation"] },
      { nom: "Saint-Irénée", travaux: ["recolte", "paf"] },
      { nom: "Saint-Urbain", travaux: ["recolte", "paf", "recuperation"] },
    ],
  },
  {
    slug: "mauricie",
    nom: "Mauricie",
    dans: "en Mauricie",
    etiquette: "Mauricie",
    region: "Mauricie",
    rive: "Rive nord",
    agence: "Agence régionale de mise en valeur des forêts privées mauriciennes",
    contexte:
      "En Mauricie, nos mandats en forêt privée se concentrent dans Mékinac et Les Chenaux, de Notre-Dame-de-Montauban à Saint-Stanislas. La forêt occupe l'essentiel du territoire, entre lacs de villégiature et vallées agricoles, et la tradition forestière y est forte.",
    equipe: EQUIPE_PORTNEUF,
    vedettes: ["Notre-Dame-de-Montauban", "Lac-aux-Sables", "Saint-Stanislas"],
    travaux: ["recolte", "degagement", "feuillus", "recuperation", "reboisement", "eclaircieCom", "paf"],
    municipalites: [
      { nom: "La Tuque", travaux: ["recolte"] },
      { nom: "Lac-aux-Sables", travaux: ["feuillus", "recuperation", "eclaircieCom", "recolte"] },
      { nom: "Notre-Dame-de-Montauban", travaux: ["degagement", "reboisement", "feuillus", "recuperation", "recolte"] },
      { nom: "Saint-Adelphe", travaux: ["degagement", "eclaircieCom", "recolte"] },
      { nom: "Saint-Maurice", travaux: ["recolte"] },
      { nom: "Saint-Stanislas", travaux: ["recolte", "eclaircieCom", "feuillus", "recuperation"] },
      { nom: "Trois-Rives", travaux: ["eclaircieCom", "paf", "recuperation"] },
    ],
  },
  {
    slug: "cote-nord",
    nom: "Côte-Nord",
    dans: "sur la Côte-Nord",
    etiquette: "Haute-Côte-Nord et Manicouagan",
    region: "Côte-Nord",
    rive: "Rive nord",
    agence: "Agence de mise en valeur des forêts privées de la Côte-Nord",
    contexte:
      "Sur la Côte-Nord, la forêt privée occupe une mince bande le long du fleuve, de Longue-Rive à la péninsule de Manicouagan; l'arrière-pays est surtout de la forêt publique. Les boisés y sont en grande partie résineux, et le reboisement y tient une place importante.",
    equipe: EQUIPE_QUEBEC,
    vedettes: ["Longue-Rive", "Portneuf-sur-Mer", "Pointe-Lebel"],
    travaux: ["reboisement", "degagement", "recuperation", "eclairciePrecom"],
    municipalites: [
      { nom: "Longue-Rive", travaux: ["reboisement", "degagement"] },
      { nom: "Pointe-Lebel", travaux: ["reboisement", "recuperation"] },
      { nom: "Portneuf-sur-Mer", travaux: ["reboisement", "eclairciePrecom"] },
    ],
  },
  {
    slug: "levis",
    nom: "Lévis",
    dans: "à Lévis",
    etiquette: "Ville de Lévis",
    region: "Chaudière-Appalaches",
    rive: "Rive sud",
    agence: AGENCE_APPALACHES,
    contexte:
      "À Lévis, les boisés privés se trouvent en bordure des quartiers et des terres agricoles, de Saint-Étienne-de-Lauzon à Pintendre. Ce sont des boisés de proximité, où l'on aménage en tenant compte des voisins, des sentiers et de la réglementation de la ville.",
    equipe: EQUIPE_APPALACHES,
    vedettes: ["Lévis"],
    travaux: ["recolte", "paf", "eclaircieCom", "feuillus", "reboisement", "degagement"],
    municipalites: [
      { nom: "Lévis", travaux: ["recolte", "paf", "eclaircieCom", "feuillus", "reboisement", "degagement"] },
    ],
  },
  {
    slug: "bellechasse",
    nom: "Bellechasse",
    dans: "dans Bellechasse",
    etiquette: "MRC de Bellechasse",
    region: "Chaudière-Appalaches",
    rive: "Rive sud",
    agence: AGENCE_APPALACHES,
    contexte:
      "Dans Bellechasse, les terres montent du fleuve vers le plateau appalachien, de Beaumont à Buckland et Saint-Philémon. Boisés de ferme, érablières et forêts de production s'y côtoient, et la tradition forestière y est bien vivante.",
    equipe: EQUIPE_APPALACHES,
    vedettes: ["Armagh", "Saint-Henri", "Saint-Raphaël"],
    travaux: ["recolte", "degagement", "eclaircieCom", "reboisement", "paf", "feuillus", "eclairciePrecom", "recuperation"],
    municipalites: [
      { nom: "Armagh", travaux: ["recolte", "degagement", "eclaircieCom", "paf", "reboisement", "eclairciePrecom", "feuillus"] },
      { nom: "Beaumont", travaux: ["eclaircieCom", "recolte"] },
      { nom: "Honfleur", travaux: ["eclairciePrecom"] },
      { nom: "Notre-Dame-Auxiliatrice-de-Buckland", travaux: ["degagement", "recolte", "reboisement", "eclaircieCom", "recuperation"] },
      { nom: "Saint-Damien-de-Buckland", travaux: ["degagement", "eclaircieCom", "reboisement", "recolte", "paf"] },
      { nom: "Saint-Henri", travaux: ["feuillus", "eclaircieCom", "paf", "recolte"] },
      { nom: "Saint-Lazare-de-Bellechasse", travaux: ["eclaircieCom", "recolte", "reboisement", "degagement", "paf", "feuillus"] },
      { nom: "Saint-Nazaire-de-Dorchester", travaux: ["recolte", "degagement"] },
      { nom: "Saint-Nérée-de-Bellechasse", travaux: ["recolte", "degagement", "reboisement", "eclaircieCom"] },
      { nom: "Saint-Philémon", travaux: ["degagement", "feuillus", "paf", "reboisement", "eclaircieCom", "recolte"] },
      { nom: "Saint-Raphaël", travaux: ["recolte", "eclaircieCom", "feuillus"] },
    ],
  },
  {
    slug: "les-etchemins",
    nom: "Les Etchemins",
    dans: "dans Les Etchemins",
    etiquette: "MRC des Etchemins",
    region: "Chaudière-Appalaches",
    rive: "Rive sud",
    agence: AGENCE_APPALACHES,
    contexte:
      "Dans Les Etchemins, sur le plateau appalachien près de la frontière américaine, la forêt couvre la plus grande partie du territoire. De Lac-Etchemin à Saint-Magloire et Saint-Camille-de-Lellis, la forêt privée compte beaucoup dans la vie de la région.",
    equipe: EQUIPE_APPALACHES,
    vedettes: ["Lac-Etchemin", "Saint-Prosper", "Sainte-Justine"],
    travaux: ["recolte", "eclaircieCom", "degagement", "reboisement", "paf", "feuillus", "eclairciePrecom"],
    municipalites: [
      { nom: "Lac-Etchemin", travaux: ["eclaircieCom", "recolte", "paf"] },
      { nom: "Saint-Benjamin", travaux: ["recolte", "eclaircieCom"] },
      { nom: "Saint-Camille-de-Lellis", travaux: ["recolte", "degagement", "reboisement", "eclaircieCom", "paf", "eclairciePrecom", "feuillus"] },
      { nom: "Saint-Cyprien", travaux: ["eclaircieCom", "recolte"] },
      { nom: "Saint-Louis-de-Gonzague", travaux: ["recolte"] },
      { nom: "Saint-Luc-de-Bellechasse", travaux: ["degagement", "recolte", "eclaircieCom"] },
      { nom: "Saint-Magloire", travaux: ["recolte", "degagement", "reboisement", "eclaircieCom", "paf"] },
      { nom: "Saint-Prosper", travaux: ["paf", "recolte", "degagement", "reboisement"] },
      { nom: "Saint-Zacharie", travaux: ["recolte", "eclaircieCom", "reboisement"] },
      { nom: "Sainte-Aurélie", travaux: ["eclaircieCom", "recolte"] },
      { nom: "Sainte-Justine", travaux: ["recolte", "eclaircieCom", "reboisement", "degagement", "feuillus", "paf"] },
      { nom: "Sainte-Rose-de-Watford", travaux: ["eclaircieCom", "reboisement", "recolte"] },
      { nom: "Sainte-Sabine", travaux: ["recolte", "feuillus", "reboisement", "degagement", "eclaircieCom"] },
    ],
  },
  {
    slug: "montmagny-l-islet",
    nom: "Montmagny et L'Islet",
    dans: "dans Montmagny et L'Islet",
    etiquette: "MRC de Montmagny et de L'Islet",
    region: "Chaudière-Appalaches",
    rive: "Rive sud",
    agence: AGENCE_APPALACHES,
    contexte:
      "Du bord du fleuve jusqu'aux montagnes près de la frontière, les MRC de Montmagny et de L'Islet réunissent des boisés de ferme dans la plaine et de grandes forêts sur les hauteurs, autour de Saint-Paul-de-Montminy et de Saint-Just-de-Bretenières.",
    equipe: EQUIPE_APPALACHES,
    vedettes: ["Montmagny", "Saint-Paul-de-Montminy", "Saint-Just-de-Bretenières"],
    travaux: ["recolte", "degagement", "reboisement", "paf", "eclaircieCom", "feuillus", "eclairciePrecom"],
    municipalites: [
      { nom: "Montmagny", travaux: [] },
      { nom: "Notre-Dame-du-Rosaire", travaux: ["degagement"] },
      { nom: "Saint-Fabien-de-Panet", travaux: [] },
      { nom: "Saint-Just-de-Bretenières", travaux: ["paf", "recolte", "eclaircieCom", "degagement"] },
      { nom: "Saint-Marcel", travaux: [] },
      { nom: "Saint-Omer", travaux: ["recolte", "eclaircieCom", "reboisement"] },
      { nom: "Saint-Paul-de-Montminy", travaux: ["degagement", "recolte", "reboisement", "paf"] },
      { nom: "Saint-Pierre-de-la-Rivière-du-Sud", travaux: ["feuillus", "paf"] },
      { nom: "Sainte-Apolline-de-Patton", travaux: ["recolte", "reboisement"] },
      { nom: "Sainte-Euphémie-sur-Rivière-du-Sud", travaux: ["degagement", "eclaircieCom", "eclairciePrecom", "recolte"] },
      { nom: "Sainte-Lucie-de-Beauregard", travaux: [] },
    ],
  },
  {
    slug: "lotbiniere",
    nom: "Lotbinière",
    dans: "dans Lotbinière",
    etiquette: "MRC de Lotbinière",
    region: "Chaudière-Appalaches",
    rive: "Rive sud",
    agence: AGENCE_CHAUDIERE,
    contexte:
      "Dans Lotbinière, la plaine agricole du bord du fleuve laisse place, vers le sud, aux premières collines des Appalaches. Boisés de ferme, érablières et plantations se partagent un territoire où l'agriculture et la forêt vont de pair.",
    equipe: EQUIPE_CHAUDIERE,
    vedettes: ["Saint-Apollinaire", "Sainte-Croix", "Saint-Sylvestre"],
    travaux: ["recolte", "degagement", "eclaircieCom", "paf", "reboisement", "feuillus", "eclairciePrecom"],
    municipalites: [
      { nom: "Lotbinière", travaux: ["reboisement", "feuillus", "recolte", "eclaircieCom", "eclairciePrecom"] },
      { nom: "Notre-Dame-du-Sacré-Coeur-d'Issoudun", travaux: ["feuillus", "paf"] },
      { nom: "Saint-Antoine-de-Tilly", travaux: ["recolte", "eclaircieCom", "paf"] },
      { nom: "Saint-Apollinaire", travaux: ["recolte", "eclaircieCom"] },
      { nom: "Saint-Gilles", travaux: ["paf", "reboisement", "degagement", "eclairciePrecom", "recolte"] },
      { nom: "Saint-Janvier-de-Joly", travaux: ["degagement", "paf"] },
      { nom: "Saint-Sylvestre", travaux: ["recolte", "degagement", "eclaircieCom", "reboisement", "feuillus", "paf", "eclairciePrecom"] },
      { nom: "Sainte-Agathe-de-Lotbinière", travaux: ["recolte", "eclaircieCom", "feuillus"] },
      { nom: "Sainte-Croix", travaux: ["paf", "degagement", "eclaircieCom", "feuillus"] },
      { nom: "Val-Alain", travaux: ["reboisement", "recolte", "degagement", "eclaircieCom"] },
    ],
  },
  {
    slug: "beauce",
    nom: "Beauce",
    dans: "en Beauce",
    etiquette: "MRC de La Nouvelle-Beauce, de Beauce-Centre et de Beauce-Sartigan",
    region: "Chaudière-Appalaches",
    rive: "Rive sud",
    agence: AGENCE_CHAUDIERE,
    contexte:
      "En Beauce, le long de la rivière Chaudière, les érablières et les boisés de ferme font partie de l'identité de la région. Nos mandats vont de Saint-Lambert-de-Lauzon et Saint-Elzéar, dans La Nouvelle-Beauce, jusqu'à Saint-Victor et Saint-Côme-Linière. Cédric Maheu, ingénieur forestier de notre équipe, est Beauceron.",
    equipe: ["cedric-maheu", "camay-boisvert", "ann-renee-rheaume", "louis-chabot"],
    vedettes: ["Saint-Elzéar", "Frampton", "Saint-Victor"],
    travaux: ["recolte", "eclaircieCom", "reboisement", "feuillus", "degagement", "paf"],
    municipalites: [
      { nom: "Courcelles-Saint-Évariste", travaux: ["eclaircieCom", "recolte"] },
      { nom: "Frampton", travaux: ["recolte", "eclaircieCom", "reboisement", "degagement"] },
      { nom: "Saint-Côme-Linière", travaux: ["recolte", "reboisement", "eclaircieCom"] },
      { nom: "Saint-Elzéar", travaux: ["reboisement", "recolte", "eclaircieCom", "degagement"] },
      { nom: "Saint-Frédéric", travaux: ["feuillus", "recolte"] },
      { nom: "Saint-Lambert-de-Lauzon", travaux: ["feuillus", "paf", "recolte"] },
      { nom: "Saint-Séverin", travaux: ["recolte", "feuillus"] },
      { nom: "Saint-Victor", travaux: ["degagement", "feuillus"] },
      { nom: "Sainte-Marguerite", travaux: ["recolte"] },
    ],
  },
  {
    slug: "thetford-mines",
    nom: "Thetford Mines et Les Appalaches",
    dans: "dans la région de Thetford Mines",
    etiquette: "MRC des Appalaches",
    region: "Chaudière-Appalaches",
    rive: "Rive sud",
    agence: AGENCE_CHAUDIERE,
    contexte:
      "Autour de Thetford Mines, la MRC des Appalaches est un pays de collines, de lacs et de forêts, d'Adstock à Saint-Julien et Irlande. Les boisés privés y occupent une grande place. À noter : l'aide aux travaux y relève de l'agence de la Chaudière, et non de celle des Appalaches.",
    equipe: EQUIPE_CHAUDIERE,
    vedettes: ["Thetford Mines", "Adstock", "Disraeli"],
    travaux: ["recolte", "degagement", "reboisement", "eclaircieCom", "feuillus", "paf", "eclairciePrecom", "recuperation"],
    municipalites: [
      { nom: "Adstock", travaux: ["recolte", "eclaircieCom", "reboisement", "degagement", "feuillus", "paf"] },
      { nom: "Disraeli", travaux: ["recolte", "feuillus", "eclaircieCom", "degagement", "eclairciePrecom", "paf", "reboisement"] },
      { nom: "Irlande", travaux: ["recolte", "degagement", "reboisement", "feuillus", "eclaircieCom", "eclairciePrecom"] },
      { nom: "Kinnear's Mills", travaux: ["degagement", "recolte", "reboisement", "eclaircieCom", "eclairciePrecom"] },
      { nom: "Saint-Adrien-d'Irlande", travaux: ["recolte", "degagement", "reboisement", "paf"] },
      { nom: "Saint-Fortunat", travaux: ["degagement", "recolte", "reboisement", "feuillus", "eclaircieCom", "eclairciePrecom", "paf"] },
      { nom: "Saint-Jacques-de-Leeds", travaux: ["paf", "reboisement"] },
      { nom: "Saint-Jacques-le-Majeur-de-Wolfestown", travaux: ["degagement", "recolte", "eclairciePrecom", "reboisement", "eclaircieCom", "feuillus", "paf"] },
      { nom: "Saint-Jean-de-Brébeuf", travaux: ["degagement", "reboisement", "eclaircieCom", "recolte"] },
      { nom: "Saint-Joseph-de-Coleraine", travaux: ["degagement", "paf", "recolte"] },
      { nom: "Saint-Julien", travaux: ["recolte", "reboisement", "degagement", "eclaircieCom", "paf", "recuperation", "eclairciePrecom", "feuillus"] },
      { nom: "Saint-Pierre-de-Broughton", travaux: ["recolte", "eclairciePrecom", "eclaircieCom", "paf"] },
      { nom: "Thetford Mines", travaux: ["recolte", "reboisement", "eclaircieCom", "degagement", "feuillus", "eclairciePrecom", "paf"] },
    ],
  },
  {
    slug: "plessisville",
    nom: "Plessisville et L'Érable",
    dans: "dans la région de Plessisville",
    etiquette: "MRC de L'Érable",
    region: "Centre-du-Québec",
    rive: "Rive sud",
    agence: AGENCE_BOIS_FRANCS,
    contexte:
      "Dans la MRC de L'Érable, autour de Plessisville, l'érable n'est pas qu'un nom : les érablières et les boisés de ferme occupent une grande place, de Villeroy à Saint-Ferdinand et Inverness.",
    equipe: EQUIPE_BOIS_FRANCS,
    vedettes: ["Plessisville", "Princeville", "Villeroy"],
    travaux: ["recolte", "degagement", "reboisement", "eclaircieCom", "feuillus", "paf", "eclairciePrecom", "recuperation"],
    municipalites: [
      { nom: "Inverness", travaux: ["degagement", "reboisement", "recolte", "eclaircieCom", "paf", "eclairciePrecom", "feuillus"] },
      { nom: "Laurierville", travaux: ["recolte", "eclairciePrecom", "feuillus"] },
      { nom: "Lyster", travaux: ["recolte", "degagement", "feuillus", "reboisement", "eclairciePrecom", "eclaircieCom"] },
      { nom: "Notre-Dame-de-Lourdes", travaux: ["degagement", "feuillus", "paf", "reboisement", "recuperation"] },
      { nom: "Plessisville", travaux: ["recolte", "feuillus", "degagement", "paf", "reboisement"] },
      { nom: "Princeville", travaux: ["recolte", "feuillus", "paf"] },
      { nom: "Saint-Ferdinand", travaux: ["recolte", "degagement", "reboisement", "eclaircieCom", "eclairciePrecom", "feuillus", "paf", "recuperation"] },
      { nom: "Saint-Pierre-Baptiste", travaux: ["recolte", "eclaircieCom", "feuillus", "reboisement", "degagement", "paf"] },
      { nom: "Sainte-Sophie-d'Halifax", travaux: ["degagement", "recolte", "eclaircieCom", "reboisement", "feuillus", "paf"] },
      { nom: "Villeroy", travaux: ["reboisement", "degagement", "recolte", "paf", "eclaircieCom", "eclairciePrecom", "recuperation"] },
    ],
  },
  {
    slug: "victoriaville",
    nom: "Victoriaville et Arthabaska",
    dans: "dans la région de Victoriaville",
    etiquette: "MRC d'Arthabaska",
    region: "Centre-du-Québec",
    rive: "Rive sud",
    agence: AGENCE_BOIS_FRANCS,
    contexte:
      "Dans la MRC d'Arthabaska, autour de Victoriaville, les boisés de ferme et les érablières alternent avec les terres agricoles, de Chesterville à Ham-Nord et Saint-Norbert-d'Arthabaska. Frank-Olivier Soucy, technicien forestier de notre équipe, est originaire des Bois-Francs.",
    equipe: EQUIPE_BOIS_FRANCS,
    vedettes: ["Chesterville", "Warwick", "Saint-Christophe-d'Arthabaska"],
    travaux: ["recolte", "eclaircieCom", "feuillus", "degagement", "reboisement", "eclairciePrecom", "paf", "recuperation"],
    municipalites: [
      { nom: "Chesterville", travaux: ["recolte", "eclaircieCom", "feuillus", "reboisement", "degagement", "recuperation"] },
      { nom: "Ham-Nord", travaux: ["recolte", "eclaircieCom"] },
      { nom: "Notre-Dame-de-Ham", travaux: ["recolte", "reboisement", "eclaircieCom", "degagement", "paf"] },
      { nom: "Saint-Christophe-d'Arthabaska", travaux: ["feuillus"] },
      { nom: "Saint-Louis-de-Blandford", travaux: ["recolte", "eclaircieCom", "reboisement", "degagement", "feuillus"] },
      { nom: "Saint-Norbert-d'Arthabaska", travaux: ["feuillus", "degagement", "eclairciePrecom", "recolte", "eclaircieCom"] },
      { nom: "Saint-Rémi-de-Tingwick", travaux: ["recolte", "eclaircieCom", "feuillus"] },
      { nom: "Saint-Rosaire", travaux: ["feuillus", "eclaircieCom"] },
      { nom: "Saint-Samuel", travaux: ["recolte", "eclaircieCom", "degagement", "reboisement"] },
      { nom: "Saint-Valère", travaux: ["feuillus", "paf", "recolte"] },
      { nom: "Sainte-Clotilde-de-Horton", travaux: ["eclaircieCom", "recolte"] },
      { nom: "Sainte-Hélène-de-Chester", travaux: ["recolte", "eclaircieCom", "feuillus", "degagement"] },
      { nom: "Warwick", travaux: ["degagement"] },
    ],
  },
];

/** Ancre d'une municipalité dans sa page de secteur (« saint-raymond »). */
export function ancre(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
