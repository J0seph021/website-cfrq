// =============================================================================
// send-email — Hook « Send Email » de Supabase Auth (Edge Function)
// =============================================================================
// GoTrue appelle cette fonction pour CHAQUE courriel d'authentification au lieu
// d'utiliser le SMTP intégré. On envoie via Microsoft 365 (Graph sendMail),
// depuis cfrq@cfrq.ca, aligné DMARC — même mécanisme que stripe-webhook.
//
// Mise en page « email-safe » : tableaux + bouton bulletproof (padding sur le
// <td>, pas sur le <a>, car Outlook/Word ignore le padding d'un <a>). Attributs
// HTML en guillemets simples.
//
// Secrets réutilisés : M365_TENANT, M365_CLIENT_ID, M365_CLIENT_SECRET,
//   M365_SENDER (def. cfrq@cfrq.ca). Nouveau : SEND_EMAIL_HOOK_SECRET.
// SUPABASE_URL est injecté automatiquement.
// =============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const M365_TENANT = Deno.env.get("M365_TENANT") || "";
const M365_CLIENT_ID = Deno.env.get("M365_CLIENT_ID") || "";
const M365_CLIENT_SECRET = Deno.env.get("M365_CLIENT_SECRET") || "";
const M365_SENDER = Deno.env.get("M365_SENDER") || "cfrq@cfrq.ca";
const HOOK_SECRET = Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "";

