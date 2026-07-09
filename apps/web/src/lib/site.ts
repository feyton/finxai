// Canonical public origin of the web app, e.g. https://app.feyton.co.rw.
// Set via NEXT_PUBLIC_SITE_URL (inlined at build time). This is the
// authoritative base for auth redirects — more reliable than sniffing
// proxy headers, which differ between middleware and route handlers.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? ''
).replace(/\/+$/, '');

/**
 * Absolute base URL for building redirects. Prefers the configured
 * NEXT_PUBLIC_SITE_URL; falls back to forwarded/Host headers (needed because
 * `new URL(request.url)` in a route handler reports the internal bind
 * address, e.g. 127.0.0.1:3011, behind a reverse proxy).
 */
export function baseUrlFrom(request: Request): string {
  if (SITE_URL) {
    return SITE_URL;
  }
  const host =
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    new URL(request.url).host;
  const proto =
    request.headers.get('x-forwarded-proto') ??
    (process.env.NODE_ENV === 'development' ? 'http' : 'https');
  return `${proto}://${host}`;
}
