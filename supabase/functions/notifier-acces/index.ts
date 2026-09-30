// =============================================================================
// notifier-acces — Courriels des demandes d'accès à l'espace client (Edge)
// =============================================================================
// Appelée par le navigateur d'un utilisateur CONNECTÉ (verify_jwt = true) :
//
//   { type: "nouvelle_demande", origine }       client dont le compte n'est pas relié,
//       après portail_demander_acces : avise cfrq@cfrq.ca (au plus 1 fois par heure
//       et par demande, contre les renvois en boucle).
//   { type: "acces_pret", demande_id, origine } employé, après portail_relier_demande :
//       écrit au client que son espace est prêt. Refusé si l'appelant n'est pas
//       employé (portail_moi lu AVEC SON JETON, jamais avec la clé de service).
//
// Les champs saisis par le client sont échappés avant d'entrer dans le HTML.
// Envoi par Microsoft Graph depuis cfrq@cfrq.ca, comme send-email.
//
// Secrets : M365_TENANT, M365_CLIENT_ID, M365_CLIENT_SECRET, M365_SENDER.
// SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY sont injectés.
// =============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const M365_TENANT = Deno.env.get("M365_TENANT") || "";
const M365_CLIENT_ID = Deno.env.get("M365_CLIENT_ID") || "";
const M365_CLIENT_SECRET = Deno.env.get("M365_CLIENT_SECRET") || "";
const M365_SENDER = Deno.env.get("M365_SENDER") || "cfrq@cfrq.ca";

// Seules adresses vers lesquelles un courriel peut renvoyer.
const ORIGINES = ["https://cfrq.ca", "https://preview.cfrq.ca", "http://localhost:4321"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function envoyer(to: string, subject: string, html: string): Promise<void> {
  const t = await fetch(`https://login.microsoftonline.com/${M365_TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: M365_CLIENT_ID, client_secret: M365_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
    }),
  });
  if (!t.ok) throw new Error("token M365 " + t.status);
  const access = (await t.json()).access_token;
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(M365_SENDER)}/sendMail`, {
    method: "POST",
    headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address: to } }] },
      saveToSentItems: true,
    }),
  });
  if (r.status !== 202) throw new Error("sendMail " + r.status + " " + (await r.text()));
}

const P = "font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#45503c;margin:0 0 14px;";

function page(titre: string, corps: string): string {
  return "<!DOCTYPE html><html lang='fr'><head><meta charset='utf-8'><meta name='color-scheme' content='light'></head>" +
    "<body style='margin:0;padding:0;background-color:#e8ede2;'>" +
    "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background-color:#e8ede2;'><tr><td align='center' style='padding:30px 12px;'>" +
    "<table role='presentation' width='480' cellpadding='0' cellspacing='0' style='width:480px;max-width:100%;background-color:#ffffff;border-radius:16px;border:1px solid #dde4d5;'>" +
    "<tr><td style='background-color:#143d1a;height:5px;line-height:5px;font-size:0;border-radius:16px 16px 0 0;'>&nbsp;</td></tr>" +
    "<tr><td align='center' style='padding:28px 40px 0;'><img src='https://cfrq.ca/logo-courriel.png' width='150' height='53' alt='CFRQ' style='display:block;border:0;'></td></tr>" +
    "<tr><td align='center' style='padding:22px 40px 0;'><h1 style='font-family:Arial,Helvetica,sans-serif;font-size:20px;color:#143d1a;margin:0;'>" + titre + "</h1></td></tr>" +
    "<tr><td style='padding:16px 40px 30px;'>" + corps + "</td></tr></table></td></tr></table></body></html>";
}

function bouton(url: string, label: string): string {
  return "<div style='text-align:center;margin:24px 0 6px;'><a href='" + url + "' style='background-color:#5abd2a;border-radius:12px;color:#0f2b04;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:48px;padding:0 30px;text-decoration:none;'>" + label + "</a></div>";
}

