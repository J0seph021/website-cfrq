// =============================================================================
// send-email — Hook « Send Email » de Supabase Auth (Edge Function)
// =============================================================================
// Envoie les courriels d'auth via Microsoft 365 (Graph sendMail) depuis
// cfrq@cfrq.ca — même mécanisme que stripe-webhook. Contourne le blocage SMTP
// de Microsoft depuis les IP cloud.
//
// Mise en page email-safe et soignée : document HTML complet avec color-scheme
// (limite l'inversion en mode sombre), bouton « bulletproof » ARRONDI via VML
// pour Outlook (qui ignore border-radius/padding sur un <a>).
//
// Secrets : M365_TENANT, M365_CLIENT_ID, M365_CLIENT_SECRET, M365_SENDER,
//   SEND_EMAIL_HOOK_SECRET. SUPABASE_URL est injecté automatiquement.
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
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
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

// --- Styles & gabarits --------------------------------------------------------
const P = "font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#45503c;margin:0 0 15px;";
const MUTED = "font-family:Arial,Helvetica,sans-serif;font-size:12.5px;line-height:1.55;color:#98a390;margin:14px 0 0;";

const para = (t: string) => "<p style='" + P + "'>" + t + "</p>";
const muted = (t: string) => "<p style='" + MUTED + "'>" + t + "</p>";

function btn(url: string, label: string): string {
  const w = Math.max(210, label.length * 9 + 60);
  return "<div style='text-align:center;margin:28px 0 8px;'>" +
    "<!--[if mso]><v:roundrect xmlns:v='urn:schemas-microsoft-com:vml' xmlns:w='urn:schemas-microsoft-com:office:word' href='" + url + "' style='height:48px;v-text-anchor:middle;width:" + w + "px;' arcsize='24%' strokecolor='#4faa22' fillcolor='#5abd2a'><w:anchorlock/><center style='color:#0f2b04;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;'>" + label + "</center></v:roundrect><![endif]-->" +
    "<!--[if !mso]><!-->" +
    "<a href='" + url + "' style='background-color:#5abd2a;border-radius:12px;color:#0f2b04;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:48px;padding:0 34px;text-decoration:none;'>" + label + "</a>" +
    "<!--<![endif]--></div>";
}

function lienSecours(url: string): string {
  return "<p style='" + MUTED + "'>Le bouton ne fonctionne pas ? <a href='" + url + "' style='color:#4a8a2c;font-weight:bold;text-decoration:none;'>Cliquez ici</a>.</p>";
}

const SIGN =
  "<div style='font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#98a390;'>" +
  "<div style='font-weight:bold;color:#2f5133;'>Conseillers Forestiers de la Région de Québec inc.</div>" +
  "<div>6021, boul. Wilfrid-Hamel, bureau 200, L'Ancienne-Lorette (QC) G2E 2H3</div>" +
  "<div>367 777-0555&nbsp;·&nbsp;<a href='mailto:cfrq@cfrq.ca' style='color:#4a8a2c;text-decoration:none;'>cfrq@cfrq.ca</a>&nbsp;·&nbsp;<a href='https://www.cfrq.ca' style='color:#4a8a2c;text-decoration:none;'>www.cfrq.ca</a></div></div>";

