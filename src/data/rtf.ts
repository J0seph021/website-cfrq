// Remboursement des taxes foncières des producteurs forestiers reconnus (RTF).
//
// Deux sources, deux rôles distincts :
//
// 1. Les TAUX viennent de la grille annuelle du MRNF, « Grille des valeurs des
//    dépenses admissibles au remboursement des taxes foncières des producteurs
//    forestiers reconnus 2026 » (Service de la forêt privée, en vigueur le
//    1er avril 2026). C'est elle qui fait foi pour les montants.
//    https://cdn-contenu.quebec.ca/cdn-contenu/forets/documents/privees/aide/GR_valeurs_RTF_2026.pdf
//
// 2. Les DÉFINITIONS viennent de l'annexe 1 du Règlement sur le remboursement
//    des taxes foncières des producteurs forestiers reconnus (RLRQ, chapitre
//    A-18.1, r. 12.1). Attention : les montants inscrits dans le règlement sont
//    les valeurs de base et sont périmés ; ne jamais les utiliser pour calculer.
//    Seule la grille annuelle donne les taux courants.
//
// Le mécanisme du programme est décrit dans le « Guide du producteur forestier »
// du MRNF. Il tient en trois phrases :
//
//   - Le remboursement est un crédit d'impôt de 85 % des taxes foncières
//     (municipales et scolaires) de la propriété forestière admissible.
//   - Il est plafonné par les dépenses de mise en valeur admissibles : on ne
//     rembourse jamais plus de taxes qu'on n'a fait de travaux.
//   - Les dépenses qui dépassent les taxes de l'année ne sont pas perdues :
//     elles se reportent sur une période qui n'excède pas dix ans.
//
// D'où la formule, qui est le coeur des deux calculateurs :
//
//     remboursement = 85 % × min(dépenses admissibles disponibles, taxes payées)
//
// La demande se fait à Revenu Québec : partie C de l'annexe E de la déclaration
// de revenus pour un particulier, formulaire FM-220.3 pour une société.

export const ANNEE_GRILLE = 2026;

/** Part des taxes foncières remboursable, une fois les dépenses au rendez-vous. */
export const PART_REMBOURSABLE = 0.85;

/** Une dépense excédentaire se reporte sur une période qui n'excède pas dix ans. */
export const ANNEES_REPORT = 10;

/** Superficie minimale à vocation forestière pour être producteur forestier reconnu. */
export const SUPERFICIE_MINIMALE_HA = 4;

export const SOURCE_GRILLE =
  "https://cdn-contenu.quebec.ca/cdn-contenu/forets/documents/privees/aide/GR_valeurs_RTF_2026.pdf";

export const SOURCE_REGLEMENT =
  "https://www.legisquebec.gouv.qc.ca/fr/document/rc/a-18.1,%20r.%2012.1";

export type Unite =
  | "$/ha"
  | "$/km"
  | "$/1 000 plants"
  | "$/1 000 microsites"
  | "$/pont ou ponceau"
  | "$/PAF"
  | "$/élément"
  | "$/visite";

/** Libellé court de la quantité à saisir, pour l'étiquette du champ. */
export const LIBELLE_QUANTITE: Record<Unite, string> = {
  "$/ha": "hectares",
  "$/km": "kilomètres",
  "$/1 000 plants": "milliers de plants",
  "$/1 000 microsites": "milliers de microsites",
  "$/pont ou ponceau": "ponts ou ponceaux",
  "$/PAF": "plans",
  "$/élément": "éléments",
  "$/visite": "visites",
};

export type Taux = {
  id: string;
  nom: string;
  /** Volet exécution : les coûts de réalisation. */
  execution: number;
  /** Volet technique : planification, suivi et supervision opérationnels. */
  technique: number;
  total: number;
  unite: Unite;
  /**
   * Note 2 de la grille : sur présentation de factures admissibles et de leur
   * preuve de paiement (jointes au rapport de l'ingénieur forestier), la dépense
   * peut valoir le total des factures validées, jusqu'au double du taux affiché.
   */
  surFacture?: boolean;
  note?: string;
};

