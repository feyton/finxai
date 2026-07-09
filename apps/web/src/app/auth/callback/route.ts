import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {baseUrlFrom} from '@/lib/site';

// OAuth redirect target. Exchanges the PKCE code for a session cookie.
//
// Redirects are built from NEXT_PUBLIC_SITE_URL (see baseUrlFrom) rather than
// `new URL(request.url)`, which behind a reverse proxy reports the internal
// bind address (127.0.0.1:3011) and would strand users on localhost.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/dashboard';
  const base = baseUrlFrom(request);

  if (!code) {
    return NextResponse.redirect(`${base}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const {error} = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('[auth/callback] code exchange failed:', error.message);
    return NextResponse.redirect(
      `${base}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${base}${next}`);
}
