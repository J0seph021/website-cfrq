// Edge Function publique : capture d'un lead du calculateur de taxes CFRQ.
// verify_jwt = false (endpoint public) : validation + honeypot + rate-limit.
// Ecriture par connexion Postgres DIRECTE (SUPABASE_DB_URL) via la RPC
// public.capter_lead_web (PlaniLogix n'expose pas de schema REST).
// Relance + notif via Microsoft Graph sendMail depuis cfrq@cfrq.ca (memes
// secrets M365 que la fonction send-email). Relance ecrite pour le persona
// Gardien du patrimoine (enquete FPFQ).
// Les demandes de plants (source=plants) sont en plus reportees dans le
// classeur SharePoint « Demande Feuillus.xlsx » via l'API Excel de Graph :
// best-effort, le resultat est annonce dans la notification interne.
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const TROP_DE_DEMANDES =
  "Trop de demandes envoyées depuis cette connexion. Réessayez dans une heure, ou écrivez-nous à cfrq@cfrq.ca.";

const cad = (n: number | null) =>
  n == null ? "-" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const M365_TENANT = Deno.env.get("M365_TENANT") || "";
const M365_CLIENT_ID = Deno.env.get("M365_CLIENT_ID") || "";
const M365_CLIENT_SECRET = Deno.env.get("M365_CLIENT_SECRET") || "";
const M365_SENDER = Deno.env.get("M365_SENDER") || "cfrq@cfrq.ca";
const LEADS_NOTIFY = Deno.env.get("LEADS_NOTIFY_EMAIL") || M365_SENDER;
const LOGO = "https://bpxzznykbikbqbvraqxj.supabase.co/storage/v1/object/public/medias-publics/logo-courriel.png";

async function graphToken(): Promise<string> {
  const r = await fetch(`https://login.microsoftonline.com/${M365_TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: M365_CLIENT_ID,
      client_secret: M365_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!r.ok) throw new Error("token M365 " + r.status + " " + (await r.text()));
  return (await r.json()).access_token;
}

async function envoyer(access: string, to: string, subject: string, html: string): Promise<void> {
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(M365_SENDER)}/sendMail`,
    {
      method: "POST",
      headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: false,
      }),
    },
  );
  if (r.status !== 202) throw new Error("sendMail " + r.status + " " + (await r.text()));
}

// --- Identite de marque CFRQ : noir #141414 dominant, vert #5ABD2A accent -----
const P = "font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#141414;margin:0 0 15px;";
const FOOT = "font-family:Arial,Helvetica,sans-serif;font-size:12.5px;line-height:1.55;color:#5F655E;margin:16px 0 0;";
const SIGN =
  "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' style='border-top:1px solid #ececec;margin-top:10px;'><tr><td style='padding-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#5F655E;'>" +
    "<div style='font-weight:bold;color:#141414;'>Conseillers Forestiers de la Région de Québec inc.</div>" +
    "<div>367 777-0555&nbsp;·&nbsp;<a href='mailto:cfrq@cfrq.ca' style='color:#4BA31F;text-decoration:none;'>cfrq@cfrq.ca</a>&nbsp;·&nbsp;<a href='https://www.cfrq.ca' style='color:#4BA31F;text-decoration:none;'>www.cfrq.ca</a></div>" +
    "</td></tr></table>";

function coquille(eyebrow: string, titre: string, corps: string): string {
  return "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' style='background-color:#f4f5f2;margin:0;padding:28px 12px;'><tr><td align='center'>" +
    "<table role='presentation' width='580' cellpadding='0' cellspacing='0' border='0' style='width:580px;max-width:100%;background-color:#ffffff;border:1px solid #e6e8e3;border-radius:14px;overflow:hidden;'>" +
    "<tr><td style='background-color:#5ABD2A;height:4px;line-height:4px;font-size:0;'>&nbsp;</td></tr>" +
    "<tr><td style='padding:30px 38px 0;'>" +
      "<img src='" + LOGO + "' width='150' alt='CFRQ' style='display:block;border:0;width:150px;max-width:150px;height:auto;'/>" +
      "<div style='font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#5ABD2A;font-weight:bold;margin:24px 0 0;'>" + eyebrow + "</div>" +
      "<h1 style='font-family:Arial,Helvetica,sans-serif;font-size:23px;line-height:1.28;color:#141414;margin:7px 0 2px;'>" + titre + "</h1>" +
    "</td></tr>" +
    "<tr><td style='padding:12px 38px 4px;'>" + corps + "</td></tr>" +
    "<tr><td style='padding:4px 38px 30px;'>" + SIGN + "</td></tr>" +
    "</table></td></tr></table>";
}

