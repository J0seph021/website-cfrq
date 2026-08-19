// Questions fréquentes, en texte brut.
//
// Source unique pour le balisage FAQPage de l'accueil (src/pages/index.astro)
// et pour le llms.txt (src/pages/llms.txt.ts). Les deux servent le même
// contenu à des lecteurs machine : les laisser diverger reviendrait à donner
// deux réponses différentes à la même question.
//
// La version affichée à l'écran vit à part, dans index.astro : elle porte de la
// mise en forme (gras, couleur) que ces lecteurs n'ont que faire.
export const FAQ: { question: string; reponse: string }[] = [
  {
    question: "Combien coûte une première visite d'un conseiller forestier?",
    reponse:
      "Contactez-nous pour connaître les modalités d'une visite-conseil. Un technicien forestier de CFRQ se déplace sur votre propriété pour évaluer votre boisé et discuter de vos objectifs.",
  },
  {
    question: "Ai-je droit à de l'aide financière pour aménager mon boisé?",
    reponse:
      "Si votre boisé fait plus de 4 hectares, oui, avec un plan d'aménagement forestier (PAF). Il donne accès au Programme d'aide à la mise en valeur des forêts privées (PAMVFP), au Programme de financement forestier et au remboursement des taxes foncières des producteurs forestiers reconnus.",
  },
  {
    question: "Qu'est-ce qu'un plan d'aménagement forestier?",
    reponse:
      "C'est un portrait de votre forêt (composition des peuplements, potentiel de production, milieux à protéger) préparé par un ingénieur forestier, avec des scénarios sylvicoles adaptés à vos objectifs. C'est aussi la porte d'entrée vers l'aide financière.",
  },
  {
    question: "Je viens d'hériter d'un boisé et je n'y connais rien. Pouvez-vous m'aider?",
    reponse:
      "Oui. CFRQ accompagne les nouveaux propriétaires du début à la fin : visite terrain, plan, travaux et suivi. Aucune connaissance forestière n'est requise de votre part.",
  },
  {
    question: "Faites-vous seulement les plans ou aussi les travaux?",
    reponse:
      "Les deux. Nos ingénieurs forestiers planifient et signent les plans et les rapports; nos techniciens organisent le chantier, supervisent les travaux sur le terrain et les vérifient, jusqu'au paiement des entrepreneurs.",
  },
  {
    question: "Quelles régions desservez-vous?",
    reponse:
      "La grande région de Québec, la Rive-Sud et l'est du Québec : Capitale-Nationale (Québec), Portneuf, Charlevoix, Côte-Nord, Mauricie, Bois-Francs, Chaudière et Appalaches. En langage courant : la région de Québec, la Beauce, Bellechasse, Lotbinière, Lévis, Thetford Mines et les Appalaches.",
  },
];
