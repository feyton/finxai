# send-invite edge function

Emails a FinXAI share invitation via Brevo SMTP. **Secrets live in Supabase, not
in the app or this repo.**

## Deploy (one time)

```bash
supabase login
supabase link --project-ref gfsfjdcxxojmctnjfuvh

# Set the SMTP + sender secrets (values are NOT stored in git):
supabase secrets set \
  BREVO_SMTP_HOST=smtp-relay.brevo.com \
  BREVO_SMTP_PORT=587 \
  BREVO_SMTP_LOGIN=<your brevo smtp login> \
  BREVO_SMTP_PASSWORD=<your brevo smtp password> \
  INVITE_FROM_EMAIL=<a sender verified in Brevo> \
  INVITE_FROM_NAME=FinXAI \
  APP_LINK=https://github.com/feyton/finxai/releases/latest

supabase functions deploy send-invite
```

The app calls `POST {SUPABASE_URL}/functions/v1/send-invite` with the anon key
and `{email, inviterName, inviteeName}`. Until it's deployed, the app falls back
to the OS share sheet automatically, so invites still work.

## Notes
- `INVITE_FROM_EMAIL` must be a **verified sender** in Brevo or the send is rejected.
- If Supabase Edge (Deno) blocks outbound SMTP in your region, switch the function
  to Brevo's HTTPS transactional API (`https://api.brevo.com/v3/smtp/email` with an
  `api-key` header) — same inputs, just an HTTP POST instead of `denomailer`.
- **Rotate any SMTP password that was shared over chat/DM.** Update the secret with
  `supabase secrets set BREVO_SMTP_PASSWORD=<new>` and redeploy.