type Lead = {
  courriel: string;
  superficie: number | null;
  taxes: number | null;
  potAnnuel: number | null;
  pot5: number | null;
  nom: string;
  municipalite: string;
  details: Record<string, unknown> | null;
};

function geste(nom: string, desc: string): string {
  return "<tr>" +
    "<td valign='top' style='padding:5px 12px 5px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#5ABD2A;font-weight:bold;line-height:1.5;'>→</td>" +
    "<td style='padding:5px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#141414;line-height:1.55;'><strong>" + nom + "</strong> : " + desc + "</td>" +
    "</tr>";
}

function htmlRelance(l: Lead): string {
  const para = (t: string) => "<p style='" + P + "'>" + t + "</p>";
  const foot = (t: string) => "<p style='" + FOOT + "'>" + t + "</p>";

  const gestes = "<table role='presentation' cellpadding='0' cellspacing='0' border='0' style='margin:2px 0 10px;'>" +
    geste("Une éclaircie", "on donne de l'espace aux plus beaux arbres, qui poussent mieux et prennent de la valeur") +
    geste("Une plantation diversifiée", "vous préparez la forêt de demain, adaptée au climat qui change") +
    geste("Une récupération", "on récolte les arbres en perdition avant de les perdre, la première intention des propriétaires du Québec") +
    "</table>";

  const callout = "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' style='margin:20px 0;'><tr>" +
    "<td style='background-color:#f3f7ef;border-left:4px solid #5ABD2A;padding:16px 20px;'>" +
    "<div style='font-family:Arial,Helvetica,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#5F655E;margin-bottom:6px;'>Votre remboursement de taxes estimé</div>" +
    "<div style='font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:bold;color:#141414;'>" + cad(l.potAnnuel) + " par année <span style='color:#5F655E;font-weight:normal;font-size:15px;'>· " + cad(l.pot5) + " sur 5 ans</span></div>" +
    "<div style='font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#5F655E;margin-top:8px;line-height:1.5;'>Un plafond, pas un dû : le montant réel dépend des travaux admissibles réalisés, et les subventions viennent s'ajouter. C'est justement ce qu'on établit avec vous.</div>" +
    "</td></tr></table>";

  // Bouton centre, vert profond #4BA31F, texte blanc, leger relief.
  const bouton = "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0'><tr><td align='center' style='padding:24px 0 4px;'>" +
    "<table role='presentation' cellpadding='0' cellspacing='0' border='0'><tr>" +
    "<td align='center' bgcolor='#4BA31F' style='border-radius:9px;border-bottom:3px solid #35760f;'>" +
    "<a href='mailto:cfrq@cfrq.ca?subject=Ma%20visite%20terrain%20-%20calculateur%20de%20taxes' style='display:inline-block;padding:15px 40px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;letter-spacing:0.3px;'>Planifier ma visite terrain</a>" +
    "</td></tr></table>" +
    "</td></tr></table>" +
    "<p style='font-family:Arial,Helvetica,sans-serif;font-size:13.5px;color:#5F655E;margin:12px 0 0;text-align:center;'>ou parlez directement à un ingénieur forestier : <strong style='color:#141414;'>367 777-0555</strong></p>";

  return coquille("Suite à votre estimation", "Votre boisé peut valoir plus, et se porter mieux",
    para(l.nom ? "Bonjour " + esc(l.nom) + "," : "Bonjour,") +
    para("Si vous avez un boisé, c'est sans doute qu'il compte pour vous : un coin de nature bien à vous, hérité ou choisi, que vous aimez parcourir et que vous voulez transmettre en santé.") +
    para("On entend souvent qu'aménager un boisé, c'est le raser. C'est le contraire. Aménager, c'est choisir quels arbres aider à grandir : dégager les plus beaux, retirer les malades, laisser entrer la lumière pour la relève. Votre forêt devient plus vigoureuse, plus diversifiée, plus résistante aux tempêtes et aux ravageurs. Et franchement, plus belle à parcourir.") +
    para("Concrètement, voici le genre de gestes qu'on pose, tous admissibles aux programmes :") +
    gestes +
    para("Et voici ce que peu de gens savent. Ces travaux ne sortent pas seulement de votre poche, car plusieurs aides existent et se combinent. Des budgets de subventions financent directement une partie des travaux. Et comme producteur forestier reconnu, vous récupérez en plus une large part de vos taxes foncières, jusqu'à 85 %, selon les travaux admissibles. Résultat : vous améliorez votre propre forêt, et une grande partie de la facture est couverte.") +
    callout +
    para("La reconnaissance de producteur, les demandes de subvention, l'admissibilité, la paperasse des programmes : c'est nous qui nous en occupons. Vous, vous profitez de votre boisé.") +
    para("La suite ne vous engage à rien : un de nos ingénieurs ou techniciens vient marcher votre boisé avec vous. On regarde vos arbres, on repère les possibilités, et on vous remet un portrait clair et chiffré de ce que votre forêt peut devenir, subventions et remboursement de taxes compris.") +
    bouton +
    foot("Un propriétaire sur deux consulte un ingénieur forestier avant de décider quoi que ce soit sur son boisé. Depuis 1996, plus de 3000 nous ont fait confiance pour le leur. Au plaisir de marcher le vôtre."));
}

