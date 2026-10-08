/**
 * noms-salutation.mjs — Le nom à qui dire « Bonjour » dans l'espace client
 * =============================================================================
 * Remplit `public.producteurs.nom_salutation` (portail « Relevés forestiers ») à
 * partir de PlaniLogix : le REPRÉSENTANT du dossier (planilogix.producteur.
 * representant), sinon le propriétaire quand c'est une personne. Une société sans
 * représentant reste à null : le portail dit alors « Bonjour » tout court, jamais
 * « Bonjour, 3 Versants ».
 *
 * PlaniLogix écrit les noms de mille façons : « BOUCHER, GUY », « MORISSETTE
 * ALEXANDRE », « REJEAN BELANGER », « Frederic Roy », « M.JEAN-GUY MALTAIS ET MME
 * RACHELLE MALTAIS », « , »… On remet tout en « Prénom Nom » :
 *  - les ~2 800 noms au format sûr « NOM, PRÉNOM » apprennent quels mots sont des
 *    prénoms et lesquels sont des noms de famille, ce qui tranche l'ordre des
 *    noms écrits sans virgule ;
 *  - les accents viennent des variantes accentuées vues ailleurs dans PlaniLogix
 *    (« GAGNÉ », « Laliberté »), complétées d'une liste de prénoms courants ;
 *  - deux personnes (« ET », « & », deux paires) : on garde la première.
 *
 * Usage :
 *   node --env-file=scripts/.env scripts/noms-salutation.mjs           # APERÇU (n'écrit rien)
 *   node --env-file=scripts/.env scripts/noms-salutation.mjs --apply   # écrit au portail
 */
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const { PLANILOGIX_DB_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!PLANILOGIX_DB_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Manque PLANILOGIX_DB_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY dans scripts/.env");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");

// Prénoms courants dont PlaniLogix perd l'accent (majuscules sans accent).
const PRENOMS_ACCENTS = `ANDRÉ ANDRÉE AMÉLIE ANAÏS AURÉLIE AURÉLIEN BÉATRICE BENOÎT CÉCILE CÉDRIC CÉLINE CLÉMENT
  DANIÈLE DÉSIRÉ ÉDOUARD ÉLIANE ÉLISABETH ÉLISE ÉLODIE ÉMILE ÉMILIE ÉRIC ÉTIENNE ÈVE ÉVELYNE FÉLIX FRANÇOIS
  FRANÇOISE FRÉDÉRIC FRÉDÉRIQUE GAÉTAN GAÉTANE GÉRALD GÉRALDINE GÉRARD GENEVIÈVE GISÈLE GRÉGOIRE GRÉGORY HÉLÈNE
  HÉLOÏSE HERVÉ INÈS IRÈNE JÉRÉMIE JÉRÔME JOËL JOSÉ JOSÉE LÉA LÉANDRE LÉO LÉON LÉONARD LÉONIE LÉOPOLD LOÏC
  MÉDÉRIC MÉLANIE MICHÈLE NADÈGE NOËL NOËLLA RAPHAËL RÉAL RÉGENT RÉGIS RÉJEAN RÉJEANNE RÉMI RENÉ RENÉE
  SÉBASTIEN SÉVERIN SIMÉON STÉPHANE STÉPHANIE THÉO THÉODORE THÉRÈSE VALÈRE VALÉRIE VÉRONIQUE ZOÉ`.split(/\s+/).filter(Boolean);