export type GroupeTaux = {
  id: string;
  titre: string;
  /** Définition tirée de l'annexe 1 du règlement. */
  definition: string;
  taux: Taux[];
};

export const GROUPES: GroupeTaux[] = [
  {
    id: "preparation",
    titre: "Traitements de préparation de terrain",
    definition:
      "Traitement visant à rendre le terrain propice à la plantation d'une quantité optimale et bien répartie de plants. Le débroussaillement et le déblaiement éliminent la broussaille et la matière ligneuse non commercialement utilisable et la mettent en andains ou en tas. Le scarifiage ameublit plus ou moins énergiquement les couches superficielles du sol pour mélanger la matière organique et le sol minéral.",
    taux: [
      { id: "debrous-faible", nom: "Débroussaillement et déblaiement — faible compétition", execution: 958, technique: 284, total: 1242, unite: "$/ha" },
      { id: "debrous-forte", nom: "Débroussaillement et déblaiement — forte compétition", execution: 1740, technique: 284, total: 2024, unite: "$/ha" },
      { id: "deblai-meca", nom: "Déblaiement mécanique", execution: 1166, technique: 284, total: 1450, unite: "$/ha" },
      { id: "deblai-lame", nom: "Déblaiement avec tracteur à lame tranchante", execution: 1857, technique: 284, total: 2141, unite: "$/ha" },
      { id: "dechiquetage", nom: "Déchiquetage", execution: 2035, technique: 284, total: 2319, unite: "$/ha" },
      { id: "deblai-pelle", nom: "Déblaiement avec excavatrice « Pelle-Peigne »", execution: 1611, technique: 284, total: 1895, unite: "$/ha" },
      { id: "recup-debrous", nom: "Récupération, débroussaillement et déblaiement", execution: 1375, technique: 284, total: 1659, unite: "$/ha" },
      { id: "scar-leger-simple", nom: "Scarifiage léger — TTS à disques passifs, simple passage", execution: 382, technique: 284, total: 666, unite: "$/ha" },
      { id: "scar-leger-double", nom: "Scarifiage léger — TTS à disques passifs, double passage", execution: 672, technique: 284, total: 956, unite: "$/ha" },
      { id: "scar-moyen-simple", nom: "Scarifiage moyen — TTS hydraulique, Donaren ou Requin, simple passage", execution: 589, technique: 284, total: 873, unite: "$/ha" },
      { id: "scar-moyen-double", nom: "Scarifiage moyen — TTS hydraulique, Donaren ou Requin, double passage", execution: 1036, technique: 284, total: 1320, unite: "$/ha" },
      { id: "scar-manuel", nom: "Scarifiage manuel", execution: 392, technique: 284, total: 676, unite: "$/1 000 microsites" },
      { id: "scar-monticule", nom: "Scarifiage par monticule", execution: 961, technique: 284, total: 1245, unite: "$/ha" },
      { id: "labour-agricole", nom: "Labourage et hersage agricoles", execution: 757, technique: 284, total: 1041, unite: "$/ha" },
      { id: "labour-forestier", nom: "Labourage et hersage forestiers", execution: 1665, technique: 284, total: 1949, unite: "$/ha" },
      { id: "hersage-forestier", nom: "Hersage forestier", execution: 1079, technique: 284, total: 1363, unite: "$/ha" },
    ],
  },
  {
    id: "regeneration",
    titre: "Traitements de la régénération artificielle",
    definition:
      "Plantation : mise en terre adéquate, de façon mécanique ou manuelle, d'une quantité optimale et bien répartie de boutures, de plançons ou de plants pour la production de matière ligneuse. Regarni : mise en terre de plants aux endroits où la régénération artificielle ou naturelle est insuffisante. Enrichissement : mise en terre, par trouées ou minibandes, de plants d'essences d'ombre afin d'améliorer la qualité et la composition de la régénération d'essences commerciales.",
    taux: [
      { id: "plant-meca", nom: "Plantation mécanique (pelle planteuse)", execution: 2030, technique: 302, total: 2332, unite: "$/1 000 plants" },
      { id: "plant-rn-res", nom: "Plantation manuelle — racines nues, PFD résineux", execution: 683, technique: 326, total: 1009, unite: "$/1 000 plants" },
      { id: "plant-rn-feu", nom: "Plantation manuelle — racines nues, PFD feuillus", execution: 683, technique: 326, total: 1009, unite: "$/1 000 plants" },
      { id: "plant-50-109", nom: "Plantation manuelle — récipients de 50 à 109 cc, résineux", execution: 266, technique: 293, total: 559, unite: "$/1 000 plants" },
      { id: "plant-110-199", nom: "Plantation manuelle — récipients de 110 à 199 cc", execution: 360, technique: 302, total: 662, unite: "$/1 000 plants" },
      { id: "plant-200-299", nom: "Plantation manuelle — récipients de 200 à 299 cc", execution: 540, technique: 326, total: 866, unite: "$/1 000 plants" },
      { id: "plant-300-res", nom: "Plantation manuelle — récipients de 300 cc et plus, résineux", execution: 610, technique: 346, total: 956, unite: "$/1 000 plants" },
      { id: "plant-300-feu", nom: "Plantation manuelle — récipients de 300 cc et plus, feuillus", execution: 610, technique: 346, total: 956, unite: "$/1 000 plants" },
      { id: "plant-300-15cav", nom: "Plantation manuelle — récipients de 300 cc et plus (15 cavités), résineux", execution: 690, technique: 353, total: 1043, unite: "$/1 000 plants" },
      { id: "reg-rn-res", nom: "Regarni ou enrichissement — racines nues, PFD résineux", execution: 829, technique: 326, total: 1155, unite: "$/1 000 plants" },
      { id: "reg-rn-feu", nom: "Regarni ou enrichissement — racines nues, PFD feuillus", execution: 829, technique: 326, total: 1155, unite: "$/1 000 plants" },
      { id: "reg-50-109", nom: "Regarni ou enrichissement — récipients de 50 à 109 cc, résineux", execution: 429, technique: 293, total: 722, unite: "$/1 000 plants" },
      { id: "reg-110-199", nom: "Regarni ou enrichissement — récipients de 110 à 199 cc", execution: 507, technique: 302, total: 809, unite: "$/1 000 plants" },
      { id: "reg-200-299", nom: "Regarni ou enrichissement — récipients de 200 à 299 cc", execution: 690, technique: 326, total: 1016, unite: "$/1 000 plants" },
      { id: "reg-300-res", nom: "Regarni ou enrichissement — récipients de 300 cc et plus, résineux", execution: 726, technique: 346, total: 1072, unite: "$/1 000 plants" },
      { id: "reg-300-feu", nom: "Regarni ou enrichissement — récipients de 300 cc et plus, feuillus", execution: 726, technique: 346, total: 1072, unite: "$/1 000 plants" },
      { id: "reg-300-15cav", nom: "Regarni ou enrichissement — récipients de 300 cc et plus (15 cavités), résineux", execution: 820, technique: 353, total: 1173, unite: "$/1 000 plants" },
      { id: "peuplier-hybride", nom: "Plantation, regarni ou enrichissement — peupliers hybrides", execution: 1000, technique: 353, total: 1353, unite: "$/1 000 plants" },
    ],
  },
  {
    id: "entretien",
    titre: "Traitements d'entretien",
    definition:
      "Traitement réalisé afin de maintenir ou d'améliorer la croissance ou la qualité de la régénération en essences désirées. Le dégagement contrôle la végétation compétitive qui entrave la croissance des arbres désirés ; le désherbage contrôle la compétition herbacée ; l'élagage coupe les branches mortes ou vivantes de la partie inférieure du tronc de l'arbre d'avenir. Le traitement de protection lutte contre les insectes, les maladies ou les animaux pour enrayer la propagation ou minimiser les dommages causés aux arbres.",
    taux: [
      { id: "degagement-1", nom: "1er dégagement de plantations — résineux", execution: 1736, technique: 480, total: 2216, unite: "$/ha" },
      { id: "degagement-2", nom: "2e dégagement de plantations — résineux", execution: 1435, technique: 480, total: 1915, unite: "$/ha" },
      { id: "degagement-3", nom: "3e dégagement de plantations — résineux", execution: 1380, technique: 480, total: 1860, unite: "$/ha" },
      { id: "desherbage", nom: "Désherbage", execution: 617, technique: 480, total: 1097, unite: "$/ha" },
      { id: "taille-pins", nom: "Taille phytosanitaire de pins blancs et de pins rouges", execution: 1059, technique: 480, total: 1539, unite: "$/ha" },
      { id: "paillis", nom: "Installation de paillis", execution: 1322, technique: 529, total: 1851, unite: "$/ha" },
      { id: "fertilisation", nom: "Fertilisation et amendement forestier", execution: 721, technique: 288, total: 1009, unite: "$/ha" },
      { id: "elagage", nom: "Élagage artificiel", execution: 565, technique: 480, total: 1045, unite: "$/ha" },
      { id: "protection", nom: "Traitement de protection", execution: 605, technique: 258, total: 863, unite: "$/ha" },
    ],
  },
  {
    id: "education",
    titre: "Traitements d'éducation",
    definition:
      "Éclaircie précommerciale : élimination, dans un jeune peuplement forestier, des arbres en surnombre qui nuisent à la croissance d'arbres choisis, afin d'améliorer la croissance, la qualité ou la composition du peuplement et de régulariser l'espacement entre les arbres. Ce traitement ne vise pas en priorité la récolte de bois marchand.",
    taux: [
      { id: "epc-8-15", nom: "Éclaircie précommerciale systématique — de 8 000 à 15 000 tiges/ha", execution: 1484, technique: 480, total: 1964, unite: "$/ha" },
      { id: "epc-15plus", nom: "Éclaircie précommerciale systématique — 15 001 tiges/ha et plus", execution: 1983, technique: 480, total: 2463, unite: "$/ha" },
      { id: "epc-puits", nom: "Éclaircie précommerciale par puits de lumière, avec martelage", execution: 1436, technique: 813, total: 2249, unite: "$/ha" },
      { id: "epc-peuplier", nom: "Éclaircie précommerciale — peuplier", execution: 1049, technique: 480, total: 1529, unite: "$/ha" },
    ],
  },
  {
    id: "commerciaux",
    titre: "Traitements commerciaux",
    definition:
      "Éclaircie commerciale : coupe pratiquée dans un peuplement non arrivé à maturité, destinée à accélérer l'accroissement du diamètre des arbres restants et, par une sélection convenable, à améliorer la moyenne de leur forme. Coupe de jardinage : récolte périodique d'arbres choisis individuellement ou par petits groupes, pour amener ou maintenir le peuplement dans une structure jardinée équilibrée. Coupe progressive d'ensemencement : série de coupes partielles dans un peuplement ayant atteint l'âge d'exploitation, permettant l'ouverture graduelle du couvert et favorisant l'implantation de la régénération. Coupe d'amélioration : élimination des essences indésirables ou des arbres mal formés. Coupe d'assainissement : élimination des arbres tués ou affaiblis par les maladies ou les insectes. Coupe de récupération : élimination des arbres morts, mourants ou en voie de détérioration avant que le bois ne devienne inutilisable.",
    taux: [
      { id: "cp-sepm-man", nom: "Coupe progressive — résineux (SEPM), manuelle", execution: 1054, technique: 584, total: 1638, unite: "$/ha" },
      { id: "cp-sepm-mec", nom: "Coupe progressive — résineux (SEPM), mécanisée", execution: 775, technique: 584, total: 1359, unite: "$/ha" },
      { id: "cp-autres-man", nom: "Coupe progressive — autres résineux, manuelle", execution: 1342, technique: 584, total: 1926, unite: "$/ha" },
      { id: "cp-autres-mec", nom: "Coupe progressive — autres résineux, mécanisée", execution: 987, technique: 584, total: 1571, unite: "$/ha" },
      { id: "cp-feuillus-man", nom: "Coupe progressive — feuillus d'ombre, manuelle", execution: 1342, technique: 584, total: 1926, unite: "$/ha" },
      { id: "cp-feuillus-mec", nom: "Coupe progressive — feuillus d'ombre, mécanisée", execution: 987, technique: 584, total: 1571, unite: "$/ha" },
      { id: "recup-part-man", nom: "Coupe de récupération — partielle manuelle", execution: 1291, technique: 584, total: 1875, unite: "$/ha" },
      { id: "recup-part-mec", nom: "Coupe de récupération — partielle mécanisée", execution: 949, technique: 584, total: 1533, unite: "$/ha" },
      { id: "recup-tot-man", nom: "Coupe de récupération — totale manuelle", execution: 488, technique: 298, total: 786, unite: "$/ha" },
      { id: "recup-tot-mec", nom: "Coupe de récupération — totale mécanisée", execution: 359, technique: 298, total: 657, unite: "$/ha" },
      { id: "ec-feuillus-man", nom: "Éclaircie commerciale — feuillus d'ombre, manuelle", execution: 1120, technique: 584, total: 1704, unite: "$/ha" },
      { id: "ec-feuillus-mec", nom: "Éclaircie commerciale — feuillus d'ombre, mécanisée", execution: 824, technique: 584, total: 1408, unite: "$/ha" },
      { id: "ec-autres-man", nom: "Éclaircie commerciale — autres résineux, manuelle", execution: 1120, technique: 584, total: 1704, unite: "$/ha" },
      { id: "ec-autres-mec", nom: "Éclaircie commerciale — autres résineux, mécanisée", execution: 824, technique: 584, total: 1408, unite: "$/ha" },
      { id: "ec1-sepm-man-9-15", nom: "1re éclaircie commerciale — résineux (SEPM), manuelle, DHP de 9 à 15 cm", execution: 1937, technique: 584, total: 2521, unite: "$/ha" },
      { id: "ec1-sepm-man-15-19", nom: "1re éclaircie commerciale — résineux (SEPM), manuelle, DHP de 15,1 à 19 cm", execution: 1351, technique: 584, total: 1935, unite: "$/ha" },
      { id: "ec1-sepm-mec-9-15", nom: "1re éclaircie commerciale — résineux (SEPM), mécanisée, DHP de 9 à 15 cm", execution: 1424, technique: 584, total: 2008, unite: "$/ha" },
      { id: "ec1-sepm-mec-15-19", nom: "1re éclaircie commerciale — résineux (SEPM), mécanisée, DHP de 15,1 à 19 cm", execution: 993, technique: 584, total: 1577, unite: "$/ha" },
      { id: "ec2-sepm-man", nom: "2e éclaircie commerciale — plantations de résineux (SEPM), manuelle", execution: 1209, technique: 584, total: 1793, unite: "$/ha" },
      { id: "ec2-sepm-mec", nom: "2e éclaircie commerciale — plantations de résineux (SEPM), mécanisée", execution: 889, technique: 584, total: 1473, unite: "$/ha" },
      { id: "ec1-pins-man", nom: "1re éclaircie commerciale — plantations de pins blancs et rouges, manuelle", execution: 1635, technique: 584, total: 2219, unite: "$/ha" },
      { id: "ec1-pins-mec", nom: "1re éclaircie commerciale — plantations de pins blancs et rouges, mécanisée", execution: 1202, technique: 584, total: 1786, unite: "$/ha" },
      { id: "ec2-pins-man", nom: "2e éclaircie commerciale — plantations de pins blancs et rouges, manuelle", execution: 947, technique: 584, total: 1531, unite: "$/ha" },
      { id: "ec2-pins-mec", nom: "2e éclaircie commerciale — plantations de pins blancs et rouges, mécanisée", execution: 697, technique: 584, total: 1281, unite: "$/ha" },
      { id: "jard-sepm-man", nom: "Coupe de jardinage — résineux (SEPM), manuel", execution: 1409, technique: 584, total: 1993, unite: "$/ha" },
      { id: "jard-sepm-mec", nom: "Coupe de jardinage — résineux (SEPM), mécanisé", execution: 1036, technique: 584, total: 1620, unite: "$/ha" },
      { id: "jard-feuillus-man", nom: "Coupe de jardinage — feuillus d'ombre, manuel", execution: 1534, technique: 584, total: 2118, unite: "$/ha" },
      { id: "jard-feuillus-mec", nom: "Coupe de jardinage — feuillus d'ombre, mécanisé", execution: 1128, technique: 584, total: 1712, unite: "$/ha" },
      { id: "jard-autres-man", nom: "Coupe de jardinage — autres résineux, manuel", execution: 1534, technique: 584, total: 2118, unite: "$/ha" },
      { id: "jard-autres-mec", nom: "Coupe de jardinage — autres résineux, mécanisé", execution: 1128, technique: 584, total: 1712, unite: "$/ha" },
      { id: "succession", nom: "Coupe de succession", execution: 359, technique: 298, total: 657, unite: "$/ha" },
      { id: "assainissement", nom: "Coupe d'assainissement", execution: 965, technique: 584, total: 1549, unite: "$/ha" },
      { id: "amelioration", nom: "Coupe d'amélioration", execution: 1293, technique: 584, total: 1877, unite: "$/ha" },
      {
        id: "martelage-feuillu",
        nom: "Martelage — feuillu",
        execution: 0,
        technique: 243,
        total: 243,
        unite: "$/ha",
        note: "Applicable uniquement pour les traitements commerciaux admissibles.",
      },
      {
        id: "martelage-resineux",
        nom: "Martelage — résineux",
        execution: 0,
        technique: 311,
        total: 311,
        unite: "$/ha",
        note: "Applicable uniquement pour les traitements commerciaux admissibles.",
      },
      { id: "mobilisation", nom: "Aide technique pour la mobilisation des bois", execution: 0, technique: 386, total: 386, unite: "$/ha" },
    ],
  },
  {
    id: "autres",
    titre: "Autres activités",
    definition:
      "Voirie forestière : construction ou amélioration de chemins d'accès, de ponts ou de ponceaux afin de faciliter la réalisation des interventions forestières. Plan d'aménagement forestier (PAF) : confection d'un outil de connaissance et de planification préparé par un ingénieur forestier au bénéfice du producteur forestier, ayant pour but la protection et la mise en valeur de la propriété forestière. Volet multiressource : outil de connaissance des potentiels multiressources qui s'ajoute au PAF. Visite-conseil : visite incluant une analyse sur le terrain afin de faire, avec le propriétaire, un suivi du PAF ou de le conseiller sur la réalisation de travaux ; elle doit être réalisée sous la responsabilité et la supervision d'un ingénieur forestier, à raison d'une visite par PAF par année au maximum.",
    taux: [
      { id: "chemin-construction", nom: "Construction de chemins d'accès", execution: 2722, technique: 1009, total: 3731, unite: "$/km", surFacture: true },
      { id: "chemin-amelioration", nom: "Amélioration de chemins d'accès", execution: 1296, technique: 482, total: 1778, unite: "$/km", surFacture: true },
      { id: "pont-construction", nom: "Construction de ponts ou de ponceaux", execution: 1526, technique: 565, total: 2091, unite: "$/pont ou ponceau", surFacture: true },
      { id: "pont-amelioration", nom: "Amélioration de ponts ou de ponceaux", execution: 207, technique: 78, total: 285, unite: "$/pont ou ponceau", surFacture: true },
      { id: "paf-4-10", nom: "PAF — propriété de 4 à 10 ha", execution: 0, technique: 547, total: 547, unite: "$/PAF", surFacture: true },
      { id: "paf-11-50", nom: "PAF — propriété de 11 à 50 ha", execution: 0, technique: 685, total: 685, unite: "$/PAF", surFacture: true },
      { id: "paf-51-100", nom: "PAF — propriété de 51 à 100 ha", execution: 0, technique: 879, total: 879, unite: "$/PAF", surFacture: true },
      { id: "paf-101-799", nom: "PAF — propriété de 101 à 799 ha", execution: 0, technique: 1351, total: 1351, unite: "$/PAF", surFacture: true },
      { id: "paf-800", nom: "PAF — propriété de 800 ha et plus", execution: 0, technique: 1537, total: 1537, unite: "$/PAF", surFacture: true },
      { id: "paf-bonifie", nom: "Partie bonifiée du PAF", execution: 0, technique: 301, total: 301, unite: "$/élément", surFacture: true },
      { id: "milieux-sensibles", nom: "Délimitation de milieux sensibles", execution: 0, technique: 198, total: 198, unite: "$/ha" },
      { id: "multiressource", nom: "Volet multiressource prévu au PAF", execution: 0, technique: 257, total: 257, unite: "$/PAF", surFacture: true },
      { id: "visite-conseil", nom: "Visite-conseil", execution: 0, technique: 449, total: 449, unite: "$/visite", note: "Une visite par PAF par année au maximum." },
      { id: "certification", nom: "Certification forestière", execution: 0, technique: 3, total: 3, unite: "$/ha" },
    ],
  },
];