function htmlNotif(l: Lead): string {
  const li = (k: string, v: string) => "<tr><td style='padding:3px 14px 3px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#5F655E;'>" + k + "</td><td style='padding:3px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#141414;font-weight:bold;'>" + v + "</td></tr>";
  let rows = li("Courriel", esc(l.courriel));
  if (l.nom) rows += li("Nom", esc(l.nom));
  if (l.municipalite) rows += li("Municipalité", esc(l.municipalite));
  rows += li("Superficie", (l.superficie ?? "-") + " ha") +
    li("Taxes foncières", cad(l.taxes)) +
    li("Potentiel max", cad(l.potAnnuel) + " / an, " + cad(l.pot5) + " / 5 ans");
  if (l.details) {
    for (const [k, v] of Object.entries(l.details)) {
      if (v !== null && v !== undefined && String(v).trim() !== "") rows += li(esc(k), esc(v));
    }
  }
  return coquille("Notification interne", "Nouveau lead au calculateur de taxes",
    "<p style='" + P + "'>Un nouveau lead vient d'être capturé depuis le calculateur du site.</p>" +
    "<table role='presentation' cellpadding='0' cellspacing='0' border='0' style='margin:6px 0 14px;'>" +
    rows +
    "</table>" +
    "<p style='" + FOOT + "'>Visible dans PlaniLogix (planilogix.leads_web).</p>");
}

async function envoyerCourriels(l: Lead): Promise<void> {
  if (!M365_TENANT || !M365_CLIENT_ID || !M365_CLIENT_SECRET) return;
  const access = await graphToken();
  await envoyer(access, l.courriel, "Votre estimation, et ce que votre boisé pourrait devenir", htmlRelance(l)).catch((e) => console.error("relance:", (e as Error).message));
  await envoyer(access, LEADS_NOTIFY, "Nouveau lead calculateur : " + l.courriel, htmlNotif(l)).catch((e) => console.error("notif:", (e as Error).message));
}

