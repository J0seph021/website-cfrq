// Liens de l'outil « CFRQ est-il actif chez vous? » vers les pages de secteur.
//
// Calculé au build, dans la page Astro, puis passé en propriété au composant :
// importer secteurs.ts dans le composant enverrait tout le fichier au
// navigateur pour une poignée de liens.
//
// Chaque municipalité citée dans une page de secteur pointe vers son ancre. Un
// même nom peut exister dans deux agences de CFRQ (Saint-Séverin, en Mauricie
// et en Beauce) : on tranche alors par l'agence du secteur, et sans réponse
// unique on ne met pas de lien plutôt qu'un mauvais.
import type { LiensSecteurs } from "../components/VerifierSecteur";
import { AGENCES_CFRQ, COUVERTURE, NOMS_AGENCES } from "../data/couverture";
import { SECTEURS, ancre } from "../data/secteurs";
import { withBase } from "./url";

export function liensSecteurs(): LiensSecteurs {
  const couvertes = COUVERTURE.filter(([agence]) => AGENCES_CFRQ.includes(agence)).flatMap(([agence, mrc, noms]) =>
    noms.split(";").map((nom) => ({ nom, mrc, agence })),
  );
  const liens: LiensSecteurs = {};
  for (const s of SECTEURS) {
    for (const m of s.municipalites) {
      let candidates = couvertes.filter((c) => c.nom === m.nom);
      if (candidates.length > 1) candidates = candidates.filter((c) => NOMS_AGENCES[c.agence] === s.agence);
      if (candidates.length !== 1) continue;
      const c = candidates[0];
      liens[`${c.mrc}|${c.nom}`] = { href: `${withBase(`/ingenieur-forestier/${s.slug}`)}#${ancre(m.nom)}`, secteur: s.nom };
    }
  }
  return liens;
}
