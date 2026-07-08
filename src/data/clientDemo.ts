export const clientDemo = {
  prenom: "Jean",
  nom: "Jean Tremblay",
  numero: "CFRQ-2041",
  region: "Portneuf",
  statut: "Producteur forestier reconnu",
  membreDepuis: 2009,

  proprietes: [
    {
      lot: "Lot 4 521 832",
      municipalite: "Saint-Raymond",
      superficie: 42.6,
      peuplements: "Érablière rouge, sapinière à bouleau",
    },
    {
      lot: "Lot 4 521 911",
      municipalite: "Saint-Raymond",
      superficie: 18.3,
      peuplements: "Plantation d'épinette blanche (2025)",
    },
    {
      lot: "Lot 3 998 274",
      municipalite: "Sainte-Christine-d'Auvergne",
      superficie: 27.1,
      peuplements: "Peuplement mélangé, friche en régénération",
    },
  ],

  plan: {
    statut: "À jour",
    debut: 2021,
    fin: 2031,
    progression: 52,
  },

  travaux: [
    { date: "Mai 2026", type: "Éclaircie commerciale", lot: "Lot 4 521 832", surface: "6,2 ha", statut: "En cours" },
    { date: "Oct. 2025", type: "Reboisement (épinette blanche)", lot: "Lot 4 521 911", surface: "3,0 ha", statut: "Terminé" },
    { date: "Mars 2025", type: "Préparation de terrain", lot: "Lot 4 521 911", surface: "3,0 ha", statut: "Terminé" },
    { date: "Août 2024", type: "Dégagement de plantation", lot: "Lot 3 998 274", surface: "4,5 ha", statut: "Terminé" },
  ],

  documents: [
    { nom: "Plan d'aménagement forestier 2021-2031", type: "PDF", taille: "4,2 Mo", date: "Juin 2021" },
    { nom: "Prescription sylvicole, Éclaircie 2026", type: "PDF", taille: "1,1 Mo", date: "Avr. 2026" },
    { nom: "Rapport d'exécution, Reboisement 2025", type: "PDF", taille: "2,7 Mo", date: "Nov. 2025" },
    { nom: "Certificat de producteur forestier", type: "PDF", taille: "320 Ko", date: "Juil. 2021" },
  ],

  budget: { programme: "PAMVFP 2025-2026", alloue: 12400, utilise: 8150 },
  remboursementTaxes2025: 1190,

  echeances: [
    { date: "1 mai 2026", titre: "Demande de plants non subventionnés" },
    { date: "30 juin 2026", titre: "Étalement du revenu de producteur forestier (déclaration)" },
    { date: "Automne 2026", titre: "Révision mi-parcours du plan d'aménagement" },
  ],
};
