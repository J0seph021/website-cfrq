// Couverture de CFRQ par municipalité, pour l'outil « CFRQ est-il actif chez
// vous? » (composant VerifierSecteur).
//
// CFRQ est présent là où il a accès à l'aide financière du PAMVFP, c'est-à-dire
// sur le territoire des six agences qui l'accréditent (voir agences.ts). La
// réponse dépend donc de l'agence, pas des dossiers qu'on a déjà dans la
// municipalité.
//
// Source : PlaniLogix, extraction du 2026-10-21. Chaque municipalité du
// répertoire officiel (planilogix.municipalites, désignations M, V, P, CT, VL
// et CU : ni territoire non organisé ni réserve) est placée dans l'agence dont
// le territoire contient un point de sa surface (ST_PointOnSurface dans
// planilogix.agence_geo, couche du MRNF publiée le 2026-05-30). Code vide :
// aucune agence (Montréal, Laval, Basse-Côte-Nord, Jamésie...). Les homonymes
// d'une même MRC (village et paroisse du même nom) sont fusionnés.
//
// Pas relié en direct : si les territoires d'agence changent, refaire
// l'extraction. Les tirets demi-cadratins des noms officiels sont remplacés
// par des traits d'union (règle de rédaction du site).
//
// Aucun nombre ici (le dépôt est public) : on dit où CFRQ peut intervenir,
// jamais combien de dossiers il y a.

/** Agences qui accréditent CFRQ (numéros du MRNF). */
export const AGENCES_CFRQ = ["031", "041", "091", "121", "122", "171"];

/** Nom officiel de chaque agence, tel que publié dans la couche du MRNF. */
export const NOMS_AGENCES: Record<string, string> = {
  "011": "Agence régionale de mise en valeur des forêts privées du Bas-Saint-Laurent",
  "023": "Agence régionale de mise en valeur des forêts privées du Saguenay-Lac-Saint-Jean",
  "031": "Agence des forêts privées de Québec 03",
  "041": "Agence régionale de mise en valeur des forêts privées mauriciennes",
  "051": "Agence de mise en valeur de la forêt privée de l'Estrie",
  "071": "Agence des forêts privées de l'Outaouais",
  "081": "Agence régionale de mise en valeur des forêts privées du Témiscamingue",
  "082": "Agence régionale de mise en valeur des forêts privées de l'Abitibi",
  "091": "Agence de mise en valeur des forêts privées de la Côte-Nord",
  "111": "Agence régionale de mise en valeur des forêts privées de la Gaspésie-Les-Îles",
  "121": "Agence régionale de mise en valeur des forêts privées de la Chaudière",
  "122": "Agence de mise en valeur des forêts privées des Appalaches",
  "141": "Agence régionale de mise en valeur des forêts privées de Lanaudière",
  "151": "Agence régionale de mise en valeur des forêts privées des Laurentides",
  "161": "Agence forestière de la Montérégie",
  "171": "Agence forestière des Bois-Francs",
};

