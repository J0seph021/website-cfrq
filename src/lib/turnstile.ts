// Cloudflare Turnstile : preuve qu'un humain envoie le formulaire.
//
// Pourquoi : la fonction capter-lead et la connexion de l'espace client
// envoient des courriels (confirmation au visiteur, notification à CFRQ, lien
// magique). Un robot qui les appelle en boucle ferait partir des courriels
// depuis cfrq@cfrq.ca vers n'importe quelle adresse. Le pot de miel et la
// limite de 5 envois par heure et par IP ne l'arrêtent pas : un robot appelle
// la fonction directement, sans passer par le formulaire.
//
// Chaque formulaire obtient un jeton du widget et l'envoie avec la demande ; le
// serveur le fait valider par Cloudflare (capter-lead pour les formulaires,
// Supabase Auth pour l'espace client). Un jeton ne sert qu'une fois et expire
// après 5 minutes : après chaque envoi, on en redemande un.
//
// Apparence « interaction-only » : la plupart des visiteurs ne voient rien. Le
// widget n'apparaît, à l'endroit du conteneur, que si Cloudflare veut un clic.

/**
 * Clé de site du widget « Site CFRQ » (tableau de bord Cloudflare > Turnstile).
 * Elle est PUBLIQUE par conception ; la clé secrète, elle, ne vit que côté
 * serveur (secret TURNSTILE_SECRET_KEY de capter-lead, réglage CAPTCHA de
 * Supabase Auth). **Vide = protection inactive** : aucun script Cloudflare
 * n'est chargé et les formulaires envoient un jeton vide.
 */
export const CLE_SITE_TURNSTILE = "";

// Clé de test de Cloudflare, qui réussit toujours sans rien afficher. Le widget
// réel refuse les noms d'hôte locaux ; en local on prend donc celle-ci. Son
// jeton factice est refusé par la vraie clé secrète : un envoi depuis le poste
// local échoue côté serveur et retombe sur le brouillon courriel, ce qui évite
// au passage de créer de faux prospects.
const CLE_TEST = "1x00000000000000000000AA";

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// Le temps d'attendre un jeton quand on clique « Envoyer » avant qu'il soit
// prêt, ce qui laisse le temps de cocher la case si Cloudflare la demande.
const ATTENTE_MAX_MS = 30_000;

type OptionsRendu = {
  sitekey: string;
  action?: string;
  language?: string;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "flexible" | "compact";
  appearance?: "always" | "execute" | "interaction-only";
  callback?: (jeton: string) => void;
  "before-interactive-callback"?: () => void;
  "expired-callback"?: () => void;
  "error-callback"?: (code: string) => void;
};

type TurnstileApi = {
  render: (conteneur: HTMLElement, options: OptionsRendu) => string | undefined;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Le widget d'un formulaire. */
export type GardeTurnstile = {
  /** Le jeton à joindre à l'envoi ; chaîne vide si Turnstile est inactif ou indisponible. */
  jeton(): Promise<string>;
  /** À appeler après chaque envoi : un jeton ne sert qu'une fois. */
  renouveler(): void;
  /** Démonte le widget (composant React retiré de la page). */
  retirer(): void;
};

const INACTIF: GardeTurnstile = {
  jeton: () => Promise.resolve(""),
  renouveler: () => {},
  retirer: () => {},
};

function cleDuSite(): string {
  if (!CLE_SITE_TURNSTILE) return "";
  const h = location.hostname;
  const local = h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
  return local ? CLE_TEST : CLE_SITE_TURNSTILE;
}

let chargement: Promise<TurnstileApi | null> | null = null;

function chargerApi(): Promise<TurnstileApi | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  chargement ??= new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve(window.turnstile ?? null);
    // Script bloqué (bloqueur de publicité, réseau d'entreprise) : on n'attend
    // pas, l'envoi part sans jeton et le serveur décide.
    s.onerror = () => {
      chargement = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return chargement;
}

/**
 * Monte le widget dans `conteneur`, à placer juste au-dessus du bouton d'envoi.
 * `action` nomme le formulaire dans les statistiques de Cloudflare
 * (lettres, chiffres, - et _ seulement). Le conteneur reste sans hauteur tant
 * que le widget est invisible ; sa marge s'écrit donc en
 * `data-[turnstile=visible]:…` pour ne pas creuser d'espace vide.
 */
export function monterTurnstile(conteneur: HTMLElement, action: string): GardeTurnstile {
  const cle = cleDuSite();
  if (!cle) return INACTIF;

  let api: TurnstileApi | null = null;
  let widgetId: string | undefined;
  let jetonCourant = "";
  let indisponible = false;
  let retire = false;
  let enAttente: ((j: string) => void)[] = [];

  const livrer = (j: string) => {
    const attente = enAttente;
    enAttente = [];
    for (const r of attente) r(j);
  };

  const pret = chargerApi().then((a) => {
    if (retire) return;
    if (!a) {
      indisponible = true;
      livrer("");
      return;
    }
    api = a;
    widgetId = a.render(conteneur, {
      sitekey: cle,
      action,
      language: "fr",
      theme: "light",
      size: "flexible",
      appearance: "interaction-only",
      callback: (j) => {
        jetonCourant = j;
        indisponible = false;
        livrer(j);
      },
      // Le widget va s'afficher : le conteneur prend alors sa marge, via la
      // variante Tailwind data-[turnstile=visible]. Invisible, il ne prend
      // aucune place.
      "before-interactive-callback": () => {
        conteneur.dataset.turnstile = "visible";
      },
      "expired-callback": () => {
        jetonCourant = "";
      },
      // Cloudflare réessaie de lui-même ; on libère quand même un envoi en
      // attente pour ne pas bloquer la personne.
      "error-callback": () => {
        jetonCourant = "";
        livrer("");
      },
    });
  });

  return {
    async jeton() {
      await pret;
      if (jetonCourant) return jetonCourant;
      if (indisponible || !api) return "";
      return new Promise<string>((resolve) => {
        const minuterie = setTimeout(() => {
          enAttente = enAttente.filter((r) => r !== fin);
          resolve("");
        }, ATTENTE_MAX_MS);
        const fin = (j: string) => {
          clearTimeout(minuterie);
          resolve(j);
        };
        enAttente.push(fin);
      });
    },
    renouveler() {
      jetonCourant = "";
      if (api && widgetId) api.reset(widgetId);
    },
    retirer() {
      retire = true;
      livrer("");
      if (api && widgetId) api.remove(widgetId);
    },
  };
}
