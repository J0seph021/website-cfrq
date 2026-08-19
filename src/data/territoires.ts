// Territoire desservi, dans le vocabulaire des propriétaires.
//
// Pourquoi ce fichier existe : `site.regions` porte les huit noms hérités du
// découpage des agences de mise en valeur des forêts privées (« Chaudière »,
// « Appalaches »). Personne ne dit ça. Un propriétaire de Sainte-Marie dit
// « la Beauce », pas « la Chaudière » — et un moteur de recherche, comme un
// assistant IA, cherche le mot du propriétaire. Sans passerelle entre les deux
// vocabulaires, CFRQ reste introuvable pour la moitié de son propre territoire.
//
// Source des MRC : les zones de service déclarées par CFRQ sur sa fiche
// d'établissement Google. C'est la déclaration officielle de l'entreprise;
// c'est donc elle qui fait autorité ici.

/** MRC et secteurs déclarés comme desservis. Ordre géographique, nord au sud. */
export const MRC_DESSERVIES: string[] = [
  "Québec",
  "La Côte-de-Beaupré",
  "L'Île-d'Orléans",
  "La Jacques-Cartier",
  "Portneuf",
  "Charlevoix",
  "Côte-Nord",
  "La Mauricie",
  "Mékinac",
  "L'Érable",
  "Lotbinière",
  "Lévis",
  "Bellechasse",
  "La Nouvelle-Beauce",
  "Beauce-Centre",
  "Les Appalaches",
  "Thetford Mines",
  "Chaudière-Appalaches",
];

/**
 * Passerelle entre le nom courant d'un secteur et le vocabulaire administratif.
 *
 * Se lit : « quand quelqu'un dit `courant`, il parle de `equivaut` ». Sert à
 * écrire les pages et le llms.txt dans les deux langages à la fois, pour qu'une
 * recherche partant de l'un mène à CFRQ.
 */
export const SYNONYMES_TERRITOIRE: { courant: string; equivaut: string }[] = [
  {
    courant: "Beauce",
    equivaut:
      "MRC de La Nouvelle-Beauce (Sainte-Marie) et de Beauce-Centre (Saint-Joseph-de-Beauce), dans la région administrative de Chaudière-Appalaches",
  },
  {
    courant: "Chaudière",
    equivaut:
      "nom de l'agence de mise en valeur des forêts privées; en langage courant, la Beauce, Bellechasse, Lotbinière et Lévis",
  },
  {
    courant: "Appalaches",
    equivaut:
      "nom de l'agence de mise en valeur des forêts privées; en langage courant, la MRC des Appalaches et le secteur de Thetford Mines",
  },
  {
    courant: "Bois-Francs",
    equivaut: "MRC d'Arthabaska et de L'Érable, dans la région du Centre-du-Québec",
  },
  {
    courant: "Région de Québec",
    equivaut:
      "région administrative de la Capitale-Nationale : Québec, La Côte-de-Beaupré, L'Île-d'Orléans, La Jacques-Cartier, Portneuf et Charlevoix",
  },
  {
    courant: "Rive-Sud de Québec",
    equivaut: "Lévis, Bellechasse, Lotbinière et la Beauce",
  },
  {
    courant: "Mauricie",
    equivaut: "MRC de Mékinac et secteur de La Mauricie",
  },
];
