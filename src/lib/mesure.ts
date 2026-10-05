// Événements de conversion envoyés à GA4.
//
// Sans eux, GA4 ne compte que des pages vues : impossible de dire quel canal
// (Google, Facebook, direct) amène les demandes, puisque leads_web ne garde
// que la page du site d'où part le formulaire, pas la source d'origine.
//
// Les noms à marquer comme « événements clés » dans GA4 (Administration >
// Événements clés) :
//   - generate_lead      une demande est partie (visite-conseil, plants,
//                        calculateurs). Nom recommandé par Google.
//   - clic_telephone     clic sur un lien tel:
//   - clic_courriel      clic sur un lien mailto:
// Et des signaux secondaires, à laisser en simples événements :
//   - calculateur_utilise  première saisie dans un calculateur
//   - video_releve         vidéo du relevé (page Services) ; paramètre etape :
//                          debut, moitie ou fin, une fois chacun par visite
//
// Les deux derniers clics et le calculateur sont captés par délégation dans
// Analytique.astro; seuls les formulaires appellent `mesurer` eux-mêmes, parce
// qu'eux seuls savent si l'envoi a réussi.
//
// Aucun effet hors production : `gtag` n'y est pas chargé (voir
// analytiqueActive() dans data/flags.ts). Les données personnelles saisies
// dans les formulaires ne sont jamais transmises, seulement le nom du formulaire.

type Parametres = Record<string, string | number>;

export function mesurer(evenement: string, parametres: Parametres = {}): void {
  try {
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    gtag?.("event", evenement, parametres);
  } catch {
    /* la mesure ne doit jamais bloquer un formulaire */
  }
}

/**
 * Une demande est partie. `envoi` distingue la capture serveur du filet de
 * secours (brouillon de courriel) : dans le second cas, la personne doit
 * encore envoyer le courriel elle-même.
 */
export function mesurerDemande(formulaire: string, envoi: "serveur" | "secours"): void {
  mesurer("generate_lead", { formulaire, envoi });
}