// Prénoms qui ne sont presque jamais des noms de famille : connaissance de départ,
// pour les prénoms trop rares dans PlaniLogix (« ANTHONY ARSENEAULT »).
const PRENOMS_SURS = `ANTHONY KEVIN JONATHAN SAMUEL MAXIME STEPHANE SEBASTIEN FREDERIC GUILLAUME CHRISTIAN PATRICK
  ERIC DANIEL YVES REJEAN GAETAN GHISLAIN NORMAND JESSIE JIMMY STEVE TOMMY BILLY DANY JASMIN YANNICK CARL DONALD
  RINO STYVE COREY BRANDON XAVIER FABIEN JEREMIE JOEL PETER MARIE ANNE JULIE NATHALIE SYLVIE LINDA JOHANNE MANON LOUISE
  DIANE FRANCINE LISE LUCIE ISABELLE CAROLINE SOPHIE ANNIE MELANIE VALERIE KARINE MARTINE JOSEE GENEVIEVE
  CATHERINE CLAUDIA JESSICA AMELIE AUDREY EMILIE STEPHANIE VERONIQUE NANCY LYNE GUYLAINE JOCELYNE MONIQUE NICOLE
  CAROLE HELENE SUZANNE DENISE GINETTE LORRAINE RACHEL SOLANGE PIERRETTE JEANNINE MICHELINE MADELEINE ANITA SONJA
  EVE MARIE-EVE ANNE-MARIE JEAN-FRANCOIS JEAN-GUY JEAN-MARC PIERRE-LUC MARC-ANDRE MARC-ANTOINE`.split(/\s+/).filter(Boolean);

// Noms de famille québécois courants dont l'accent est bien établi.
const NOMS_ACCENTS = `AUDÉ BÉDARD BÉGIN BÉLAND BÉLANGER BÉLISLE BÉRARD BÉRUBÉ CHÉNIER CHRÉTIEN CÔTÉ CRÉPEAU DÉRY
  DESCHÊNES DÉSILETS DÉSY DUBÉ ÉMOND FRÉCHETTE FRÉGEAU GAGNÉ GÉLINAS GÉNÉREUX GRÉGOIRE HÉBERT HÉON HÉROUX
  LABRÈCHE LÉGARÉ LÉGER LÉPINE LÉTOURNEAU LÉVEILLÉ LÉVESQUE MÉNARD MÉTHOT MÉTIVIER NÉRON PAGÉ PARÉ PÉLOQUIN
  PÉPIN PÉRUSSE PRÉVOST RÉAUME RÉMILLARD RHÉAUME SÉGUIN SÉNÉCAL SÉVIGNY TÉTREAULT TÉTU THÉBERGE THÉRIAULT
  THÉRIEN VALLÉE VÉRONNEAU VÉZINA PROVENÇAL RIVIÈRE BÉLIVEAU DÉCARY SÉNÉCHAL ÉTHIER DUCHÊNE`.split(/\s+/).filter(Boolean);

const sansAccent = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const aDesAccents = (s) => /[À-ſ]/.test(s);

// Sociétés, groupements, successions : pas une personne à saluer.
const SOCIETE = /\b(INC|ENR|S\.?E\.?N\.?C\.?|LTEE|CIE|FERME|FERMES|GESTION|GROUPEMENT|G\.?F\.?A|QUEBEC|CANADA|ERABLIERE|ATELIER|IMMEUBLES|SOCIETE|SYNDICAT|CORPORATION|CORP|COOP|COOPERATIVE|MUNICIPALITE|FIDUCIE|SUCCESSION|SUCC|INVESTISSEMENTS?|ENTREPRISES?|CLUB|ASSOCIATION|FONDATION|PLACEMENTS|HOLDING|DOMAINE|BOISES|SCIERIE|TRANSPORTS?|EXCAVATION|CONSTRUCTION|FORESTERIE|AGENCE|MINISTERE|VILLE|PAROISSE|FABRIQUE|POURVOIRIE|RESERVE|PROPRIETES|SERVICES|INDUSTRIES|LES|SOC|ENERGIE|BOISE|FORETS?|PRODUITS|SUCRERIES?|RENOVATIONS?|COURTIER|ASSURANCES?)\b|\d{3,}/;
const TITRE = /^(M|MR|MME|MLLE|MM|DR|ME)\.?$/;
const INITIALE = /^[A-Z]\.?$/;

const mots = (s) => s.split(/\s+/).map((m) => m.replace(/^[.,]+|[,]+$/g, "")).filter((m) => m && !INITIALE.test(sansAccent(m)) && !TITRE.test(sansAccent(m)));