function ligne(cle: string, val: unknown): string {
  return val ? "<tr><td style='padding:4px 12px 4px 0;color:#7a8572;font-size:14px;'>" + cle + "</td><td style='padding:4px 0;color:#1b2417;font-size:14px;font-weight:bold;'>" + esc(val) + "</td></tr>" : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "connexion requise" }, 401);
  if (!M365_TENANT || !M365_CLIENT_ID || !M365_CLIENT_SECRET) return json({ error: "courriel non configuré" }, 500);

  let corps: { type?: string; demande_id?: number; origine?: string };
  try { corps = await req.json(); } catch { return json({ error: "requête invalide" }, 400); }
  const origine = ORIGINES.includes(String(corps.origine)) ? String(corps.origine) : "https://cfrq.ca";
  const lienPortail = `${origine}/espace-client/`;

  // Client « au nom de l'appelant » : les RPC voient son identité et ses droits.
  const moi = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  try {
    if (corps.type === "nouvelle_demande") {
      const { data: d, error } = await moi.rpc("portail_ma_demande");
      if (error || !d || d.statut !== "en_attente") return json({ error: "aucune demande en attente" }, 400);
      const { data: ligneDemande } = await admin.from("demandes_acces").select("notifie_le, courriel").eq("id", d.id).single();
      const deja = ligneDemande?.notifie_le && Date.now() - new Date(ligneDemande.notifie_le).getTime() < 3600_000;
      if (deja) return json({ ok: true, deja_avise: true });
      await envoyer(M365_SENDER, `Demande d'accès à l'espace client : ${d.nom} (${d.municipalite})`, page(
        "Nouvelle demande d'accès",
        "<p style='" + P + "'>Un client a créé son compte et demande qu'on le relie à son dossier forestier.</p>" +
        "<table role='presentation' cellpadding='0' cellspacing='0' style='margin:4px 0 8px;'>" +
        ligne("Nom", d.nom) + ligne("Municipalité", d.municipalite) + ligne("Téléphone", d.telephone) +
        ligne("Nº de producteur", d.no_producteur) + ligne("Lot(s)", d.lots) + ligne("Courriel", ligneDemande?.courriel) + "</table>" +
        "<p style='" + P + "'>Ouvrez l'espace client avec votre compte employé : la demande s'affiche en haut, avec les dossiers qui lui correspondent. Un clic sur « Relier » suffit. Au besoin, appelez le client pour confirmer.</p>" +
        bouton(lienPortail + "tableau-de-bord/", "Traiter la demande"),
      ));
      await admin.from("demandes_acces").update({ notifie_le: new Date().toISOString() }).eq("id", d.id);
      return json({ ok: true });
    }

    if (corps.type === "acces_pret") {
      const { data: m } = await moi.rpc("portail_moi");
      if (!m?.employe) return json({ error: "réservé aux employés" }, 403);
      const { data: d } = await admin.from("demandes_acces").select("courriel, nom, statut").eq("id", Number(corps.demande_id)).single();
      if (!d || d.statut !== "reliee") return json({ error: "demande non reliée" }, 400);
      await envoyer(d.courriel, "Votre espace client CFRQ est prêt", page(
        "Votre espace client est prêt",
        "<p style='" + P + "'>Bonjour,</p>" +
        "<p style='" + P + "'>Nous avons relié votre compte (" + esc(d.courriel) + ") à votre dossier forestier. Vos documents, la carte de votre forêt et vos travaux réalisés vous attendent.</p>" +
        // /espace-client/ : la présentation mène à « Me connecter » (ou « Ouvrir mon
        // espace » si la session est déjà ouverte). Adresse stable, quelle que soit
        // la version publiée du site.
        bouton(lienPortail, "Ouvrir mon espace") +
        "<p style='font-family:Arial,Helvetica,sans-serif;font-size:12.5px;line-height:1.55;color:#98a390;margin:14px 0 0;'>Une question ? Répondez à ce courriel ou appelez-nous au 367 777-0555.</p>",
      ));
      return json({ ok: true });
    }
    return json({ error: "type inconnu" }, 400);
  } catch (e) {
    console.error("notifier-acces:", (e as Error).message);
    return json({ error: "envoi impossible" }, 500);
  }
});