// --- Prospects des formulaires (visite-conseil, plants) ----------------------
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Codes essence du classeur « Demande Feuillus.xlsx » (colonnes C/E/G/I).
// ERR (erable rouge) n'est pas offert sur le site, mais la colonne existe dans
// le classeur : on l'ecrit a 0 pour garder l'alignement des colonnes.
type Quantites = { ERS: number; ERR: number; CHR: number; CHG: number };

const LIBELLE_ESSENCE: Record<keyof Quantites, string> = {
  ERS: "Érable à sucre",
  ERR: "Érable rouge",
  CHR: "Chêne rouge",
  CHG: "Chêne à gros fruits",
};

// Les plants se commandent par sac de 50 : toute quantite doit etre un entier
// positif, multiple de 50. Le `step=50` du formulaire ne protege que le
// navigateur, d'ou cette revalidation cote serveur.
const PAS_PLANTS = 50;
const MAX_PLANTS = 50000;

function lireQuantites(v: unknown): Quantites | { erreur: string } {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { erreur: "Quantités manquantes." };
  const src = v as Record<string, unknown>;
  const out = {} as Quantites;
  for (const code of Object.keys(LIBELLE_ESSENCE) as (keyof Quantites)[]) {
    const brut = src[code];
    if (brut === null || brut === undefined || brut === "") { out[code] = 0; continue; }
    const n = Number(brut);
    if (!Number.isInteger(n) || n < 0 || n > MAX_PLANTS) {
      return { erreur: `Quantité invalide pour ${LIBELLE_ESSENCE[code]} : un entier entre 0 et ${MAX_PLANTS}.` };
    }
    if (n % PAS_PLANTS !== 0) {
      return { erreur: `Les plants se commandent par sac de ${PAS_PLANTS} : ${LIBELLE_ESSENCE[code]} doit être un multiple de ${PAS_PLANTS}.` };
    }
    out[code] = n;
  }
  if (out.ERS + out.ERR + out.CHR + out.CHG === 0) return { erreur: "Indiquez au moins une quantité de plants." };
  return out;
}

// Compatibilite ascendante : avant l'ajout du report au classeur, la page
// plants envoyait les quantites dans `details`, sous les libelles d'essence et
// sans champ `quantites`. Les navigateurs qui ont encore l'ancien JS en cache
// continuent de poster cette forme-la : on la relit plutot que de leur repondre
// 400. A supprimer quand les caches auront tourne.
function quantitesDepuisDetails(d: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!d) return null;
  const out: Record<string, unknown> = {};
  let trouve = false;
  for (const code of Object.keys(LIBELLE_ESSENCE) as (keyof Quantites)[]) {
    const v = d[LIBELLE_ESSENCE[code]];
    if (v !== undefined && v !== null && String(v).trim() !== "") { out[code] = v; trouve = true; }
  }
  return trouve ? out : null;
}

// `nom` est le nom d'affichage complet (courriels, planilogix.leads_web).
// `prenom` / `nomFamille` ne sont remplis que par le formulaire plants, qui les
// saisit separement pour alimenter les colonnes A et B du classeur.
type Prospect = { courriel: string; nom: string; prenom: string; nomFamille: string; telephone: string; municipalite: string; message: string; details: Record<string, unknown> | null; quantites: Quantites | null };

