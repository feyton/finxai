/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The web app lives in a monorepo alongside the React Native app; pin the
  // trace/root here so Next doesn't climb to the repo root (multiple lockfiles)
  // when inferring the workspace root.
  outputFileTracingRoot: import.meta.dirname,
  // The `eslint` option was removed in Next 16, and `next build` no longer runs
  // linting at all — so the previous `eslint: {ignoreDuringBuilds: true}` escape
  // hatch (added because build-time lint climbed to the repo-root React Native
  // config) is now both invalid and unnecessary. Type-checking still runs on
  // build and still gates it.

  // React Compiler — stable in Next 16. Memoizes components automatically, which
  // is worth having here specifically because of the transactions table: it is
  // the largest client component in the app and re-renders a long list on every
  // keystroke of an unrelated filter. TxRow on mobile needed a hand-written
  // React.memo comparator for exactly that reason; the compiler is the general
  // version of that fix.
  reactCompiler: true,

  // Baseline hardening — set here rather than in nginx so dev and prod match
  // and the config travels with the app. No CSP yet: Next's inline hydration
  // scripts need nonces, which is its own project; these four are free.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // 6 months; no preload until we're sure every subdomain serves TLS.
          {key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains'},
          {key: 'X-Content-Type-Options', value: 'nosniff'},
          // A finance dashboard has no business being framed by anyone.
          {key: 'X-Frame-Options', value: 'DENY'},
          {key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'},
        ],
      },
    ];
  },
};

export default nextConfig;
