/**
 * Version « dossiers » de l'espace client : documents, carte, propriétés, travaux
 * et bilan, fiables pour tous les clients. On cache ce qui n'est pas prêt pour tout
 * le monde (peuplements, recommandations automatiques, calculateur de valeur du
 * bois, achat du Relevé / Portrait, en attente de la revue OIFQ) et on l'annonce
 * dans « Bientôt dans votre espace ». Passer à false pour le tableau de bord complet.
 *
 * Module sans process.env : il est lu à la fois par l'îlot React du portail (dans le
 * navigateur) et par les pages du site (page Services, qui ne doit pas dire le
 * Relevé « disponible » tant qu'il ne l'est pas).
 */
export const MODE_DOSSIERS = true;