function htmlConfirmation(source: string, nom: string): string {
  const para = (t: string) => "<p style='" + P + "'>" + t + "</p>";
  const bonjour = nom ? "Bonjour " + esc(nom) + "," : "Bonjour,";
  if (source === "plants") {
    return coquille("Demande reçue", "Votre demande de plants est enregistrée",
      para(bonjour) +
      para("Merci ! On a bien reçu votre demande de plants. On vous revient rapidement pour confirmer les disponibilités et les prochaines étapes.") +
      para("Rappel : des frais de transport de 24 $ le sac (50 plants) s'appliquent à la réception. Une question ? <strong style='color:#141414;'>367 777-0555</strong>."));
  }
  if (source === "calculateur-valeur-bois") {
    return coquille("Demande reçue", "On a bien reçu votre demande",
      para(bonjour) +
      para("Merci ! Vous avez demandé une caractérisation de votre forêt suite à votre estimation de la valeur du bois. Un de nos ingénieurs ou techniciens forestiers vous recontacte <strong>sous un jour ouvrable</strong> pour valider vos vrais chiffres sur le terrain, sans engagement.") +
      para("Pour une réponse immédiate, appelez-nous au <strong style='color:#141414;'>367 777-0555</strong>."));
  }
  return coquille("Demande reçue", "On a bien reçu votre demande",
    para(bonjour) +
    para("Merci pour votre demande de visite-conseil. Un de nos ingénieurs ou techniciens forestiers vous recontacte <strong>sous un jour ouvrable</strong> pour planifier votre visite, sans engagement.") +
    para("Pour une réponse immédiate, appelez-nous au <strong style='color:#141414;'>367 777-0555</strong>."));
}

function htmlNotifProspect(source: string, d: Prospect, excel = ""): string {
  const li = (k: string, v: string) =>
    "<tr><td style='padding:3px 14px 3px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#5F655E;vertical-align:top;'>" + k +
    "</td><td style='padding:3px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#141414;font-weight:bold;'>" + v + "</td></tr>";
  const titre = source === "plants" ? "Nouvelle demande de plants"
    : source === "calculateur-valeur-bois" ? "Nouveau lead au calculateur de valeur du bois"
    : "Nouvelle demande de visite-conseil";
  let rows = li("Courriel", esc(d.courriel));
  if (d.nom) rows += li("Nom", esc(d.nom));
  if (d.telephone) rows += li("Téléphone", esc(d.telephone));
  if (d.municipalite) rows += li("Municipalité", esc(d.municipalite));
  if (d.details) {
    for (const [k, v] of Object.entries(d.details)) {
      if (v !== null && v !== undefined && String(v).trim() !== "") rows += li(esc(k), esc(v));
    }
  }
  const table = "<table role='presentation' cellpadding='0' cellspacing='0' border='0' style='margin:6px 0 14px;'>" + rows + "</table>";
  const msg = d.message ? "<p style='" + P + "'><strong>Message :</strong><br>" + esc(d.message) + "</p>" : "";
  // Statut du report au classeur : un echec doit sauter aux yeux, la demande
  // devant alors etre recopiee a la main.
  const rate = excel.startsWith("ÉCHEC");
  const bandeau = excel
    ? "<p style='" + P + "background-color:" + (rate ? "#fdf1f1" : "#f3f7ef") +
      ";border-left:4px solid " + (rate ? "#c0392b" : "#5ABD2A") + ";padding:12px 16px;'>" + esc(excel) + "</p>"
    : "";
  return coquille("Notification interne", titre,
    "<p style='" + P + "'>Un nouveau prospect vient d'être capturé depuis le site (" + esc(source) + ").</p>" + table + msg + bandeau +
    "<p style='" + FOOT + "'>Visible dans PlaniLogix (planilogix.leads_web).</p>");
}

// --- Classeur SharePoint « Demande Feuillus.xlsx » ---------------------------
// Ecriture via l'API Excel de Graph, en app-only (memes secrets M365 que
// sendMail). Necessite en PLUS la permission d'application Sites.ReadWrite.All
// (ou Files.ReadWrite.All) avec consentement admin : Mail.Send seul ne suffit
// pas et Graph repondra 403.
//
// Le classeur n'est pas un tableau Excel : c'est une grille a la main, avec une
// ligne de totaux « Demande » (=SUM(C3:C4)) juste sous les donnees, puis un
// bloc d'allocation. On repere donc l'en-tete et la ligne de totaux a chaque
// appel plutot que de figer des numeros de ligne qui bougent d'une saison a
// l'autre.
const XL_DRIVE = Deno.env.get("XL_FEUILLUS_DRIVE_ID") ||
  "b!KHMmGA1W9UuVccr3MVTLJ4MSYqb6Q0BJuVs5LHPu5CCCBmPAGjYmT5wNFAOCheO0";
