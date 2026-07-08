export interface Service {
  slug: string;
  titre: string;
  tagline: string;
  intro: string;
  prestations: string[];
  encart?: { titre: string; points: string[] };
  image: "peuplement" | "foret-travaux" | "erabliere" | "hero-recolte" | "territoire";
  icone: string;
}

export const services: Service[] = [
  {
    slug: "amenagement",
    titre: "Aménagement forestier",
    tagline: "Un boisé en santé, étape par étape.",
    intro:
      "Le plan d'aménagement est l'étape incontournable pour planifier vos interventions et accéder aux programmes d'aide financière. Nous analysons vos besoins, vos objectifs et les caractéristiques de votre terrain pour bâtir une stratégie durable et écosystémique.",
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
      "Nous supervisons chaque année la récolte de 35 000 m³ de bois sur les propriétés de nos clients. Du martelage à la mise en marché, nous encadrons les travaux de A à Z pour que vous ayez l'esprit tranquille.",
    prestations: [
      "Prescription de travaux",
      "Demande de permis",
      "Planification et suivi",
      "Voirie forestière",
      "Gestion du transport",
      "Mise en marché des bois",
      "Paiement des entrepreneurs",
    ],
    encart: {
      titre: "Format clé en main",
      points: [
        "Encadré par un contrat qui précise le partage des revenus, établi avant le début des travaux",
        "Supervision complète des opérations, de la planification à la vente du bois",
      ],
    },
    image: "foret-travaux",
    icone: "chainsaw",
  },
  {
    slug: "evaluation-forestiere",
    titre: "Évaluation forestière et expertise légale",
    tagline: "Le juste prix, démontré et défendu.",
    intro:
      "Valeur marchande, dommages causés par un tiers ou potentiel d'une propriété : nous effectuons les relevés et les recherches nécessaires pour démontrer et justifier le juste prix de votre boisé, y compris devant les tribunaux.",
    prestations: [
      "Évaluation de propriété",
      "Expertise lors d'expropriation",
      "Évaluation des dommages",
      "Inventaire forestier",
      "Témoignage d'expert",
    ],
    image: "hero-recolte",
    icone: "scale",
  },
  {
    slug: "erabliere",
    titre: "Érablière et acériculture",
    tagline: "Maximisez le potentiel de votre érablière.",
    intro:
      "De la santé du peuplement à la conformité d'entaillage, nous accompagnons les producteurs acéricoles avec des relevés précis et une cartographie GPS de leur réseau.",
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
    prestations: [
      "Évaluation de la santé de l'arbre",
      "Évaluation du risque",
      "Prescription de travaux correctifs",
      "État de santé des boisés municipaux",
      "Accompagnement des promoteurs immobiliers",
    ],
    image: "territoire",
    icone: "building",
  },
  {
    slug: "service-aux-entrepreneurs-en-travaux-sylvicoles",
    titre: "Service aux entrepreneurs en travaux sylvicoles",
    tagline: "Le soutien technique en forêt publique.",
    intro:
      "Un service de supervision et de planification offert aux entreprises qui réalisent des travaux sylvicoles en forêt publique.",
    prestations: [
      "Plan sondage",
      "Compilation des inventaires",
      "Analyse des résultats",
      "Prescription",
    ],
    image: "foret-travaux",
    icone: "clipboard",
  },
];
