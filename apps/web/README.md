# FinXAI Web

Next.js (App Router) dashboard for FinXAI, sharing the same Supabase Postgres
(and RLS) as the mobile app. Online-first — no PowerSync on web; reads/writes go
straight to Supabase honoring `owner_id = auth.uid()`.

Hosted at **https://app.feyton.co.rw** (Contabo VPS, Nginx + PM2).

## Local dev

```bash
cd apps/web
cp .env.example .env.local     # fill in the anon key (public, same as mobile)
npm install
npm run dev                    # http://localhost:3000
```

## Environment

Only public values are needed for the read-only dashboard. `NEXT_PUBLIC_*` vars
are **inlined at build time**, so the env file must exist *before* `npm run build`.

| Var | Scope | Notes |
|-----|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | public | same as mobile |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | same as mobile; RLS protects data |
| `NEXT_PUBLIC_SITE_URL` | public | canonical origin; authoritative base for auth redirects. `http://localhost:3000` in dev, `https://app.feyton.co.rw` in prod. Without it, redirects behind the proxy can strand users on `localhost:3011`. |

Server-only vars (later phases — AI proxy, invite emailer) go in
`.env.production.local` and must **never** be prefixed `NEXT_PUBLIC_`.

## Auth

Google OAuth via Supabase (`signInWithOAuth`). For it to work, the Supabase
project must allow the web redirect:

1. **Supabase → Authentication → URL Configuration**
   - Site URL: `https://app.feyton.co.rw`
   - Redirect URLs: add `https://app.feyton.co.rw/**` (and
     `http://localhost:3000/**` for dev).
2. **Google Cloud → OAuth client → Authorized redirect URIs** must include
   `https://gfsfjdcxxojmctnjfuvh.supabase.co/auth/v1/callback` (already present
   if Google sign-in works on mobile).

## Deploy (Contabo)

First time:

```bash
git clone https://github.com/feyton/finxai.git /var/www/finxai
cd /var/www/finxai/apps/web
printf 'NEXT_PUBLIC_SUPABASE_URL=...\nNEXT_PUBLIC_SUPABASE_ANON_KEY=...\n' > .env.production.local
npm ci
npm run build
pm2 start ecosystem.config.js && pm2 save
```

Updates (also what the GitHub Action runs):

```bash
cd /var/www/finxai && git pull --ff-only
cd apps/web && npm ci && npm run build && pm2 reload finxai-web
```

Nginx reverse-proxies `app.feyton.co.rw` → `127.0.0.1:3011` (TLS via Certbot).
See [`deploy/nginx.conf`](deploy/nginx.conf) for the reference vhost — note the
**required** large `proxy_buffer_size` (Supabase auth cookies overflow Nginx's
default header buffer and 502 the callback otherwise).