/** Index plat, pour retrouver un taux par son identifiant. */
export const TAUX_PAR_ID: Record<string, Taux> = Object.fromEntries(
  GROUPES.flatMap((g) => g.taux.map((t) => [t.id, t]))
);

/**
 * Majoration de 10 % du volet technique ou exécution quand les travaux sont
 * réalisés dans le but de conserver ou d'améliorer un habitat faunique, sur la
 * foi d'une analyse des potentiels fauniques prévue à l'annexe multiressource
 * du PAF ou à la prescription sylvicole d'un ingénieur forestier.
 */
export const MAJORATION_FORET_FAUNE = 0.1;

/** Le PAF est payé selon la superficie de la propriété : voici le palier applicable. */
export function palierPAF(superficieHa: number): Taux {
  if (superficieHa <= 10) return TAUX_PAR_ID["paf-4-10"];
  if (superficieHa <= 50) return TAUX_PAR_ID["paf-11-50"];
  if (superficieHa <= 100) return TAUX_PAR_ID["paf-51-100"];
  if (superficieHa <= 799) return TAUX_PAR_ID["paf-101-799"];
  return TAUX_PAR_ID["paf-800"];
}

export type AnneeProjection = {
  annee: number;
  taxes: number;
  /** Dépenses nouvelles portées à l'année. */
  depensesAjoutees: number;
  /** Dépenses disponibles avant application (report des années antérieures incluses). */
  disponible: number;
  /** Dépenses effectivement utilisées : min(disponible, taxes). */
  utilise: number;
  remboursement: number;
  /** Ce que le propriétaire paie vraiment de sa poche. */
  taxesNettes: number;
  /** Réserve reportée à l'année suivante. */
  reporte: number;
};

