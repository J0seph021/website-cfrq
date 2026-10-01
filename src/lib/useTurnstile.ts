// Turnstile pour les formulaires React. Fichier à part de turnstile.ts pour que
// les pages Astro (contact, plants, connexion) n'embarquent pas React.
import { useCallback, useRef } from "react";
import { monterTurnstile, type GardeTurnstile } from "./turnstile";

/**
 * `ref` va sur un <div> placé juste au-dessus du bouton d'envoi. C'est une ref
 * de rappel : le widget se monte quand le formulaire apparaît (après un calcul,
 * à l'ouverture d'une fenêtre) et se démonte quand il disparaît.
 */
export function useTurnstile(action: string) {
  const garde = useRef<GardeTurnstile | null>(null);
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      garde.current?.retirer();
      garde.current = el ? monterTurnstile(el, action) : null;
    },
    [action],
  );
  return {
    ref,
    jeton: () => garde.current?.jeton() ?? Promise.resolve(""),
    renouveler: () => garde.current?.renouveler(),
  };
}
