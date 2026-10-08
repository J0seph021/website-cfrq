/**
 * Noms de documents lisibles ET distincts pour un même producteur.
 *
 * Pourquoi : l'espace client affichait « Prescription sylvicole 2019 » deux fois pour
 * deux fichiers différents (deux pages, deux versions), ou « Plan d'aménagement
 * forestier 2020 » trois fois pour trois plans. Le client croit à un doublon.
 *
 * On tire l'information du nom de fichier du centre documentaire, qui la porte déjà :
 *   rap_1231680230066_23121.pdf -> rapport déposé en décembre 2023 (AAMM + rang)
 *   prs_1231680250071_v2.pdf    -> version 2 de la prescription
 *   prs_1231680190123_2.JPG     -> partie 2 (deuxième page ou photo)
 *   paf_1231680190126.pdf       -> plan nº 1231680190126 ; paf_4128210-214.pdf -> lots
 * puis on numérote en dernier recours, pour garantir des noms uniques.
 *
 * Partagé par l'Edge Function sync-documents (Deno) et scripts/renommer-documents.mjs
 * (Node 24, qui lit le TypeScript directement) : garder une syntaxe TypeScript effaçable.
 */

export interface DocANommer {
  /** Code du centre documentaire : prs, rap, paf, rtf ou exp (plan d'érablière). */
  code: string;
  /** Nom du fichier (original ou tel que rangé dans le stockage). */
  fichier: string;
  /** Millésime, « 2019 » ou « 2019.0 », ou null. */
  annee: unknown;
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
  "septembre", "octobre", "novembre", "décembre"];

function millesime(annee: unknown): string {
  const m = String(annee ?? "").match(/(19|20)\d{2}/);
  return m ? m[0] : "";
}

function avecAnnee(base: string, annee: string): string {
  return annee ? `${base} ${annee}` : base;
}

/** Date de dépôt d'un rapport d'exécution : 5 ou 4 chiffres AAMM[rang] après le numéro. */
function dateRapport(fichier: string): string | null {
  const m = fichier.match(/^rap_\d{13}_?(\d{2})(\d{2})\d?(?:[._-]|$)/i);
  if (!m) return null;
  const aa = Number(m[1]);
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12 || aa < 0 || aa > 60) return null;
  return `${MOIS[mm - 1]} ${2000 + aa}`;
}

/** Ce qui distingue deux fichiers d'une même prescription : version ou partie. */
function varianteFichier(fichier: string): string | null {
  const v = fichier.match(/_v(\d{1,2})(?:[._-]|$)/i);
  if (v) return `version ${v[1]}`;
  const p = fichier.match(/^[a-z]+_\d{13}_(\d{1,2})(?:[._-]|$)/i);
  if (p) return `partie ${p[1]}`;
  return null;
}

/**
 * Ce qui distingue deux plans d'une même année : le numéro du plan (10 chiffres et
 * plus), ou le lot cadastral (7 chiffres, parfois une plage « 4128210-214 »), que le
 * propriétaire reconnaît mieux que n'importe quel numéro interne.
 */
function detailPlan(fichier: string): string | null {
  const plan = fichier.match(/^paf_(\d{10,})/i)?.[1];
  if (plan) return `nº ${plan}`;
  const lot = fichier.match(/^paf_(\d{7})(-\d{1,7})?(?:[._-]|$)/i);
  if (lot) return lot[2] ? `lots ${lot[1]}${lot[2]}` : `lot ${lot[1]}`;
  return null;
}

/**
 * Numéro de prescription d'un fichier prs ou rap. L'espace client l'affiche déjà à côté
 * du titre (« nº 1231680190123 ») : deux prescriptions de numéros différents ne sont
 * donc pas des doublons, même avec le même titre.
 */
function numeroPrescription(doc: DocANommer): string {
  const code = doc.code.toLowerCase();
  if (code !== "prs" && code !== "rap") return "";
  return doc.fichier.match(/^(?:prs|rap)_(\d{13})/i)?.[1] ?? "";
}

function nomDeBase(doc: DocANommer): string {
  const annee = millesime(doc.annee);
  const code = doc.code.toLowerCase();
  if (code === "prs") return avecAnnee("Prescription sylvicole", annee);
  if (code === "rap") {
    const date = dateRapport(doc.fichier);
    return date ? `Rapport d'exécution, ${date}` : avecAnnee("Rapport d'exécution", annee);
  }
  if (code === "rtf") return avecAnnee("Rapport de taxes foncières", annee);
  // Plan d'érablière (PPAQ) ; l'annexe 2, les instructions et la page de signature
  // sont classées avec lui mais ne sont pas le plan.
  if (code === "exp") {
    const annexe = /annexe|inst|sign/i.test(doc.fichier);
    return avecAnnee(annexe ? "Annexe du plan d'érablière" : "Plan d'érablière", annee);
  }
  return avecAnnee("Plan d'aménagement forestier", annee);
}

/**
 * Renvoie un nom par document, dans le même ordre que l'entrée, uniques entre eux.
 * Les documents doivent être TOUS ceux d'un même producteur.
 */
export function nommerDocuments(docs: DocANommer[]): string[] {
  const noms = docs.map(nomDeBase);
  // Ce que le client voit : le titre ET le numéro affiché à côté.
  const cle = (i: number) => `${noms[i]}|${numeroPrescription(docs[i])}`;

  // 1) Les collisions reçoivent ce que le fichier dit d'elles.
  const groupes = new Map<string, number[]>();
  noms.forEach((_, i) => groupes.set(cle(i), [...(groupes.get(cle(i)) ?? []), i]));
  for (const indices of groupes.values()) {
    if (indices.length < 2) continue;
    for (const i of indices) {
      const doc = docs[i];
      const code = doc.code.toLowerCase();
      const detail = code === "paf" ? detailPlan(doc.fichier) : varianteFichier(doc.fichier);
      if (detail) noms[i] = `${noms[i]} (${detail})`;
    }
  }

  // 2) Ce qui se ressemble encore est numéroté, dans l'ordre des noms de fichier.
  const restants = new Map<string, number[]>();
  noms.forEach((_, i) => restants.set(cle(i), [...(restants.get(cle(i)) ?? []), i]));
  for (const indices of restants.values()) {
    if (indices.length < 2) continue;
    const nom = noms[indices[0]];
    const tries = [...indices].sort((a, b) => docs[a].fichier.localeCompare(docs[b].fichier));
    tries.forEach((i, rang) => { noms[i] = `${nom} (${rang + 1} de ${tries.length})`; });
  }
  return noms;
}