// --------------------------------------------------------------- apprentissage
// Fréquences prénom / nom de famille, apprises des noms « NOM, PRÉNOM ».
const P = new Map(), S = new Map();
const inc = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
for (const p of PRENOMS_SURS) inc(P, p, 3);
function apprendre(s) {
  const t = (s ?? "").trim();
  const m = t.match(/^([^,]+),\s*([^\s,]+)$/);
  if (!m || SOCIETE.test(sansAccent(t))) return;
  for (const x of mots(m[1])) inc(S, sansAccent(x));
  inc(P, sansAccent(m[2]));
}
// Probabilité qu'un mot soit un prénom (lissée : un inconnu vaut 0,5).
function pPrenom(mot) {
  const k = sansAccent(mot);
  const f = (x) => ((P.get(x) ?? 0) + 1) / ((P.get(x) ?? 0) + (S.get(x) ?? 0) + 2);
  if (P.has(k) || S.has(k) || !k.includes("-")) return f(k);
  return f(k.split("-")[0]); // « MARIE-CHANTAL » inconnu : on juge « MARIE »
}

// Accents : la variante accentuée la plus fréquente vue dans PlaniLogix.
const ACCENTS = new Map();
function noterAccents(s) {
  for (const brut of (s ?? "").split(/[\s,&/()]+/)) {
    for (const part of brut.split(/[-']/)) {
      if (part.length < 2 || !aDesAccents(part)) continue;
      const k = sansAccent(part), v = part.toUpperCase();
      const m = ACCENTS.get(k) ?? new Map();
      m.set(v, (m.get(v) ?? 0) + 1);
      ACCENTS.set(k, m);
    }
  }
}
function accentuer(part) {
  if (aDesAccents(part)) return part.toUpperCase();
  const m = ACCENTS.get(part.toUpperCase());
  if (!m) return part.toUpperCase();
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
function casse(mot) {
  return mot.split(/([-'])/).map((p) => {
    if (p === "-" || p === "'") return p;
    const a = accentuer(p);
    return a.charAt(0) + a.slice(1).toLowerCase();
  }).join("");
}

// ------------------------------------------------------------------ analyse
/** { prenom, nom, sur } ou null. `sur` = false quand l'ordre a été deviné par défaut.
 *  `indice` : les mots du nom du dossier. Pour un représentant écrit sans virgule,
 *  le mot qu'on y retrouve est son nom de famille (« PETER FUCHS », « FERME FUCHS INC »). */
function personne(brut, indice = new Set()) {
  if (SOCIETE.test(sansAccent(brut ?? ""))) return null;
  let s = (brut ?? "").replace(/\([^)]*\)/g, " ").trim();
  if (!s || /^[\s,.-]*$/.test(s)) return null;
  s = s.split(/\s+(?:ET|AND)\s+|\s*[&;/]\s*/i)[0].trim();
  s = s.replace(/^(M|MR|MME|MLLE|DR)\.\s*/i, "").replace(/^(MME|MLLE|MR|DR)\s+/i, "");

  if (s.includes(",")) {
    const [gauche, droite = ""] = s.split(",").map((x) => x.trim());
    const d = mots(droite), g = mots(gauche);
    if (d.length && g.length && (d.length === 1 || pPrenom(d[0]) >= 0.5)) {
      // « GRONDIN, JEAN CLAUDE » : deux prénoms de suite forment un prénom composé.
      const prenom = d.length >= 2 && pPrenom(d[1]) > 0.6 ? `${d[0]}-${d[1]}` : d[0];
      return { prenom, nom: g.join(" "), sur: true };
    }
    // « LABRIE, LAPOINTE FRANCINE », « G.F.A. …, » : on retente sans la virgule.
    return sansVirgule(g.length >= 2 ? g : d.length >= 2 ? d : [...g, ...d], false, indice);
  }
  return sansVirgule(mots(s), s !== s.toUpperCase(), indice);
}

// Premières moitiés de prénoms composés souvent écrits sans trait d'union.
const DEBUT_COMPOSE = new Set(["MARIE", "JEAN", "PIERRE", "ANNE", "LOUIS", "MARC", "PAUL", "JOSEPH"]);

function sansVirgule(t, casseMixte = false, indice = new Set()) {
  if (t.length < 2) return null;
  const k = sansAccent;
  if (t.length >= 3) {
    // « JEAN CLAUDE TREMBLAY » / « TREMBLAY JEAN CLAUDE » / « BOUFFARD MARIE EVE »
    const [a, b] = [t[0], t[1]], [y, z] = [t[t.length - 2], t[t.length - 1]];
    const compose = (u, v) => (DEBUT_COMPOSE.has(k(u)) && pPrenom(v) >= 0.3) || (pPrenom(u) > 0.6 && pPrenom(v) > 0.6);
    if (compose(a, b) && pPrenom(z) <= 0.5) return { prenom: `${a}-${b}`, nom: t.slice(2).join(" "), sur: true };
    if (compose(y, z) && pPrenom(a) <= 0.5) return { prenom: `${y}-${z}`, nom: t.slice(0, -2).join(" "), sur: true };
  }
  const [premier, dernier] = [t[0], t[t.length - 1]];
  const prenomEnTete = { prenom: premier, nom: t.slice(1).join(" "), sur: true };
  const nomEnTete = { prenom: dernier, nom: t.slice(0, -1).join(" "), sur: true };
  // Le nom du dossier tranche : le mot qu'on y retrouve est le nom de famille, sauf
  // s'il s'agit d'un prénom évident (« FERME PIERRE ET FILS » ne fait pas de Pierre un nom).
  if (indice.has(k(dernier)) && !indice.has(k(premier)) && pPrenom(dernier) < 0.7) return prenomEnTete;
  if (indice.has(k(premier)) && !indice.has(k(dernier)) && pPrenom(premier) < 0.7) return nomEnTete;
  // Sinon, l'ordre le plus probable : un prénom d'un côté ET un nom de l'autre
  // (« STÉPHANE JACQUES » : Jacques est aussi un nom de famille, Stéphane presque jamais).
  const pP = pPrenom(premier), pD = pPrenom(dernier);
  const prenomNom = pP * (1 - pD), nomPrenom = pD * (1 - pP);
  if (prenomNom > 2 * nomPrenom) return prenomEnTete;
  if (nomPrenom > 2 * prenomNom) return nomEnTete;
  // Indécis : PlaniLogix écrit « NOM PRÉNOM » en majuscules ; en casse mixte, les
  // gens ont tapé le nom dans l'ordre naturel.
  return casseMixte
    ? { prenom: t[0], nom: t.slice(1).join(" "), sur: false }
    : { prenom: t[t.length - 1], nom: t.slice(0, -1).join(" "), sur: false };
}

const formater = (p) => `${p.prenom.split(" ").map(casse).join(" ")} ${p.nom.split(" ").map(casse).join(" ")}`;

// ------------------------------------------------------------------ exécution
// Même connexion que les autres scripts : sans sslmode dans l'URL (pg le forcerait
// en verify-full), certificat du serveur PlaniLogix accepté tel quel.
const db = new pg.Client({ connectionString: PLANILOGIX_DB_URL.replace(/[?&]sslmode=[^&]*/gi, ""), ssl: { rejectUnauthorized: false } });
await db.connect();
const { rows } = await db.query(`SELECT id, nom_prod, representant FROM planilogix.producteur`);
const { rows: autres } = await db.query(`
  SELECT representant AS s FROM planilogix.paf UNION ALL SELECT signataire_producteur FROM planilogix.paf
  UNION ALL SELECT representant FROM planilogix.erabliere
  UNION ALL SELECT concat_ws(' ', prenom_contact, nom_contact) FROM planilogix.erabliere`);
await db.end();

for (const r of rows) { apprendre(r.nom_prod); apprendre(r.representant); noterAccents(r.nom_prod); noterAccents(r.representant); }
for (const a of autres) noterAccents(a.s);
for (const p of [...PRENOMS_ACCENTS, ...NOMS_ACCENTS]) { const k = sansAccent(p); if (!ACCENTS.has(k)) ACCENTS.set(k, new Map([[p, 1]])); }

// --essai="REPRÉSENTANT|NOM DU DOSSIER;…" : voir ce que donnent des noms précis.
const essai = process.argv.find((a) => a.startsWith("--essai="));
if (essai) {
  if (process.env.DEBUG_NOMS) for (const m of process.env.DEBUG_NOMS.split(",")) console.log(`  p(${m}) = ${pPrenom(m).toFixed(2)} P=${P.get(m) ?? 0} S=${S.get(m) ?? 0}`);
  for (const cas of essai.slice(8).split(";")) {
    const [r, n = ""] = cas.split("|");
    const p = personne(r, new Set(mots(n).map(sansAccent))) ?? personne(n);
    console.log(`  ${cas} -> ${p ? formater(p) : "(Bonjour seul)"}${p && !p.sur ? "  [ordre deviné]" : ""}`);
  }
  process.exit(0);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// Page par page : l'API du portail rend au plus 1 000 lignes par lecture, et
// `.limit(10000)` n'y change rien. Le 2026-10-08, le portail comptait 1 730
// dossiers et le script n'en voyait que 1 000 (les autres restaient sans salutation).
const portail = [];
for (let de = 0; ; de += 1000) {
  const { data, error } = await sb.from("producteurs").select("id").lt("id", 900000)
    .order("id").range(de, de + 999);
  if (error) throw error;
  portail.push(...data);
  if (data.length < 1000) break;
}
const auPortail = new Set(portail.map((p) => p.id));

const resultats = [];
for (const r of rows) {
  if (!auPortail.has(r.id)) continue;
  const rep = personne(r.representant, new Set(mots(r.nom_prod ?? "").map(sansAccent)));
  const prop = rep ? null : personne(r.nom_prod);
  const p = rep ?? prop;
  resultats.push({ id: r.id, nom_prod: r.nom_prod, representant: r.representant, source: rep ? "représentant" : prop ? "propriétaire" : "aucun", sur: p?.sur ?? true, nom_salutation: p ? formater(p) : null });
}

const compte = (f) => resultats.filter(f).length;
console.log(`${resultats.length} dossiers du portail : ${compte((r) => r.source === "représentant")} par le représentant, ` +
  `${compte((r) => r.source === "propriétaire")} par le propriétaire, ${compte((r) => r.source === "aucun")} sans nom (« Bonjour » seul). ` +
  `Ordre deviné par défaut : ${compte((r) => !r.sur)}.`);
const echantillon = [...resultats].sort(() => Math.random() - 0.5).slice(0, 40);
for (const r of echantillon) console.log(`  ${String(r.id).padStart(5)} | ${(r.representant ?? "").padEnd(34).slice(0, 34)} | ${(r.nom_prod ?? "").padEnd(36).slice(0, 36)} -> ${r.nom_salutation ?? "(Bonjour seul)"}${r.sur ? "" : "  [ordre deviné]"}`);
if (process.argv.includes("--sans-nom")) for (const r of resultats.filter((x) => !x.nom_salutation)) console.log(`  ø ${r.representant} | ${r.nom_prod}`);
if (process.argv.includes("--incertains")) for (const r of resultats.filter((x) => !x.sur)) console.log(`  ? ${r.representant} | ${r.nom_prod} -> ${r.nom_salutation}`);
for (const id of (process.argv.find((a) => a.startsWith("--ids="))?.slice(6).split(",") ?? [])) {
  const r = resultats.find((x) => x.id === Number(id));
  console.log(`  #${id}: ${r ? `${r.representant} | ${r.nom_prod} -> ${r.nom_salutation}` : "absent du portail"}`);
}

if (!APPLY) { console.log("\nAPERÇU seulement. Relancer avec --apply pour écrire au portail."); process.exit(0); }

let ecrits = 0;
for (let i = 0; i < resultats.length; i += 25) {
  await Promise.all(resultats.slice(i, i + 25).map(async (r) => {
    const { error: e } = await sb.from("producteurs").update({ nom_salutation: r.nom_salutation }).eq("id", r.id);
    if (e) throw new Error(`#${r.id} : ${e.message}`);
    ecrits++;
  }));
}
console.log(`\n${ecrits} dossiers mis à jour.`);