/** [numéro d'agence ("" : aucune), MRC, municipalités séparées par « ; »]. */
export const COUVERTURE: [string, string, string][] = [
  ["", "Caniapiscau", "Fermont;Schefferville"],
  ["", "Communauté maritime des Îles-de-la-Madeleine", "Les Îles-de-la-Madeleine"],
  ["", "Jamésie", "Chapais;Chibougamau;Matagami"],
  ["", "Laval", "Laval"],
  ["", "Le Golfe-du-Saint-Laurent", "Blanc-Sablon;Bonne-Espérance;Côte-Nord-du-Golfe-du-Saint-Laurent;Gros-Mécatina;Saint-Augustin"],
  ["", "Minganie", "Havre-Saint-Pierre;L'Île-d'Anticosti;Natashquan"],
  ["", "Montréal", "Baie-D'Urfé;Beaconsfield;Côte-Saint-Luc;Dollard-des-Ormeaux;Dorval;Hampstead;Kirkland;L'Île-Dorval;Mont-Royal;Montréal;Montréal-Est;Montréal-Ouest;Pointe-Claire;Sainte-Anne-de-Bellevue;Senneville;Westmount"],
  ["011", "Kamouraska", "Kamouraska;La Pocatière;Mont-Carmel;Rivière-Ouelle;Saint-Alexandre-de-Kamouraska;Saint-André-de-Kamouraska;Saint-Bruno-de-Kamouraska;Saint-Denis-De La Bouteillerie;Saint-Gabriel-Lalemant;Saint-Germain-de-Kamouraska;Saint-Joseph-de-Kamouraska;Saint-Pacôme;Saint-Pascal;Saint-Philippe-de-Néri;Sainte-Hélène-de-Kamouraska"],
  ["011", "La Matanie", "Baie-des-Sables;Grosses-Roches;Les Méchins;Matane;Saint-Adelme;Saint-Jean-de-Cherbourg;Saint-Léandre;Saint-René-de-Matane;Saint-Ulric;Sainte-Félicité;Sainte-Paule"],
  ["011", "La Matapédia", "Albertville;Amqui;Causapscal;Lac-au-Saumon;Saint-Alexandre-des-Lacs;Saint-Cléophas;Saint-Damase;Saint-Léon-le-Grand;Saint-Moïse;Saint-Noël;Saint-Tharcisius;Saint-Vianney;Saint-Zénon-du-Lac-Humqui;Sainte-Florence;Sainte-Irène;Sainte-Marguerite-Marie;Sayabec;Val-Brillant"],
  ["011", "La Mitis", "Grand-Métis;La Rédemption;Les Hauteurs;Métis-sur-Mer;Mont-Joli;Padoue;Price;Saint-Charles-Garnier;Saint-Donat;Saint-Gabriel-de-Rimouski;Saint-Joseph-de-Lepage;Saint-Octave-de-Métis;Sainte-Angèle-de-Mérici;Sainte-Flavie;Sainte-Jeanne-d'Arc-de-la-Mitis;Sainte-Luce"],
  ["011", "Les Basques", "Notre-Dame-des-Neiges;Saint-Clément;Saint-Éloi;Saint-Jean-de-Dieu;Saint-Mathieu-de-Rioux;Saint-Médard;Saint-Simon-de-Rimouski;Sainte-Françoise;Sainte-Rita;Trois-Pistoles"],
  ["011", "Rimouski-Neigette", "Esprit-Saint;La Trinité-des-Monts;Rimouski;Saint-Anaclet-de-Lessard;Saint-Eugène-de-Ladrière;Saint-Fabien;Saint-Marcellin;Saint-Narcisse-de-Rimouski;Saint-Valérien"],
  ["011", "Rivière-du-Loup", "Cacouna;L'Isle-Verte;Notre-Dame-des-Sept-Douleurs;Notre-Dame-du-Portage;Rivière-du-Loup;Saint-Antonin;Saint-Arsène;Saint-Cyprien;Saint-Épiphane;Saint-François-Xavier-de-Viger;Saint-Hubert-de-Rivière-du-Loup;Saint-Modeste;Saint-Paul-de-la-Croix"],
  ["011", "Témiscouata", "Auclair;Biencourt;Dégelis;Lac-des-Aigles;Lejeune;Packington;Pohénégamook;Rivière-Bleue;Saint-Athanase;Saint-Elzéar-de-Témiscouata;Saint-Eusèbe;Saint-Honoré-de-Témiscouata;Saint-Jean-de-la-Lande;Saint-Juste-du-Lac;Saint-Louis-du-Ha! Ha!;Saint-Marc-du-Lac-Long;Saint-Michel-du-Squatec;Saint-Pierre-de-Lamy;Témiscouata-sur-le-Lac"],
  ["023", "Lac-Saint-Jean-Est", "Alma;Desbiens;Hébertville;L'Ascension-de-Notre-Seigneur;Labrecque;Lamarche;Métabetchouan-Lac-à-la-Croix;Saint-Gédéon;Saint-Henri-de-Taillon;Saint-Ludger-de-Milot;Saint-Nazaire;Sainte-Monique"],
  ["023", "Le Domaine-du-Roy", "Chambord;La Doré;Lac-Bouchette;Roberval;Saint-André-du-Lac-Saint-Jean;Saint-Félicien;Saint-François-de-Sales;Saint-Prime;Sainte-Hedwidge"],
  ["023", "Le Fjord-du-Saguenay", "Bégin;Ferland-et-Boilleau;L'Anse-Saint-Jean;Larouche;Petit-Saguenay;Rivière-Éternité;Saint-Ambroise;Saint-Charles-de-Bourget;Saint-David-de-Falardeau;Saint-Félix-d'Otis;Saint-Fulgence;Saint-Honoré;Sainte-Rose-du-Nord"],
  ["023", "Maria-Chapdelaine", "Albanel;Dolbeau-Mistassini;Girardville;Normandin;Notre-Dame-de-Lorette;Péribonka;Saint-Augustin;Saint-Edmond-les-Plaines;Saint-Eugène-d'Argentenay;Saint-Stanislas;Saint-Thomas-Didyme;Sainte-Jeanne-d'Arc"],
  ["023", "Saguenay", "Saguenay"],
  ["031", "Charlevoix", "Baie-Saint-Paul;L'Isle-aux-Coudres;Les Éboulements;Petite-Rivière-Saint-François;Saint-Hilarion;Saint-Urbain"],
  ["031", "Charlevoix-Est", "Baie-Sainte-Catherine;Clermont;La Malbaie;Notre-Dame-des-Monts;Saint-Aimé-des-Lacs;Saint-Irénée;Saint-Siméon"],
  ["031", "L'Île-d'Orléans", "Saint-François-de-l'Île-d'Orléans;Saint-Jean-de-l'Île-d'Orléans;Saint-Laurent-de-l'Île-d'Orléans;Saint-Pierre-de-l'Île-d'Orléans;Sainte-Famille-de-l'Île-d'Orléans;Sainte-Pétronille"],
  ["031", "La Côte-de-Beaupré", "Beaupré;Boischatel;Château-Richer;L'Ange-Gardien;Saint-Ferréol-les-Neiges;Saint-Joachim;Saint-Louis-de-Gonzague-du-Cap-Tourmente;Saint-Tite-des-Caps;Sainte-Anne-de-Beaupré"],
  ["031", "La Jacques-Cartier", "Fossambault-sur-le-Lac;Lac-Beauport;Lac-Delage;Lac-Saint-Joseph;Saint-Gabriel-de-Valcartier;Sainte-Brigitte-de-Laval;Sainte-Catherine-de-la-Jacques-Cartier;Shannon;Stoneham-et-Tewkesbury"],
  ["031", "Portneuf", "Cap-Santé;Deschambault-Grondines;Donnacona;Lac-Sergent;Neuville;Pont-Rouge;Portneuf;Rivière-à-Pierre;Saint-Alban;Saint-Basile;Saint-Casimir;Saint-Gilbert;Saint-Léonard-de-Portneuf;Saint-Marc-des-Carrières;Saint-Raymond;Saint-Thuribe;Saint-Ubalde;Sainte-Christine-d'Auvergne"],
  ["031", "Québec", "L'Ancienne-Lorette;Notre-Dame-des-Anges;Québec;Saint-Augustin-de-Desmaures"],
  ["041", "La Tuque", "La Bostonnais;La Tuque;Lac-Édouard"],
  ["041", "Les Chenaux", "Batiscan;Champlain;Notre-Dame-du-Mont-Carmel;Saint-Luc-de-Vincennes;Saint-Maurice;Saint-Narcisse;Saint-Prosper-de-Champlain;Saint-Stanislas;Sainte-Anne-de-la-Pérade;Sainte-Geneviève-de-Batiscan"],
  ["041", "Maskinongé", "Charette;Louiseville;Maskinongé;Saint-Alexis-des-Monts;Saint-Barnabé;Saint-Boniface;Saint-Édouard-de-Maskinongé;Saint-Élie-de-Caxton;Saint-Étienne-des-Grès;Saint-Justin;Saint-Léon-le-Grand;Saint-Mathieu-du-Parc;Saint-Paulin;Saint-Sévère;Sainte-Angèle-de-Prémont;Sainte-Ursule;Yamachiche"],
  ["041", "Mékinac", "Grandes-Piles;Hérouxville;Lac-aux-Sables;Notre-Dame-de-Montauban;Saint-Adelphe;Saint-Roch-de-Mékinac;Saint-Séverin;Saint-Tite;Sainte-Thècle;Trois-Rives"],
  ["041", "Shawinigan", "Shawinigan"],
  ["041", "Trois-Rivières", "Trois-Rivières"],
  ["051", "Coaticook", "Barnston-Ouest;Coaticook;Compton;Dixville;East Hereford;Martinville;Saint-Herménégilde;Saint-Malo;Saint-Venant-de-Paquette;Sainte-Edwidge-de-Clifton;Stanstead-Est;Waterville"],
  ["051", "Le Granit", "Audet;Frontenac;Lac-Drolet;Lac-Mégantic;Lambton;Marston;Milan;Nantes;Notre-Dame-des-Bois;Piopolis;Saint-Augustin-de-Woburn;Saint-Ludger;Saint-Robert-Bellarmin;Saint-Romain;Saint-Sébastien;Sainte-Cécile-de-Whitton;Stornoway;Stratford;Val-Racine"],
  ["051", "Le Haut-Saint-François", "Ascot Corner;Bury;Chartierville;Cookshire-Eaton;Dudswell;East Angus;Hampden;La Patrie;Lingwick;Newport;Saint-Isidore-de-Clifton;Scotstown;Weedon;Westbury"],
  ["051", "Le Val-Saint-François", "Bonsecours;Cleveland;Kingsbury;Lawrenceville;Maricourt;Melbourne;Racine;Richmond;Saint-Claude;Saint-Denis-de-Brompton;Saint-François-Xavier-de-Brompton;Sainte-Anne-de-la-Rochelle;Stoke;Ulverton;Val-Joli;Valcourt;Windsor"],
  ["051", "Les Sources", "Danville;Ham-Sud;Saint-Adrien;Saint-Camille;Saint-Georges-de-Windsor;Val-des-Sources;Wotton"],
  ["051", "Memphrémagog", "Austin;Ayer's Cliff;Bolton-Est;Eastman;Hatley;Magog;North Hatley;Ogden;Orford;Potton;Saint-Benoît-du-Lac;Saint-Étienne-de-Bolton;Sainte-Catherine-de-Hatley;Stanstead;Stukely-Sud"],
  ["051", "Sherbrooke", "Sherbrooke"],
  ["071", "Gatineau", "Gatineau"],
  ["071", "La Vallée-de-la-Gatineau", "Aumond;Blue Sea;Bois-Franc;Bouchette;Cayamant;Déléage;Denholm;Egan-Sud;Gracefield;Grand-Remous;Kazabazua;Lac-Sainte-Marie;Low;Maniwaki;Messines;Montcerf-Lytton;Sainte-Thérèse-de-la-Gatineau"],
  ["071", "Les Collines-de-l'Outaouais", "Cantley;Chelsea;L'Ange-Gardien;La Pêche;Pontiac;Val-des-Monts"],
  ["071", "Papineau", "Boileau;Bowman;Chénéville;Duhamel;Fassett;Lac-des-Plages;Lac-Simon;Lochaber;Lochaber-Partie-Ouest;Mayo;Montebello;Montpellier;Mulgrave-et-Derry;Namur;Notre-Dame-de-Bonsecours;Notre-Dame-de-la-Paix;Notre-Dame-de-la-Salette;Papineauville;Plaisance;Ripon;Saint-André-Avellin;Saint-Émile-de-Suffolk;Saint-Sixte;Thurso;Val-des-Bois"],
  ["071", "Pontiac", "Alleyn-et-Cawood;Bristol;Bryson;Campbell's Bay;Chichester;Clarendon;Fort-Coulonge;L'Île-du-Grand-Calumet;L'Isle-aux-Allumettes;Litchfield;Mansfield-et-Pontefract;Otter Lake;Portage-du-Fort;Rapides-des-Joachims;Shawville;Sheenboro;Thorne;Waltham"],
  ["081", "Témiscamingue", "Béarn;Belleterre;Duhamel-Ouest;Fugèreville;Guérin;Kipawa;Laforce;Latulipe-et-Gaboury;Laverlochère-Angliers;Lorrainville;Moffet;Nédélec;Notre-Dame-du-Nord;Rémigny;Saint-Bruno-de-Guigues;Saint-Édouard-de-Fabre;Saint-Eugène-de-Guigues;Témiscaming;Ville-Marie"],
  ["082", "Abitibi", "Amos;Barraute;Berry;Champneuf;La Corne;La Morandière-Rochebaucourt;La Motte;Landrienne;Launay;Preissac;Saint-Dominique-du-Rosaire;Saint-Marc-de-Figuery;Saint-Mathieu-d'Harricana;Sainte-Gertrude-Manneville;Trécesson"],
  ["082", "Abitibi-Ouest", "Authier;Authier-Nord;Chazel;Clermont;Clerval;Duparquet;Dupuy;Gallichan;La Reine;La Sarre;Macamic;Normétal;Palmarolle;Poularies;Rapide-Danseur;Roquemaure;Saint-Lambert;Sainte-Germaine-Boulé;Sainte-Hélène-de-Mancebourg;Taschereau;Val-Saint-Gilles"],
  ["082", "Jamésie", "Lebel-sur-Quévillon"],
  ["082", "La Vallée-de-l'Or", "Belcourt;Malartic;Rivière-Héva;Senneterre;Val-d'Or"],
  ["082", "Rouyn-Noranda", "Rouyn-Noranda"],
  ["091", "La Haute-Côte-Nord", "Colombier;Forestville;Les Bergeronnes;Les Escoumins;Longue-Rive;Portneuf-sur-Mer;Sacré-Coeur;Tadoussac"],
  ["091", "Manicouagan", "Baie-Comeau;Baie-Trinité;Chute-aux-Outardes;Franquelin;Godbout;Pointe-aux-Outardes;Pointe-Lebel;Ragueneau"],
  ["091", "Minganie", "Aguanish;Baie-Johan-Beetz;Longue-Pointe-de-Mingan;Rivière-au-Tonnerre;Rivière-Saint-Jean"],
  ["091", "Sept-Rivières", "Port-Cartier;Sept-Îles"],
  ["111", "Avignon", "Carleton-sur-Mer;Escuminac;L'Ascension-de-Patapédia;Maria;Matapédia;Nouvelle;Pointe-à-la-Croix;Ristigouche-Sud-Est;Saint-Alexis-de-Matapédia;Saint-André-de-Restigouche;Saint-François-d'Assise"],
  ["111", "Bonaventure", "Bonaventure;Caplan;Cascapédia-Saint-Jules;Hope;Hope Town;New Carlisle;New Richmond;Paspébiac;Saint-Alphonse;Saint-Elzéar;Saint-Godefroi;Saint-Siméon;Shigawake"],
  ["111", "Communauté maritime des Îles-de-la-Madeleine", "Grosse-Île"],
  ["111", "La Côte-de-Gaspé", "Cloridorme;Gaspé;Grande-Vallée;Murdochville;Petite-Vallée"],
  ["111", "La Haute-Gaspésie", "Cap-Chat;La Martre;Marsoui;Mont-Saint-Pierre;Rivière-à-Claude;Saint-Maxime-du-Mont-Louis;Sainte-Anne-des-Monts;Sainte-Madeleine-de-la-Rivière-Madeleine"],
  ["111", "Le Rocher-Percé", "Chandler;Grande-Rivière;Percé;Port-Daniel-Gascons;Sainte-Thérèse-de-Gaspé"],
  ["121", "Beauce-Centre", "Beauceville;Saint-Alfred;Saint-Frédéric;Saint-Joseph-de-Beauce;Saint-Joseph-des-Érables;Saint-Jules;Saint-Odilon-de-Cranbourne;Saint-Séverin;Saint-Victor;Tring-Jonction"],
  ["121", "Beauce-Sartigan", "Courcelles-Saint-Évariste;La Guadeloupe;Lac-Poulin;Notre-Dame-des-Pins;Saint-Benoît-Labre;Saint-Côme-Linière;Saint-Éphrem-de-Beauce;Saint-Gédéon-de-Beauce;Saint-Georges;Saint-Hilaire-de-Dorset;Saint-Honoré-de-Shenley;Saint-Martin;Saint-Philibert;Saint-René;Saint-Simon-les-Mines;Saint-Théophile"],
  ["121", "La Nouvelle-Beauce", "Frampton;Saint-Bernard;Saint-Elzéar;Saint-Isidore;Saint-Lambert-de-Lauzon;Sainte-Hénédine;Sainte-Marguerite;Sainte-Marie;Saints-Anges;Scott;Vallée-Jonction"],
  ["121", "Les Appalaches", "Adstock;Beaulac-Garthby;Disraeli;East Broughton;Irlande;Kinnear's Mills;Sacré-Coeur-de-Jésus;Saint-Adrien-d'Irlande;Saint-Fortunat;Saint-Jacques-de-Leeds;Saint-Jacques-le-Majeur-de-Wolfestown;Saint-Jean-de-Brébeuf;Saint-Joseph-de-Coleraine;Saint-Julien;Saint-Pierre-de-Broughton;Sainte-Clotilde-de-Beauce;Sainte-Praxède;Thetford Mines"],
  ["121", "Lotbinière", "Dosquet;Laurier-Station;Leclercville;Lotbinière;Notre-Dame-du-Sacré-Coeur-d'Issoudun;Saint-Agapit;Saint-Antoine-de-Tilly;Saint-Apollinaire;Saint-Édouard-de-Lotbinière;Saint-Flavien;Saint-Gilles;Saint-Janvier-de-Joly;Saint-Narcisse-de-Beaurivage;Saint-Patrice-de-Beaurivage;Saint-Sylvestre;Sainte-Agathe-de-Lotbinière;Sainte-Croix;Val-Alain"],
  ["122", "Bellechasse", "Armagh;Beaumont;Honfleur;La Durantaye;Notre-Dame-Auxiliatrice-de-Buckland;Saint-Anselme;Saint-Charles-de-Bellechasse;Saint-Damien-de-Buckland;Saint-Gervais;Saint-Henri;Saint-Lazare-de-Bellechasse;Saint-Léon-de-Standon;Saint-Malachie;Saint-Michel-de-Bellechasse;Saint-Nazaire-de-Dorchester;Saint-Nérée-de-Bellechasse;Saint-Philémon;Saint-Raphaël;Saint-Vallier;Sainte-Claire"],
  ["122", "L'Islet", "L'Islet;Saint-Adalbert;Saint-Aubert;Saint-Cyrille-de-Lessard;Saint-Damase-de-L'Islet;Saint-Jean-Port-Joli;Saint-Marcel;Saint-Omer;Saint-Pamphile;Saint-Roch-des-Aulnaies;Sainte-Félicité;Sainte-Louise;Sainte-Perpétue;Tourville"],
  ["122", "Les Etchemins", "Lac-Etchemin;Saint-Benjamin;Saint-Camille-de-Lellis;Saint-Cyprien;Saint-Louis-de-Gonzague;Saint-Luc-de-Bellechasse;Saint-Magloire;Saint-Prosper;Saint-Zacharie;Sainte-Aurélie;Sainte-Justine;Sainte-Rose-de-Watford;Sainte-Sabine"],
  ["122", "Lévis", "Lévis"],
  ["122", "Montmagny", "Berthier-sur-Mer;Cap-Saint-Ignace;Lac-Frontière;Montmagny;Notre-Dame-du-Rosaire;Saint-Antoine-de-l'Isle-aux-Grues;Saint-Fabien-de-Panet;Saint-François-de-la-Rivière-du-Sud;Saint-Just-de-Bretenières;Saint-Paul-de-Montminy;Saint-Pierre-de-la-Rivière-du-Sud;Sainte-Apolline-de-Patton;Sainte-Euphémie-sur-Rivière-du-Sud;Sainte-Lucie-de-Beauregard"],
  ["141", "D'Autray", "Berthierville;La Visitation-de-l'Île-Dupas;Lanoraie;Lavaltrie;Mandeville;Saint-Barthélemy;Saint-Cléophas-de-Brandon;Saint-Cuthbert;Saint-Didace;Saint-Gabriel;Saint-Gabriel-de-Brandon;Saint-Ignace-de-Loyola;Saint-Norbert;Sainte-Élisabeth;Sainte-Geneviève-de-Berthier"],
  ["141", "Joliette", "Crabtree;Joliette;Notre-Dame-de-Lourdes;Notre-Dame-des-Prairies;Saint-Ambroise-de-Kildare;Saint-Charles-Borromée;Saint-Paul;Saint-Pierre;Saint-Thomas;Sainte-Mélanie"],
  ["141", "L'Assomption", "Charlemagne;L'Assomption;L'Épiphanie;Repentigny;Saint-Sulpice"],
  ["141", "Les Moulins", "Mascouche;Terrebonne"],
  ["141", "Matawinie", "Chertsey;Entrelacs;Notre-Dame-de-la-Merci;Rawdon;Saint-Alphonse-Rodriguez;Saint-Côme;Saint-Damien;Saint-Donat;Saint-Félix-de-Valois;Saint-Jean-de-Matha;Saint-Michel-des-Saints;Saint-Zénon;Sainte-Béatrix;Sainte-Émélie-de-l'Énergie;Sainte-Marcelline-de-Kildare"],
  ["141", "Montcalm", "Saint-Alexis;Saint-Calixte;Saint-Esprit;Saint-Jacques;Saint-Liguori;Saint-Lin-Laurentides;Saint-Roch-de-l'Achigan;Saint-Roch-Ouest;Sainte-Julienne;Sainte-Marie-Salomé"],
  ["151", "Antoine-Labelle", "Chute-Saint-Philippe;Ferme-Neuve;Kiamika;L'Ascension;La Macaza;Lac-des-Écorces;Lac-du-Cerf;Lac-Saguay;Lac-Saint-Paul;Mont-Laurier;Mont-Saint-Michel;Nominingue;Notre-Dame-de-Pontmain;Notre-Dame-du-Laus;Rivière-Rouge;Saint-Aimé-du-Lac-des-Îles;Sainte-Anne-du-Lac"],
  ["151", "Argenteuil", "Brownsburg-Chatham;Gore;Grenville;Grenville-sur-la-Rouge;Harrington;Lachute;Mille-Isles;Saint-André-d'Argenteuil;Wentworth"],
  ["151", "Deux-Montagnes", "Deux-Montagnes;Oka;Pointe-Calumet;Saint-Eustache;Saint-Joseph-du-Lac;Saint-Placide;Sainte-Marthe-sur-le-Lac"],
  ["151", "La Rivière-du-Nord", "Prévost;Saint-Colomban;Saint-Hippolyte;Saint-Jérôme;Sainte-Sophie"],
  ["151", "Les Laurentides", "Amherst;Arundel;Barkmere;Brébeuf;Huberdeau;Ivry-sur-le-Lac;La Conception;La Minerve;Labelle;Lac-Supérieur;Lac-Tremblant-Nord;Lantier;Mont-Blanc;Mont-Tremblant;Montcalm;Sainte-Agathe-des-Monts;Sainte-Lucie-des-Laurentides;Val-David;Val-des-Lacs;Val-Morin"],
  ["151", "Les Pays-d'en-Haut", "Estérel;Lac-des-Seize-Îles;Morin-Heights;Piedmont;Saint-Adolphe-d'Howard;Saint-Sauveur;Sainte-Adèle;Sainte-Anne-des-Lacs;Sainte-Marguerite-du-Lac-Masson;Wentworth-Nord"],
  ["151", "Mirabel", "Mirabel"],
  ["151", "Thérèse-De Blainville", "Blainville;Bois-des-Filion;Boisbriand;Lorraine;Rosemère;Sainte-Anne-des-Plaines;Sainte-Thérèse"],
  ["161", "Acton", "Acton Vale;Béthanie;Roxton;Roxton Falls;Saint-Nazaire-d'Acton;Saint-Théodore-d'Acton;Sainte-Christine;Upton"],
  ["161", "Beauharnois-Salaberry", "Beauharnois;Saint-Étienne-de-Beauharnois;Saint-Louis-de-Gonzague;Saint-Stanislas-de-Kostka;Saint-Urbain-Premier;Sainte-Martine;Salaberry-de-Valleyfield"],
  ["161", "Brome-Missisquoi", "Abercorn;Bedford;Bolton-Ouest;Brigham;Brome;Bromont;Cowansville;Dunham;East Farnham;Farnham;Frelighsburg;Lac-Brome;Notre-Dame-de-Stanbridge;Pike River;Saint-Armand;Saint-Ignace-de-Stanbridge;Sainte-Sabine;Stanbridge East;Stanbridge Station;Sutton"],
  ["161", "La Haute-Yamaska", "Granby;Roxton Pond;Saint-Alphonse-de-Granby;Saint-Joachim-de-Shefford;Sainte-Cécile-de-Milton;Shefford;Warden;Waterloo"],
  ["161", "La Vallée-du-Richelieu", "Beloeil;Carignan;Chambly;McMasterville;Mont-Saint-Hilaire;Otterburn Park;Saint-Antoine-sur-Richelieu;Saint-Basile-le-Grand;Saint-Charles-sur-Richelieu;Saint-Denis-sur-Richelieu;Saint-Jean-Baptiste;Saint-Marc-sur-Richelieu;Saint-Mathieu-de-Beloeil"],
  ["161", "Le Haut-Richelieu", "Clarenceville;Henryville;Lacolle;Mont-Saint-Grégoire;Noyan;Saint-Alexandre;Saint-Blaise-sur-Richelieu;Saint-Jean-sur-Richelieu;Saint-Paul-de-l'Île-aux-Noix;Saint-Sébastien;Saint-Valentin;Sainte-Anne-de-Sabrevois;Sainte-Brigide-d'Iberville;Venise-en-Québec"],
  ["161", "Le Haut-Saint-Laurent", "Dundee;Elgin;Franklin;Godmanchester;Havelock;Hinchinbrooke;Howick;Huntingdon;Ormstown;Saint-Anicet;Saint-Chrysostome;Sainte-Barbe;Très-Saint-Sacrement"],
  ["161", "Les Jardins-de-Napierville", "Hemmingford;Napierville;Saint-Bernard-de-Lacolle;Saint-Cyprien-de-Napierville;Saint-Édouard;Saint-Jacques-le-Mineur;Saint-Michel;Saint-Patrice-de-Sherrington;Saint-Rémi;Sainte-Clotilde"],
  ["161", "Les Maskoutains", "La Présentation;Saint-Barnabé-Sud;Saint-Bernard-de-Michaudville;Saint-Damase;Saint-Dominique;Saint-Hugues;Saint-Hyacinthe;Saint-Jude;Saint-Liboire;Saint-Louis;Saint-Marcel-de-Richelieu;Saint-Pie;Saint-Simon;Saint-Valérien-de-Milton;Sainte-Hélène-de-Bagot;Sainte-Madeleine;Sainte-Marie-Madeleine"],
  ["161", "Longueuil", "Boucherville;Brossard;Longueuil;Saint-Bruno-de-Montarville;Saint-Lambert"],
  ["161", "Marguerite-D'Youville", "Calixa-Lavallée;Contrecoeur;Saint-Amable;Sainte-Julie;Varennes;Verchères"],
  ["161", "Pierre-De Saurel", "Massueville;Saint-Aimé;Saint-David;Saint-Gérard-Majella;Saint-Joseph-de-Sorel;Saint-Ours;Saint-Robert;Saint-Roch-de-Richelieu;Sainte-Anne-de-Sorel;Sainte-Victoire-de-Sorel;Sorel-Tracy;Yamaska"],
  ["161", "Roussillon", "Candiac;Châteauguay;Delson;La Prairie;Léry;Mercier;Saint-Constant;Saint-Isidore;Saint-Mathieu;Saint-Philippe;Sainte-Catherine"],
  ["161", "Rouville", "Ange-Gardien;Marieville;Richelieu;Rougemont;Saint-Césaire;Saint-Mathias-sur-Richelieu;Saint-Paul-d'Abbotsford;Sainte-Angèle-de-Monnoir"],
  ["161", "Vaudreuil-Soulanges", "Coteau-du-Lac;Hudson;L'Île-Cadieux;L'Île-Perrot;Les Cèdres;Les Coteaux;Notre-Dame-de-l'Île-Perrot;Pincourt;Pointe-des-Cascades;Pointe-Fortune;Rigaud;Rivière-Beaudette;Saint-Clet;Saint-Lazare;Saint-Polycarpe;Saint-Télesphore;Saint-Zotique;Sainte-Justine-de-Newton;Sainte-Marthe;Terrasse-Vaudreuil;Très-Saint-Rédempteur;Vaudreuil-Dorion;Vaudreuil-sur-le-Lac"],
  ["171", "Arthabaska", "Chesterville;Daveluyville;Ham-Nord;Kingsey Falls;Maddington Falls;Notre-Dame-de-Ham;Saint-Albert;Saint-Christophe-d'Arthabaska;Saint-Louis-de-Blandford;Saint-Norbert-d'Arthabaska;Saint-Rémi-de-Tingwick;Saint-Rosaire;Saint-Samuel;Saint-Valère;Sainte-Clotilde-de-Horton;Sainte-Élizabeth-de-Warwick;Sainte-Hélène-de-Chester;Sainte-Séraphine;Saints-Martyrs-Canadiens;Tingwick;Victoriaville;Warwick"],
  ["171", "Bécancour", "Bécancour;Deschaillons-sur-Saint-Laurent;Fortierville;Lemieux;Manseau;Parisville;Saint-Pierre-les-Becquets;Saint-Sylvère;Sainte-Cécile-de-Lévrard;Sainte-Françoise;Sainte-Marie-de-Blandford;Sainte-Sophie-de-Lévrard"],
  ["171", "Drummond", "Drummondville;Durham-Sud;L'Avenir;Lefebvre;Notre-Dame-du-Bon-Conseil;Saint-Bonaventure;Saint-Cyrille-de-Wendover;Saint-Edmond-de-Grantham;Saint-Eugène;Saint-Félix-de-Kingsey;Saint-Germain-de-Grantham;Saint-Guillaume;Saint-Lucien;Saint-Majorique-de-Grantham;Saint-Pie-de-Guire;Sainte-Brigitte-des-Saults;Wickham"],
  ["171", "L'Érable", "Inverness;Laurierville;Lyster;Notre-Dame-de-Lourdes;Plessisville;Princeville;Saint-Ferdinand;Saint-Pierre-Baptiste;Sainte-Sophie-d'Halifax;Villeroy"],
  ["171", "Nicolet-Yamaska", "Aston-Jonction;Baie-du-Febvre;Grand-Saint-Esprit;La Visitation-de-Yamaska;Nicolet;Pierreville;Saint-Célestin;Saint-Elphège;Saint-François-du-Lac;Saint-Léonard-d'Aston;Saint-Wenceslas;Saint-Zéphirin-de-Courval;Sainte-Eulalie;Sainte-Monique;Sainte-Perpétue"],
];
