// Supabase Edge Function: send-invite
//
// Emails a FinXAI share invitation via Brevo SMTP. Credentials are read from
// environment secrets — NEVER hard-code them here or in the app.
//
// Set secrets once:
//   supabase secrets set \
//     BREVO_SMTP_HOST=smtp-relay.brevo.com \
//     BREVO_SMTP_PORT=587 \
//     BREVO_SMTP_LOGIN=<login> \
//     BREVO_SMTP_PASSWORD=<password> \
//     INVITE_FROM_EMAIL=<a verified Brevo sender> \
//     INVITE_FROM_NAME="FinXAI" \
//     APP_LINK=https://github.com/feyton/finxai/releases/latest
// Deploy:
//   supabase functions deploy send-invite
//
// deno-lint-ignore-file
import {SMTPClient} from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {headers: CORS});
  }
  try {
    const {email, inviterName, inviteeName} = await req.json();
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return json({error: 'A valid email is required'}, 400);
    }

    const link = Deno.env.get('APP_LINK') ??
      'https://github.com/feyton/finxai/releases/latest';
    const inviter = (inviterName || 'A FinXAI user').toString().slice(0, 80);
    const invitee = (inviteeName || 'there').toString().slice(0, 80);

    const client = new SMTPClient({
      connection: {
        hostname: Deno.env.get('BREVO_SMTP_HOST') ?? 'smtp-relay.brevo.com',
        port: Number(Deno.env.get('BREVO_SMTP_PORT') ?? '587'),
        tls: false, // STARTTLS on 587
        auth: {
          username: Deno.env.get('BREVO_SMTP_LOGIN') ?? '',
          password: Deno.env.get('BREVO_SMTP_PASSWORD') ?? '',
        },
      },
    });

    await client.send({
      from: `${Deno.env.get('INVITE_FROM_NAME') ?? 'FinXAI'} <${Deno.env.get('INVITE_FROM_EMAIL')}>`,
      to: email,
      subject: `${inviter} invited you to FinXAI`,
      content: 'auto',
      html: `
        <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#16A34A">You're invited to FinXAI 💚</h2>
          <p>Hi ${escapeHtml(invitee)},</p>
          <p><b>${escapeHtml(inviter)}</b> wants to track a shared budget with you on
             <b>FinXAI</b> — an AI expense tracker that sorts your MoMo & bank SMS automatically.</p>
          <p><a href="${link}" style="display:inline-block;background:#22C55E;color:#052E16;
             text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">
             Install FinXAI</a></p>
          <p style="color:#6B747C;font-size:13px">Once installed, sign in and ${escapeHtml(inviter)} will add you to the shared account.</p>
        </div>`,
    });
    await client.close();

    return json({ok: true});
  } catch (e) {
    return json({error: String(e?.message ?? e)}, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {...CORS, 'Content-Type': 'application/json'},
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c] as string),
  );
}