const XL_ITEM = Deno.env.get("XL_FEUILLUS_ITEM_ID") || "012SF5F2UMPDLVCQALGFBYBEBXBT537WVW";
const XL_SHEET = Deno.env.get("XL_FEUILLUS_SHEET") || "DemandeFeuillus";
// Prix du sac (50 plants) utilise par la formule de la colonne N. Doit rester
// aligne sur le montant annonce sur la page et dans le courriel de confirmation.
// Les lignes deja presentes dans le classeur gardent l'ancien *20 : elles sont
// a reprendre a la main.
const XL_PRIX_SAC = Number(Deno.env.get("XL_FEUILLUS_PRIX_SAC") || "24");
const XL_URL = `https://graph.microsoft.com/v1.0/drives/${XL_DRIVE}/items/${XL_ITEM}/workbook`;

async function xlFetch(access: string, session: string | null, chemin: string, init: RequestInit = {}) {
  const headers: Record<string, string> = { Authorization: "Bearer " + access, "Content-Type": "application/json" };
  if (session) headers["workbook-session-id"] = session;
  const r = await fetch(XL_URL + chemin, { ...init, headers });
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${chemin} -> ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : await r.json();
}

// Une valeur texte commencant par =, +, - ou @ serait interpretee comme une
// formule par Excel : on la neutralise.
const cellule = (s: string) => (/^[=+\-@]/.test(s) ? "'" + s : s);

type LigneFeuillus = {
  nom: string; prenom: string; quantites: Quantites;
  telephone: string; courriel: string; commentaire: string;
};

async function ajouterLigneFeuillus(access: string, l: LigneFeuillus): Promise<number> {
  const ws = `/worksheets('${XL_SHEET}')`;
  const sess = await xlFetch(access, null, "/createSession", {
    method: "POST",
    body: JSON.stringify({ persistChanges: true }),
  });
  const session: string = sess.id;
  try {
    const grille = await xlFetch(access, session, `${ws}/range(address='A1:A60')`);
    const colA: unknown[][] = grille?.values ?? [];
    const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
    const iEntete = colA.findIndex((r) => norm(r[0]) === "nom");
    if (iEntete < 0) throw new Error("en-tête « Nom » introuvable dans A1:A60");
    const iTotaux = colA.findIndex((r, i) => i > iEntete && norm(r[0]).startsWith("demande"));
    if (iTotaux < 0) throw new Error("ligne de totaux « Demande » introuvable");

    // On insere DANS la plage des SUM (donc avant la derniere ligne de donnees).
    // Inserer sur la ligne de totaux elle-meme laisserait SUM(C3:C4) inchange et
    // les totaux ignoreraient la nouvelle demande.
    const r = iTotaux; // 1-indexe : (iTotaux + 1) - 1
    if (r <= iEntete + 1) throw new Error("aucune ligne de données où insérer");

    await xlFetch(access, session, `${ws}/range(address='A${r}:O${r}')/insert`, {
      method: "POST",
      body: JSON.stringify({ shift: "Down" }),
    });

    const q = l.quantites;
    await xlFetch(access, session, `${ws}/range(address='A${r}:O${r}')`, {
      method: "PATCH",
      body: JSON.stringify({
        formulas: [[
          cellule(l.nom), cellule(l.prenom),
          q.ERS, `=C${r}/${PAS_PLANTS}`,
          q.ERR, `=E${r}/${PAS_PLANTS}`,
          q.CHR, `=G${r}/${PAS_PLANTS}`,
          q.CHG, `=I${r}/${PAS_PLANTS}`,
          cellule(l.telephone), cellule(l.courriel), cellule(l.commentaire),
          `=(D${r}+F${r}+H${r}+J${r})*${XL_PRIX_SAC}`,
          "",
        ]],
      }),
    });
    return r;
  } finally {
    await xlFetch(access, session, "/closeSession", { method: "POST", body: "{}" }).catch(() => {});
  }
}

