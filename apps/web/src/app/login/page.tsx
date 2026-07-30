'use client';

import {useState} from 'react';
import {createClient} from '@/lib/supabase/client';

/**
 * Sign-in.
 *
 * The page has one job beyond the button: say what FinXAI actually does. So the
 * left field shows a real MTN MoMo message exactly as it arrives — USSD markers,
 * run-together punctuation and all — resolving into the record FinXAI makes of
 * it. That transformation IS the product, it cannot be mistaken for another
 * company's login, and it uses real content rather than lorem stand-ins.
 *
 * Yellow for the raw message, green for the finished record: MoMo's own colour
 * against FinXAI's, machine text against data you can act on.
 *
 * The reveal runs once on load and then stops. No loop, no carousel — a login
 * page that keeps animating is a login page that gets in the way.
 */
export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ||
      window.location.origin;
    const {error: err} = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback`,
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
    <main className="login-shell">
      {/* ── Thesis ─────────────────────────────────────────── */}
      <section className="login-field">
        <div className="login-brand">
          <span className="login-logo" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          FinXAI
        </div>

        <h1 className="login-h1">
          Your bank already
          <br />
          told you everything.
        </h1>
        <p className="login-lede">
          Every payment you make arrives as a text message. FinXAI reads them and
          keeps the books, so you stop typing what your phone already knows.
        </p>

        {/* The signature: one real message, becoming one real record. */}
        <figure className="parse" aria-label="An SMS from MTN MoMo and the record FinXAI creates from it">
          <figcaption className="parse-eyebrow parse-eyebrow--raw">
            <span className="parse-dot" /> As it arrived
          </figcaption>
          {/* A plain MoMo purchase, in the format these actually arrive in.
              Deliberately NOT a Mokash savings message: detectTransfer() treats
              anything Mokash as movement between the user's own accounts, so
              FinXAI files it with no sign at all — showing it as a red expense
              would advertise behaviour the product does not have. */}
          <pre className="parse-sms">
            {`TxId:29492553396*S*Your payment of 30,000 RWF
to OLAM OIL LTD was completed at
2026-07-26 10:39:11. Balance: 41,280 RWF.
Fee 0 RWF.*EN#`}
          </pre>

          <div className="parse-arrow" aria-hidden>
            <svg width="14" height="20" viewBox="0 0 14 20" fill="none">
              <path
                d="M7 1v16M1.5 12L7 18l5.5-6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <figcaption className="parse-eyebrow parse-eyebrow--done">
            <span className="parse-dot" /> Filed automatically
          </figcaption>
          <div className="parse-record">
            <span className="parse-icon" aria-hidden>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 17h14M6.5 17V9.5L8 6h8l1.5 3.5V17M4 12h16"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="8" cy="17.5" r="1.6" fill="currentColor" />
                <circle cx="16" cy="17.5" r="1.6" fill="currentColor" />
              </svg>
            </span>
            <span className="parse-rec-main">
              <span className="parse-rec-name">Olam Oil Ltd</span>
              <span className="parse-rec-meta">Transport · Fuel · MTN MoMo</span>
            </span>
            <span className="parse-rec-amt">−30,000 RWF</span>
          </div>
        </figure>
      </section>

      {/* ── Action ─────────────────────────────────────────── */}
      <section className="login-gate">
        <div className="login-card">
          <h2 className="login-card-h">Sign in</h2>
          <p className="login-card-sub">
            The same accounts, budgets and records as the app on your phone.
          </p>

          <button className="btn-google" onClick={signInWithGoogle} disabled={loading}>
            <GoogleGlyph />
            {loading ? 'Taking you to Google…' : 'Continue with Google'}
          </button>

          {error && (
            <p className="login-err" role="alert">
              {error}
            </p>
          )}

          <p className="login-fine">
            Use the Google account you signed in with on your phone, or the address
            an account was shared to.
          </p>
        </div>

        <p className="login-foot">
          Built for Rwandan accounts — MTN MoMo, Bank of Kigali, BPR, Equity,
          Airtel Money.
        </p>
      </section>
    </main>
  );
}

function GoogleGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
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
