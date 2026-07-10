/**
 * POST /api/invite — sends a FinXAI share-invitation email via Mailjet.
 *
 * Replaces the Supabase edge function (send-invite): the Next.js app is the
 * backend now. Mailjet credentials live in the server's env, never in git:
 *   MAILJET_API_KEY, MAILJET_SECRET_KEY,
 *   INVITE_FROM_EMAIL (a Mailjet-verified sender), INVITE_FROM_NAME,
 *   APP_LINK (defaults to the GitHub releases page).
 *
 * Auth: a signed-in caller is required —
 *   - web: the Supabase session cookie
 *   - mobile: Authorization: Bearer <supabase access token>
 */
import {NextResponse} from 'next/server';
import {createClient as createBareClient} from '@supabase/supabase-js';
import {createClient} from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    c =>
      ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[
        c
      ] as string),
  );
}

async function authedUser(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    const bare = createBareClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {auth: {persistSession: false, autoRefreshToken: false}},
    );
    const {data} = await bare.auth.getUser(token);
    if (data.user) return data.user;
  }
  const supabase = await createClient();
  const {data} = await supabase.auth.getUser();
  return data.user;
}

export async function POST(request: Request) {
  const apiKey = process.env.MAILJET_API_KEY;
  const secretKey = process.env.MAILJET_SECRET_KEY;
  const fromEmail = process.env.INVITE_FROM_EMAIL;
  if (!apiKey || !secretKey || !fromEmail) {
    return NextResponse.json(
      {error: 'Mail is not configured on the server'},
      {status: 503},
    );
  }

  const user = await authedUser(request);
  if (!user) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email.includes('@') || email.length > 254) {
    return NextResponse.json({error: 'A valid email is required'}, {status: 400});
  }
  const inviter = String(body.inviterName || 'A FinXAI user').slice(0, 80);
  const invitee = String(body.inviteeName || 'there').slice(0, 80);
  const link =
    process.env.APP_LINK ?? 'https://github.com/feyton/finxai/releases/latest';

  const res = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:
        'Basic ' + Buffer.from(`${apiKey}:${secretKey}`).toString('base64'),
    },
    body: JSON.stringify({
      Messages: [
        {
          From: {
            Email: fromEmail,
            Name: process.env.INVITE_FROM_NAME ?? 'FinXAI',
          },
          To: [{Email: email, Name: invitee}],
          Subject: `${inviter} shared a FinXAI account with you`,
          HTMLPart: `
            <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto">
              <h2 style="color:#3B82F6">You're invited to FinXAI</h2>
              <p>Hi ${escapeHtml(invitee)},</p>
              <p><b>${escapeHtml(inviter)}</b> shared an account with you on
                 <b>FinXAI</b> — an AI expense tracker that sorts MoMo &amp; bank SMS automatically.</p>
              <p><a href="${link}" style="display:inline-block;background:#3B82F6;color:#fff;
                 text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">
                 Open FinXAI</a></p>
              <p style="color:#6B747C;font-size:13px">Sign in with this email address and the shared account appears automatically.</p>
            </div>`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[invite] Mailjet error:', res.status, detail.slice(0, 300));
    return NextResponse.json({error: 'Failed to send the email'}, {status: 502});
  }
  return NextResponse.json({ok: true});
}