export type Projection = {
  annees: AnneeProjection[];
  totalTaxes: number;
  totalRemboursement: number;
  totalTaxesNettes: number;
  /**
   * Dépenses qui ne rapporteront jamais rien : le crédit vaut dix ans, et le
   * solde qui n'a pas servi au terme du délai est annulé, pas reporté plus loin.
   * C'est le chiffre qui justifie d'étaler les travaux plutôt que de tout faire
   * la même année.
   */
  soldeAnnule: number;
};

/**
 * Projette le remboursement sur un horizon donné.
 *
 * Le modèle suit le règlement au plus près sans le caricaturer : les dépenses
 * d'une année servent d'abord à couvrir les taxes de la même année, le surplus
 * est mis en réserve, et la réserve la plus ancienne est consommée en premier.
 *
 * Le crédit vaut dix ans. Une dépense engagée l'année N sert donc de l'année N
 * à l'année N + 9, et ce qui n'a pas servi au bout du compte est ANNULÉ : il ne
 * se reporte pas au-delà. C'est comptabilisé dans `soldeAnnule` plutôt que
 * silencieusement oublié, parce que c'est précisément ce chiffre qui dit au
 * propriétaire s'il aurait intérêt à étaler ses travaux.
 *
 * @param depensesParAnnee dépenses admissibles engagées à chaque année (index 0 = année 1)
 * @param taxesAnnee1 taxes foncières municipales et scolaires de la première année
 * @param indexation hausse annuelle des taxes (0.02 = 2 %)
 * @param horizon nombre d'années projetées
 */
