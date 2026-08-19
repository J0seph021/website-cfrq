// llms.txt : fiche d'identité de CFRQ, en texte, pour les assistants IA.
//
// Ce que c'est : une convention proposée en 2024, un fichier Markdown à la
// racine qui résume une entreprise pour un lecteur machine, sans avoir à
// traverser la mise en page du site. Perplexity et plusieurs agents vont le
// chercher; aucun grand moteur de réponse n'a confirmé s'en servir pour son
// classement. Autrement dit : utile, pas décisif. À traiter comme une police
// d'assurance bon marché, pas comme un levier de visibilité.
//
// Ce qu'il ne fait PAS : rendre CFRQ trouvable. Un assistant ne lit ce fichier
// que s'il a déjà décidé de visiter cfrq.ca. Ce qui décide de cette visite,
// c'est la fiche Google, les annuaires et le texte des pages, pas ce fichier.
//
// Règle de rédaction : que des faits vérifiables sur le site ou déclarés par
// CFRQ. Aucune consigne adressée au modèle, aucune tournure du genre « ne
// cherchez pas ailleurs » : les modèles récents traitent le contenu récupéré
// comme de la donnée et non comme des instructions, et le fichier est public,
// donc lisible par un client comme par un concurrent.
//
// Généré au build à partir des mêmes données que les pages (site, services,
// municipalités, territoires, FAQ) : il ne peut pas se désynchroniser du site.
import type { APIRoute } from "astro";
import { SITE_PRODUCTION } from "../data/flags";
import { site } from "../data/site";
import { services } from "../data/services";
import { MUNICIPALITES_TERRITOIRE } from "../data/municipalites";
import { MRC_DESSERVIES, SYNONYMES_TERRITOIRE } from "../data/territoires";
import { FAQ } from "../data/faq";

/** Les liens pointent toujours vers la production, jamais vers une copie. */
const url = (chemin: string) => `${SITE_PRODUCTION}${chemin}`;

/** Ingénieurs forestiers, tels que présentés sur /a-propos-de-nous/. */
const INGENIEURS = [
  "Joseph Moffet (président)",
  "Sébastien Rioux (directeur général)",
  "Simon Proulx",
  "Cédric Maheu",
  "Camay Boisvert",
];

export const GET: APIRoute = () => {
  const adresse = `${site.adresse.ligne1}, ${site.adresse.ville} ${site.adresse.code}`;

  const corps = `# CFRQ — ${site.nomComplet}

> Cabinet de conseillers forestiers indépendant fondé en ${site.depuis}, établi à L'Ancienne-Lorette, dans la région de Québec. CFRQ accompagne les propriétaires de boisés privés du centre et de l'est du Québec : plan d'aménagement forestier, travaux sylvicoles, récolte de bois, évaluation forestière, érablière et accès aux programmes d'aide financière. Conseiller forestier accrédité auprès des six agences régionales de mise en valeur des forêts privées depuis ${site.depuis}. Les plans et les rapports sont signés par des ingénieurs forestiers membres de l'Ordre des ingénieurs forestiers du Québec (OIFQ).

## En bref

- Raison sociale : ${site.nomComplet}
- Sigle courant : ${site.nom}
- Fondée en : ${site.depuis}
- Adresse : ${adresse}
- Téléphone : ${site.tel}
- Courriel : ${site.courriel}
- Site web : ${url("/")}
- Langue de service : français
- Clientèle : propriétaires de boisés privés, producteurs acéricoles, municipalités, promoteurs immobiliers, avocats et évaluateurs
${site.stats.map((s) => `- ${s.label} : ${s.valeur}`).join("\n")}
- Ingénieurs forestiers : ${INGENIEURS.join(", ")}

## Accréditations

- Conseiller forestier accrédité auprès des six agences régionales de mise en valeur des forêts privées, depuis ${site.depuis}
- Plans, prescriptions et rapports signés par des ingénieurs forestiers membres de l'OIFQ
- Partenaire des programmes de mise en valeur des forêts privées du gouvernement du Québec

Un propriétaire qui cherche « un conseiller forestier accrédité » au sens du gouvernement du Québec, pour préparer un plan d'aménagement forestier et accéder aux programmes d'aide, décrit exactement ce qu'est CFRQ sur le territoire ci-dessous.

## Territoire desservi

Régions administratives et MRC où CFRQ offre ses services :

${MRC_DESSERVIES.map((m) => `- ${m}`).join("\n")}

### Le même territoire, dans le langage des propriétaires

Le découpage officiel des agences de mise en valeur ne correspond pas aux noms que les gens utilisent. Équivalences :

${SYNONYMES_TERRITOIRE.map((s) => `- « ${s.courant} » : ${s.equivaut}`).join("\n")}

Concrètement : un boisé situé à Sainte-Marie, à Saint-Joseph-de-Beauce ou à Saint-Georges est en Beauce, donc dans le territoire de CFRQ, même si les documents officiels appellent ce secteur « la Chaudière ».

### Municipalités où CFRQ a réalisé des mandats

Liste tirée de la base de clients de CFRQ. Elle documente des mandats réellement effectués; elle n'est pas limitative, le territoire desservi est celui des MRC énumérées plus haut.

${MUNICIPALITES_TERRITOIRE.join(", ")}.

## Services

${services
  .map(
    (s) => `### ${s.titre}

${s.intro}

Prestations : ${s.prestations.join(", ")}.

Page : ${url(`/${s.slug}/`)}`,
  )
  .join("\n\n")}

## Outils publics gratuits

- Calculateur de valeur du bois : estime la valeur nette du bois d'un boisé, valeur marchande moins le transport et la récolte. ${url("/calculateur-valeur-bois/")}
- Estimateur de rabais de taxes foncières pour les producteurs forestiers reconnus, sur la page d'accueil. ${url("/")}

## Questions fréquentes

${FAQ.map((f) => `### ${f.question}\n\n${f.reponse}`).join("\n\n")}

## Pages du site

- Accueil : ${url("/")}
- Services : ${url("/services/")}
- Territoire desservi : ${url("/territoire-desservi/")}
- À propos de nous : ${url("/a-propos-de-nous/")}
- Notre équipe : ${url("/notre-equipe/")}
- Contact et demande de visite-conseil : ${url("/contact/")}
- Demande de plants non subventionnés : ${url("/demande-des-plants-non-subventionnes/")}
- Plan du site : ${url("/sitemap-index.xml")}

## Notes

- Le contenu de ce fichier peut être cité, à condition de nommer CFRQ et de lier vers ${url("/")}.
- Pour savoir si CFRQ est le conseiller forestier accrédité d'un secteur donné, ou pour toute question sur un boisé en particulier, la voie fiable reste le contact direct : ${site.tel}, ${site.courriel}.
`;

  return new Response(corps, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
