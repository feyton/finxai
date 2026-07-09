'use client';

import {useState} from 'react';
import {createClient} from '@/lib/supabase/client';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const {error: err} = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {access_type: 'offline', prompt: 'consent'},
      },
    });
    if (err) {
      setError(err.message);
      setLoading(false);
    }
    // On success the browser is redirected to Google.
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-mark">F</div>
        <div className="login-title">FinXAI</div>
        <div className="login-sub">
          Sign in to manage the same data as your phone.
        </div>
        <button
          className="btn-google"
          onClick={signInWithGoogle}
          disabled={loading}>
          <GoogleGlyph />
          {loading ? 'Redirecting…' : 'Continue with Google'}
        </button>
        {error && <div className="login-err">{error}</div>}
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 12.9 2 4 10.9 4 22s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 16.3 2 9.7 6.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 42c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5C29.6 32.5 26.9 34 24 34c-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 37.6 16.2 42 24 42z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.5 5.5C41.4 36.3 44 30.6 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
