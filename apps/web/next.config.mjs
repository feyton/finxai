/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The web app lives in a monorepo alongside the React Native app; pin the
  // trace/root here so Next doesn't climb to the repo root (multiple lockfiles)
  // when inferring the workspace root.
  outputFileTracingRoot: import.meta.dirname,
  // ESLint climbs to the repo-root .eslintrc.js (React Native's config, which
  // needs eslint-plugin-ft-flow) during `next build`. That plugin isn't — and
  // shouldn't be — installed here, so skip lint at build time. Type-checking
  // still runs and gates the build.
  eslint: {ignoreDuringBuilds: true},
};

export default nextConfig;