async function envoyerProspect(source: string, d: Prospect): Promise<void> {
  if (!M365_TENANT || !M365_CLIENT_ID || !M365_CLIENT_SECRET) return;
  const access = await graphToken();

  // Report au classeur avant les courriels : le resultat est annonce dans la
  // notification interne, pour qu'un echec soit visible tout de suite et que la
  // demande soit reportee a la main. La demande est deja en base de toute facon.
  let excel = "";
  if (source === "plants" && d.quantites) {
    const commentaire = [
      d.municipalite ? "Municipalité : " + d.municipalite : "",
      d.message,
      "Reçu via le site web le " + new Date().toLocaleDateString("fr-CA", { timeZone: "America/Toronto" }),
    ].filter(Boolean).join(" · ");
    try {
      const ligne = await ajouterLigneFeuillus(access, {
        nom: d.nomFamille || d.nom, prenom: d.prenom, quantites: d.quantites,
        telephone: d.telephone, courriel: d.courriel, commentaire,
      });
      excel = `Ajoutée automatiquement au classeur Demande Feuillus.xlsx (ligne ${ligne}).`;
      console.log("excel ok ligne", ligne);
    } catch (e) {
      excel = "ÉCHEC de l'ajout au classeur Demande Feuillus.xlsx, à reporter à la main : " + (e as Error).message;
      console.error("excel:", (e as Error).message);
    }
  }

  const sujet = source === "plants" ? "Votre demande de plants a bien été reçue"
    : source === "calculateur-valeur-bois" ? "Votre demande de caractérisation a bien été reçue"
    : "Votre demande de visite-conseil a bien été reçue";
  await envoyer(access, d.courriel, sujet, htmlConfirmation(source, d.nom)).catch((e) => console.error("confirmation:", (e as Error).message));
  const sujetNotif = (source === "plants" ? "Nouveau lead plants : "
    : source === "calculateur-valeur-bois" ? "Nouveau lead valeur du bois : "
    : "Nouveau lead visite-conseil : ") + d.courriel;
  await envoyer(access, LEADS_NOTIFY, sujetNotif, htmlNotifProspect(source, d, excel)).catch((e) => console.error("notif:", (e as Error).message));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Methode non permise" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Corps JSON invalide" }, 400); }

  if (body.website || body.hp) return json({ ok: true });

  const courriel = String(body.courriel ?? "").trim().toLowerCase();
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(courriel) && courriel.length <= 254;
  if (!emailOk) return json({ ok: false, error: "Courriel invalide" }, 400);

  const source = body.source ? String(body.source).slice(0, 60) : "calculateur-taxes";
  const region = body.region ? String(body.region).slice(0, 120) : null;
  const referrer = req.headers.get("referer")?.slice(0, 500) ?? null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  let ipHash: string | null = null;
  if (ip) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + "|cfrq-leads-web"));
    ipHash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  }

  // Formulaires visite-conseil / plants -> table de suivi generique (capter_prospect_web).
  if (source !== "calculateur-taxes") {
    const nomFamille = String(body.nom ?? "").trim().slice(0, 200);
    const prenom = String(body.prenom ?? "").trim().slice(0, 200);
    const nom = (prenom ? prenom + " " + nomFamille : nomFamille).trim().slice(0, 200);
    const telephone = String(body.telephone ?? "").trim().slice(0, 60);
    const municipalite = String(body.municipalite ?? "").trim().slice(0, 160);
    const message = String(body.message ?? "").trim().slice(0, 4000);
    let details = (body.details && typeof body.details === "object" && !Array.isArray(body.details))
      ? (body.details as Record<string, unknown>) : null;

    // Formulaire plants : les quantites font foi cote serveur. On reconstruit
    // `details` a partir d'elles pour que le courriel de notification et le
    // jsonb stocke ne puissent pas diverger de ce qui part au classeur.
    let quantites: Quantites | null = null;
    if (source === "plants") {
      const lu = lireQuantites(body.quantites ?? quantitesDepuisDetails(details));
      if ("erreur" in lu) return json({ ok: false, error: lu.erreur }, 400);
      quantites = lu;
      const recompose: Record<string, unknown> = {};
      for (const code of Object.keys(LIBELLE_ESSENCE) as (keyof Quantites)[]) {
        if (quantites[code] > 0) recompose[LIBELLE_ESSENCE[code]] = String(quantites[code]);
      }
      const tel2 = details?.["Téléphone (autre)"];
      if (typeof tel2 === "string" && tel2.trim()) recompose["Téléphone (autre)"] = tel2.trim().slice(0, 60);
      details = recompose;
    }

    const sqlP = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1, idle_timeout: 5 });
    let idP: string | null = null;
    try {
      const rows = await sqlP`
        select public.capter_prospect_web(
          ${source}::text, ${courriel}::text, ${nom || null}::text, ${telephone || null}::text,
          ${municipalite || null}::text, ${message || null}::text,
          ${details ? JSON.stringify(details) : null}::jsonb,
          ${region}::text, ${referrer}::text, ${userAgent}::text, ${ipHash}::text
        ) as id`;
      idP = rows[0]?.id ?? null;
    } catch (e) {
      console.error("db error", e);
      await sqlP.end({ timeout: 5 }).catch(() => {});
      return json({ ok: false, error: "Enregistrement impossible" }, 500);
    }
    await sqlP.end({ timeout: 5 }).catch(() => {});
    // La RPC renvoie null quand le garde anti-spam se declenche (5 soumissions
    // par heure et par empreinte IP) : rien n'a ete enregistre. Le dire au
    // client, sinon la page affiche « bien envoyée » sur une demande perdue.
    if (!idP) return json({ ok: false, error: TROP_DE_DEMANDES }, 429);
    await envoyerProspect(source, { courriel, nom, prenom, nomFamille, telephone, municipalite, message, details, quantites })
      .catch((e) => console.error("email best-effort:", (e as Error).message));
    return json({ ok: true });
  }

  // Calculateur de taxes.
  const superficie = toNum(body.superficie_ha);
  const taxes = toNum(body.taxes_annuelles);
  const potAnnuel = toNum(body.potentiel_annuel);
  const pot5 = toNum(body.potentiel_5ans);
  if (superficie !== null && (superficie < 0 || superficie > 100000)) return json({ ok: false, error: "Superficie hors bornes" }, 400);
  if (taxes !== null && (taxes < 0 || taxes > 1000000)) return json({ ok: false, error: "Taxes hors bornes" }, 400);

  const nom = String(body.nom ?? "").trim().slice(0, 200);
  const municipalite = String(body.municipalite ?? "").trim().slice(0, 160);
  const details = (body.details && typeof body.details === "object" && !Array.isArray(body.details))
    ? (body.details as Record<string, unknown>) : null;

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1, idle_timeout: 5 });
  let id: string | null = null;
  try {
    const rows = await sql`
      select public.capter_lead_web(
        ${courriel}::text, ${superficie}::numeric, ${taxes}::numeric,
        ${potAnnuel}::numeric, ${pot5}::numeric, ${source}::text,
        ${region}::text, ${referrer}::text, ${userAgent}::text, ${ipHash}::text,
        ${nom || null}::text, ${municipalite || null}::text,
        ${details ? JSON.stringify(details) : null}::jsonb
      ) as id`;
    id = rows[0]?.id ?? null;
  } catch (e) {
    console.error("db error", e);
    await sql.end({ timeout: 5 }).catch(() => {});
    return json({ ok: false, error: "Enregistrement impossible" }, 500);
  }
  await sql.end({ timeout: 5 }).catch(() => {});

  // Meme garde anti-spam, meme correctif que pour la branche prospect.
  if (!id) return json({ ok: false, error: TROP_DE_DEMANDES }, 429);
  await envoyerCourriels({ courriel, superficie, taxes, potAnnuel, pot5, nom, municipalite, details }).catch((e) => console.error("email best-effort:", (e as Error).message));
  return json({ ok: true });
});
