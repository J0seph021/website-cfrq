export interface Service {
  slug: string;
  titre: string;
  tagline: string;
  intro: string;
  /**
   * Texte de la balise `<meta name="description">` de la page.
   *
   * Distinct de `intro` : Google coupe son extrait autour de 155 caractères,
   * et autour de 120 sur téléphone. `intro` est un paragraphe écrit pour le
   * corps de la page, trop long pour un résultat de recherche, où il se
   * faisait trancher en plein milieu d'une phrase. Viser 140 à 160 caractères,
   * avec l'information qui décide du clic dans les 120 premiers.
   */
  metaDescription: string;
  prestations: string[];
  encart?: { titre: string; points: string[] };
  image:
    | "peuplement"
    | "foret-travaux"
    | "erabliere"
    | "hero-recolte"
    | "territoire"
    | "recolte-hiver"
    | "foret-neige"
    | "plantation-erables";
  icone: string;
}

export const services: Service[] = [
  {
    slug: "amenagement",
    titre: "Aménagement forestier",
    tagline: "Un boisé en santé, étape par étape.",
    intro:
      "Le plan d'aménagement est l'étape incontournable pour planifier vos interventions et accéder aux programmes d'aide financière. Nous analysons vos besoins, vos objectifs et les caractéristiques de votre terrain pour bâtir une stratégie durable et écosystémique.",
    metaDescription:
      "Le plan d'aménagement ouvre l'accès au PAMVFP et au rabais de taxes foncières. On analyse votre boisé et on bâtit une stratégie durable, étape par étape.",
    prestations: [
      "Analyse des besoins et des objectifs",
      "Plan d'aménagement forestier",
      "Préparation de terrain",
      "Reboisement résineux et feuillus",
      "Entretien de la régénération",
      "Éducation de peuplement",
      "Travaux forêt-faune",
    ],
    encart: {
      titre: "Le plan d'aménagement donne accès à",
      points: [
        "Programme d'aide à la mise en valeur des forêts privées (PAMVFP)",
        "Programme de financement forestier",
        "Remboursement des taxes foncières des producteurs forestiers reconnus",
      ],
    },
    image: "peuplement",
    icone: "tree",
  },
  {
    slug: "operation-forestieres",
    titre: "Opérations forestières",
    tagline: "Du service à la carte au clé en main.",
    intro:
      "Nous supervisons chaque année la récolte de 35 000 m³ de bois sur les propriétés de nos clients. Du martelage à la fin des travaux, nous planifions, supervisons et vérifions les opérations pour que vous ayez l'esprit tranquille.",
    metaDescription:
      "35 000 m³ de récolte supervisée chaque année. Prescription, permis, voirie, supervision : à la carte ou clé en main, du martelage à la vérification.",
    prestations: [
      "Prescription de travaux",
      "Demande de permis",
      "Planification et suivi",
      "Voirie forestière",
      "Supervision des opérations",
      "Vérification des travaux réalisés",
      "Paiement des entrepreneurs",
    ],
    encart: {
      titre: "Format clé en main",
      points: [
        "Encadré par un contrat qui précise le partage des revenus, établi avant le début des travaux",
        "Supervision complète des opérations, de la planification à la vérification des travaux",
      ],
    },
    image: "recolte-hiver",
    icone: "chainsaw",
  },
  {
    slug: "evaluation-forestiere",
    titre: "Évaluation forestière et expertise légale",
    tagline: "Le juste prix, démontré et défendu.",
    intro:
      "Valeur marchande, dommages causés par un tiers ou potentiel d'une propriété : nous effectuons les relevés et les recherches nécessaires pour démontrer et justifier le juste prix de votre boisé, y compris devant les tribunaux.",
    metaDescription:
      "Valeur marchande, dommages causés par un tiers, expropriation : nos ingénieurs forestiers démontrent le juste prix de votre boisé, même devant les tribunaux.",
    prestations: [
      "Évaluation de propriété",
      "Expertise lors d'expropriation",
      "Évaluation des dommages",
      "Inventaire forestier",
      "Témoignage d'expert",
    ],
    image: "foret-neige",
    icone: "scale",
  },
  {
    slug: "erabliere",
    titre: "Érablière et acériculture",
    tagline: "Maximisez le potentiel de votre érablière.",
    intro:
      "De la santé du peuplement à la conformité d'entaillage, nous accompagnons les producteurs acéricoles avec des relevés précis et une cartographie GPS de leur réseau.",
    metaDescription:
      "Bilan de santé du peuplement, analyse de sol, nombre d'entailles et cartographie GPS de votre réseau. L'accompagnement acéricole par des forestiers.",
    prestations: [
      "Bilan de santé de l'érablière",
      "Analyse de sol",
      "Évaluation du nombre d'entailles et du respect des normes d'entaillage",
      "Plan d'érablière pour les Producteurs et productrices acéricoles du Québec (PPAQ)",
      "Cartographie de l'érablière (relevé GPS du réseau de collecte)",
    ],
    image: "erabliere",
    icone: "droplet",
  },
  {
    slug: "arboriculture-et-foresterie-urbaine",
    titre: "Arboriculture et foresterie urbaine",
    tagline: "Des arbres sains, des milieux sécuritaires.",
    intro:
      "Pour les municipalités, les promoteurs et les propriétaires, nous évaluons la santé et le risque des arbres, et nous prescrivons les travaux correctifs requis, signés par des ingénieurs forestiers.",
    metaDescription:
      "Santé et risque des arbres, boisés municipaux, accompagnement des promoteurs. Évaluations et prescriptions signées par des ingénieurs forestiers.",
    prestations: [
      "Évaluation de la santé de l'arbre",
      "Évaluation du risque",
      "Prescription de travaux correctifs",
      "État de santé des boisés municipaux",
      "Accompagnement des promoteurs immobiliers",
    ],
    image: "plantation-erables",
    icone: "building",
  },
];