function page(titre: string, corps: string): string {
  return "<!DOCTYPE html><html lang='fr'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<meta name='color-scheme' content='light'><meta name='supported-color-schemes' content='light'>" +
    "<style>:root{color-scheme:light;supported-color-schemes:light;}body{margin:0;padding:0;}" +
    "[data-ogsc] .cardbg{background-color:#ffffff!important;}[data-ogsc] .ink{color:#143d1a!important;}[data-ogsc] .body{color:#45503c!important;}</style></head>" +
    "<body style='margin:0;padding:0;background-color:#e8ede2;'>" +
    "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' style='background-color:#e8ede2;'><tr><td align='center' style='padding:30px 12px;'>" +
    "<table role='presentation' width='480' cellpadding='0' cellspacing='0' border='0' class='cardbg' style='width:480px;max-width:100%;background-color:#ffffff;border-radius:16px;border:1px solid #dde4d5;'>" +
    "<tr><td style='background-color:#143d1a;height:5px;line-height:5px;font-size:0;border-radius:16px 16px 0 0;'>&nbsp;</td></tr>" +
    "<tr><td align='center' style='padding:30px 44px 0;'>" +
    "<img src='https://j0seph021.github.io/website-cfrq/logo-courriel.png' width='150' height='53' alt='CFRQ' style='display:block;margin:0 auto;border:0;outline:none;'>" +
    "<div style='font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8ba07d;margin-top:11px;'>Espace client</div></td></tr>" +
    "<tr><td align='center' style='padding:24px 44px 0;'><h1 class='ink' style='font-family:Arial,Helvetica,sans-serif;font-size:21px;font-weight:bold;color:#143d1a;margin:0;'>" + titre + "</h1></td></tr>" +
    "<tr><td class='body' style='padding:16px 44px 4px;'>" + corps + "</td></tr>" +
    "<tr><td style='padding:18px 44px 32px;'><div style='border-top:1px solid #edf0e8;padding-top:18px;'>" + SIGN + "</div></td></tr>" +
    "</table></td></tr></table></body></html>";
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
  const lien = verifyUrl(ed.token_hash, type, ed.redirect_to);

  switch (type) {
    case "signup":
      return {
        subject: "Confirmez votre espace client CFRQ",
        html: page("Bienvenue dans votre espace client",
          para("Bonjour,") +
          para("Confirmez votre adresse courriel pour activer votre espace client et accéder à vos documents, cartes et relevés forestiers.") +
          btn(lien, "Confirmer mon espace") + lienSecours(lien) +
          muted("Vous n'avez pas créé de compte chez CFRQ ? Ignorez simplement ce courriel.")),
      };
    case "recovery":
      return {
        subject: "Réinitialisation de votre mot de passe CFRQ",
        html: page("Réinitialisation de votre mot de passe",
          para("Bonjour,") +
          para("Vous avez demandé à réinitialiser le mot de passe de votre espace client. Cliquez ci-dessous pour en choisir un nouveau. Ce lien expire après 60 minutes.") +
          btn(lien, "Choisir un nouveau mot de passe") + lienSecours(lien) +
          muted("Vous n'avez pas fait cette demande ? Ignorez ce courriel, votre mot de passe reste inchangé.")),
      };
    case "invite":
      return {
        subject: "Vous êtes invité à votre espace client CFRQ",
        html: page("Votre espace client vous attend",
          para("Bonjour,") +
          para("CFRQ vous invite à accéder à votre espace client : suivez vos dossiers, téléchargez vos documents et consultez les cartes de votre propriété.") +
          btn(lien, "Accéder à mon espace") + lienSecours(lien) +
          muted("Vous ne connaissez pas CFRQ ? Ignorez simplement ce courriel.")),
      };
    case "email_change":
    case "email_change_new": {
      const l = verifyUrl(ed.token_hash_new || ed.token_hash, "email_change", ed.redirect_to);
      return {
        subject: "Confirmez votre nouvelle adresse courriel",
        html: page("Confirmez votre nouvelle adresse",
          para("Bonjour,") +
          para("Confirmez ce changement d'adresse courriel pour votre espace client CFRQ :") +
          btn(l, "Confirmer le changement") + lienSecours(l) +
          muted("Vous n'êtes pas à l'origine de cette demande ? Ignorez ce courriel, aucun changement ne sera appliqué.")),
      };
    }
    case "reauthentication":
      return {
        subject: "Votre code de vérification CFRQ",
        html: page("Code de vérification",
          para("Bonjour,") +
          para("Pour confirmer votre identité, entrez le code suivant :") +
          "<div style='font-family:Consolas,Menlo,monospace;font-size:30px;font-weight:bold;letter-spacing:8px;color:#143d1a;background-color:#f1f6ec;border:1px solid #d8e6cc;border-radius:12px;padding:16px 0;text-align:center;margin:20px 0 4px;'>" + ed.token + "</div>" +
          muted("Ce code expire dans quelques minutes. Ne le partagez avec personne.")),
      };
    case "magiclink":
    default:
      return {
        subject: "Votre lien de connexion à l'espace client CFRQ",
        html: page("Connexion à votre espace client",
          para("Bonjour,") +
          para("Cliquez sur le bouton ci-dessous pour accéder à votre espace client. Ce lien fonctionne une seule fois et expire après 60 minutes.") +
          btn(verifyUrl(ed.token_hash, "magiclink", ed.redirect_to), "Me connecter") +
          lienSecours(verifyUrl(ed.token_hash, "magiclink", ed.redirect_to)) +
          muted("Vous n'avez pas demandé cette connexion ? Ignorez simplement ce courriel.")),
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
