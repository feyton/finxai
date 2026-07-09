// Sends a share invitation email via the Supabase Edge Function `send-invite`,
// which holds the SMTP credentials server-side (never in the app). See
// supabase/functions/send-invite/ for the function + deploy steps.

import {SUPABASE_ANON_KEY, SUPABASE_URL} from './supabase';

export async function sendInviteEmail(
  email: string,
  inviterName: string,
  inviteeName: string,
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({email, inviterName, inviteeName}),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `send-invite failed (${res.status})`);
  }
}