export function projeter(
  depensesParAnnee: number[],
  taxesAnnee1: number,
  indexation: number,
  horizon: number = ANNEES_REPORT
): Projection {
  // Chaque poste de réserve garde son année d'origine : c'est elle qui décide
  // de la péremption, pas l'ordre d'utilisation.
  let reserve: { annee: number; montant: number }[] = [];
  const annees: AnneeProjection[] = [];
  let soldeAnnule = 0;

  for (let i = 0; i < horizon; i++) {
    const annee = i + 1;
    const taxes = taxesAnnee1 * Math.pow(1 + indexation, i);

    // Le crédit vaut dix ans : une dépense de l'année N sert de N à N + 9, puis
    // son solde est annulé. On le sort de la réserve avant de calculer l'année,
    // sinon on ferait miroiter un report qui n'existe plus.
    reserve = reserve.filter((r) => {
      if (annee - r.annee < ANNEES_REPORT) return true;
      soldeAnnule += r.montant;
      return false;
    });

    const depensesAjoutees = depensesParAnnee[i] ?? 0;
    if (depensesAjoutees > 0) reserve.push({ annee, montant: depensesAjoutees });

    const disponible = reserve.reduce((s, r) => s + r.montant, 0);
    const utilise = Math.min(disponible, taxes);

    // Consommer du plus ancien au plus récent : ce qui va périmer sert en premier.
    let aConsommer = utilise;
    reserve.sort((a, b) => a.annee - b.annee);
    for (const poste of reserve) {
      if (aConsommer <= 0) break;
      const pris = Math.min(poste.montant, aConsommer);
      poste.montant -= pris;
      aConsommer -= pris;
    }
    reserve = reserve.filter((r) => r.montant > 0.005);

    const remboursement = utilise * PART_REMBOURSABLE;
    annees.push({
      annee,
      taxes,
      depensesAjoutees,
      disponible,
      utilise,
      remboursement,
      taxesNettes: taxes - remboursement,
      reporte: reserve.reduce((s, r) => s + r.montant, 0),
    });
  }

  // Au terme de l'horizon, ce qui reste en réserve ne servira plus : l'horizon
  // par défaut est la durée de vie du crédit.
  soldeAnnule += reserve.reduce((s, r) => s + r.montant, 0);

  return {
    annees,
    totalTaxes: annees.reduce((s, a) => s + a.taxes, 0),
    totalRemboursement: annees.reduce((s, a) => s + a.remboursement, 0),
    totalTaxesNettes: annees.reduce((s, a) => s + a.taxesNettes, 0),
    soldeAnnule,
  };
}
