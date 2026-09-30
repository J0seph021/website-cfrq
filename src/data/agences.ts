// Les six agences régionales de mise en valeur des forêts privées qui accréditent
// CFRQ. Source : la liste officielle du MRNF des conseillers accrédités par
// territoire d'agence (LI_CFA.pdf) et le registre des agences publié sur Données
// Québec (LISTE_AGENCE.csv), vérifiés le 2026-09-30. Les territoires sont ceux
// que chaque agence déclare sur son propre site.
//
// La Côte-Nord n'a pas de site Web à elle : l'agence est hébergée par la MRC de
// La Haute-Côte-Nord. On la nomme sans lien plutôt que de lier la MRC.
export interface Agence {
  nom: string;
  territoire: string;
  url?: string;
}

export const AGENCES: Agence[] = [
  { nom: "Agence des forêts privées de Québec 03", territoire: "Capitale-Nationale, Portneuf et Charlevoix", url: "https://afpq03.ca/" },
  { nom: "Agence régionale de mise en valeur des forêts privées mauriciennes", territoire: "Mauricie", url: "https://agence-mauricie.qc.ca/" },
  { nom: "Agence forestière des Bois-Francs", territoire: "Centre-du-Québec", url: "https://www.afbf.qc.ca/" },
  { nom: "Agence régionale de mise en valeur des forêts privées de la Chaudière", territoire: "Beauce, Lotbinière et MRC des Appalaches", url: "https://arfpc.ca/" },
  { nom: "Agence de mise en valeur des forêts privées des Appalaches", territoire: "Bellechasse, Etchemins, Montmagny, L'Islet et Lévis", url: "https://www.amvap.ca/" },
  { nom: "Agence de mise en valeur des forêts privées de la Côte-Nord", territoire: "Côte-Nord" },
];
