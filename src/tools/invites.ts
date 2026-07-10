// Sends a share invitation email via the web app's API (/api/invite on
// app.feyton.co.rw), which holds the Mailjet credentials server-side.
// The caller is authenticated with the user's Supabase access token.

import {supabase} from './supabase';

const INVITE_ENDPOINT = 'https://app.feyton.co.rw/api/invite';

export async function sendInviteEmail(
  email: string,
  inviterName: string,
  inviteeName: string,
): Promise<void> {
  const {
    data: {session},
  } = await supabase.auth.getSession();
  const res = await fetch(INVITE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({email, inviterName, inviteeName}),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `invite failed (${res.status})`);
  }
}
