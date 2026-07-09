// Edge Function publique : capture d'un lead du calculateur de taxes CFRQ.
// verify_jwt = false (endpoint public) : validation + honeypot + rate-limit.
// Ecriture par connexion Postgres DIRECTE (SUPABASE_DB_URL) via la RPC
// public.capter_lead_web (PlaniLogix n'expose pas de schema REST).
// Relance + notif via Microsoft Graph sendMail depuis cfrq@cfrq.ca (memes
// secrets M365 que la fonction send-email). Relance ecrite pour le persona
// Gardien du patrimoine (enquete FPFQ).
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

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

type Lead = { courriel: string; superficie: number | null; taxes: number | null; potAnnuel: number | null; pot5: number | null };

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
    para("Bonjour,") +
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
  return coquille("Notification interne", "Nouveau lead au calculateur de taxes",
    "<p style='" + P + "'>Un nouveau lead vient d'être capturé depuis le calculateur du site.</p>" +
    "<table role='presentation' cellpadding='0' cellspacing='0' border='0' style='margin:6px 0 14px;'>" +
    li("Courriel", l.courriel) +
    li("Superficie", (l.superficie ?? "-") + " ha") +
    li("Taxes foncières", cad(l.taxes)) +
    li("Potentiel max", cad(l.potAnnuel) + " / an, " + cad(l.pot5) + " / 5 ans") +
    "</table>" +
    "<p style='" + FOOT + "'>Visible dans PlaniLogix (planilogix.leads_web).</p>");
}

async function envoyerCourriels(l: Lead): Promise<void> {
  if (!M365_TENANT || !M365_CLIENT_ID || !M365_CLIENT_SECRET) return;
  const access = await graphToken();
  await envoyer(access, l.courriel, "Votre estimation, et ce que votre boisé pourrait devenir", htmlRelance(l)).catch((e) => console.error("relance:", (e as Error).message));
  await envoyer(access, LEADS_NOTIFY, "Nouveau lead calculateur : " + l.courriel, htmlNotif(l)).catch((e) => console.error("notif:", (e as Error).message));
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

  const superficie = toNum(body.superficie_ha);
  const taxes = toNum(body.taxes_annuelles);
  const potAnnuel = toNum(body.potentiel_annuel);
  const pot5 = toNum(body.potentiel_5ans);
  if (superficie !== null && (superficie < 0 || superficie > 100000)) return json({ ok: false, error: "Superficie hors bornes" }, 400);
  if (taxes !== null && (taxes < 0 || taxes > 1000000)) return json({ ok: false, error: "Taxes hors bornes" }, 400);

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

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1, idle_timeout: 5 });
  let id: string | null = null;
  try {
    const rows = await sql`
      select public.capter_lead_web(
        ${courriel}::text, ${superficie}::numeric, ${taxes}::numeric,
        ${potAnnuel}::numeric, ${pot5}::numeric, ${source}::text,
        ${region}::text, ${referrer}::text, ${userAgent}::text, ${ipHash}::text
      ) as id`;
    id = rows[0]?.id ?? null;
  } catch (e) {
    console.error("db error", e);
    await sql.end({ timeout: 5 }).catch(() => {});
    return json({ ok: false, error: "Enregistrement impossible" }, 500);
  }
  await sql.end({ timeout: 5 }).catch(() => {});

  if (id) {
    await envoyerCourriels({ courriel, superficie, taxes, potAnnuel, pot5 }).catch((e) => console.error("email best-effort:", (e as Error).message));
  }
  return json({ ok: true });
});