async function hookSignatureValide(headers: Headers, body: string): Promise<boolean> {
  if (!HOOK_SECRET) return false;
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;
  const base64Secret = HOOK_SECRET.replace(/^v1,whsec_/, "").replace(/^whsec_/, "");
  const keyBytes = Uint8Array.from(atob(base64Secret), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return sigHeader.split(" ").map((s) => s.split(",")[1]).includes(expected);
}

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

async function envoyer(to: string, subject: string, html: string): Promise<void> {
  const access = await graphToken();
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

function verifyUrl(tokenHash: string, type: string, redirectTo: string): string {
  const u = new URL(`${SUPABASE_URL}/auth/v1/verify`);
  u.searchParams.set("token", tokenHash);
  u.searchParams.set("type", type);
  if (redirectTo) u.searchParams.set("redirect_to", redirectTo);
  return u.toString();
}

// --- Gabarits email-safe ------------------------------------------------------
const P = "font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#33402c;margin:0 0 14px;";
const FOOT = "font-family:Arial,Helvetica,sans-serif;font-size:12.5px;line-height:1.5;color:#9aa890;margin:12px 0 0;";

const SIGN =
  "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' style='border-top:1px solid #eceff0;margin-top:6px;'><tr><td style='padding-top:16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8a978a;'><div style='font-weight:bold;color:#143d1a;'>Conseillers Forestiers de la Région de Québec inc.</div><div>6021, boul. Wilfrid-Hamel, bureau 200, L'Ancienne-Lorette (QC) G2E 2H3</div><div>367 777-0555&nbsp;·&nbsp;<a href='mailto:cfrq@cfrq.ca' style='color:#3a7d1e;text-decoration:none;'>cfrq@cfrq.ca</a>&nbsp;·&nbsp;<a href='https://www.cfrq.ca' style='color:#3a7d1e;text-decoration:none;'>www.cfrq.ca</a></div></td></tr></table>";

function coquille(titre: string, corps: string): string {
  return "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' style='background-color:#eef1ea;margin:0;padding:24px 12px;'><tr><td align='center'><table role='presentation' width='520' cellpadding='0' cellspacing='0' border='0' style='width:520px;max-width:100%;background-color:#ffffff;border:1px solid #e3e8dc;border-radius:14px;'>" +
    "<tr><td style='background-color:#143d1a;height:6px;line-height:6px;font-size:0;border-top-left-radius:14px;border-top-right-radius:14px;'>&nbsp;</td></tr>" +
    "<tr><td style='padding:26px 34px 0;'><div style='font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#143d1a;letter-spacing:2px;'>CFRQ</div><div style='font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8ba07d;margin-top:3px;'>Espace client</div>" +
    "<h1 style='font-family:Arial,Helvetica,sans-serif;font-size:20px;color:#143d1a;margin:20px 0 6px;'>" + titre + "</h1></td></tr>" +
    "<tr><td style='padding:6px 34px 4px;'>" + corps + "</td></tr>" +
    "<tr><td style='padding:2px 34px 28px;'>" + SIGN + "</td></tr></table></td></tr></table>";
}

function boutonLien(url: string, label: string): string {
  return "<table role='presentation' cellpadding='0' cellspacing='0' border='0' style='margin:22px 0 6px;'><tr><td align='center' bgcolor='#5abd2a' style='border-radius:10px;padding:14px 32px;'><a href='" + url +
    "' style='font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#123005;text-decoration:none;'>" + label + "</a></td></tr></table>" +
    "<p style='" + FOOT + "'>Si le bouton ne fonctionne pas, copiez ce lien :<br><a href='" + url + "' style='color:#3a7d1e;word-break:break-all;'>" + url + "</a></p>";
}

type EmailData = {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url?: string;
  token_new?: string;
  token_hash_new?: string;
};

function construire(ed: EmailData): { subject: string; html: string } {
  const type = ed.email_action_type;
  const para = (t: string) => "<p style='" + P + "'>" + t + "</p>";
  const foot = (t: string) => "<p style='" + FOOT + "'>" + t + "</p>";

  switch (type) {
    case "signup":
      return {
        subject: "Confirmez votre espace client CFRQ",
        html: coquille("Bienvenue dans votre espace client",
          para("Bonjour,") +
          para("Confirmez votre adresse courriel pour activer votre espace client et accéder à vos documents, cartes et relevés forestiers.") +
          boutonLien(verifyUrl(ed.token_hash, "signup", ed.redirect_to), "Confirmer mon espace") +
          foot("Vous n'avez pas créé de compte chez CFRQ ? Ignorez simplement ce courriel.")),
      };
    case "recovery":
      return {
        subject: "Réinitialisation de votre mot de passe CFRQ",
        html: coquille("Réinitialisation de votre mot de passe",
          para("Bonjour,") +
          para("Vous avez demandé à réinitialiser le mot de passe de votre espace client CFRQ. Cliquez ci-dessous pour en choisir un nouveau. Ce lien expire après 60 minutes.") +
          boutonLien(verifyUrl(ed.token_hash, "recovery", ed.redirect_to), "Choisir un nouveau mot de passe") +
          foot("Vous n'avez pas fait cette demande ? Ignorez ce courriel, votre mot de passe reste inchangé.")),
      };
    case "invite":
      return {
        subject: "Vous êtes invité à votre espace client CFRQ",
        html: coquille("Votre espace client CFRQ vous attend",
          para("Bonjour,") +
          para("CFRQ vous invite à accéder à votre espace client : suivez vos dossiers, téléchargez vos documents et consultez les cartes de votre propriété.") +
          boutonLien(verifyUrl(ed.token_hash, "invite", ed.redirect_to), "Accéder à mon espace") +
          foot("Vous ne connaissez pas CFRQ ? Ignorez simplement ce courriel.")),
      };
    case "email_change":
    case "email_change_new":
      return {
        subject: "Confirmez votre nouvelle adresse courriel",
        html: coquille("Confirmez votre nouvelle adresse courriel",
          para("Bonjour,") +
          para("Confirmez ce changement d'adresse pour votre espace client CFRQ :") +
          boutonLien(verifyUrl(ed.token_hash_new || ed.token_hash, "email_change", ed.redirect_to), "Confirmer le changement") +
          foot("Vous n'êtes pas à l'origine de cette demande ? Ignorez ce courriel, aucun changement ne sera appliqué.")),
      };
    case "reauthentication":
      return {
        subject: "Votre code de vérification CFRQ",
        html: coquille("Code de vérification",
          para("Bonjour,") +
          para("Pour confirmer votre identité, entrez le code suivant :") +
          "<div style='font-family:Consolas,Menlo,monospace;font-size:30px;font-weight:bold;letter-spacing:8px;color:#143d1a;background-color:#f1f6ec;border:1px solid #d8e6cc;border-radius:10px;padding:16px 0;text-align:center;margin:18px 0;'>" + ed.token + "</div>" +
          foot("Ce code expire dans quelques minutes. Ne le partagez avec personne.")),
      };
    case "magiclink":
    default:
      return {
        subject: "Votre lien de connexion à l'espace client CFRQ",
        html: coquille("Connexion à votre espace client",
          para("Bonjour,") +
          para("Cliquez sur le bouton ci-dessous pour accéder à votre espace client. Ce lien fonctionne une seule fois et expire après 60 minutes.") +
          boutonLien(verifyUrl(ed.token_hash, "magiclink", ed.redirect_to), "Me connecter") +
          foot("Vous n'avez pas demandé cette connexion ? Ignorez simplement ce courriel.")),
      };
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const body = await req.text();
  if (!(await hookSignatureValide(req.headers, body))) {
    return json({ error: { http_code: 401, message: "signature invalide" } }, 401);
  }
  if (!M365_TENANT || !M365_CLIENT_ID || !M365_CLIENT_SECRET) {
    return json({ error: { http_code: 500, message: "secrets M365 manquants" } }, 500);
  }
  try {
    const payload = JSON.parse(body) as { user: { email: string }; email_data: EmailData };
    const { subject, html } = construire(payload.email_data);
    await envoyer(payload.user.email, subject, html);
    return json({});
  } catch (e) {
    console.error("send-email:", (e as Error).message);
    return json({ error: { http_code: 500, message: (e as Error).message } }, 500);
  }
});
