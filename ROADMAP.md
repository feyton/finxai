# FinXAI — Roadmap & architecture plan

Living plan for the bigger pieces: a synced **web app**, **location tagging**,
**account transfers**, and **payment-channel intelligence** (learn the seller +
channel + fee so we can re-initiate a payment later). Written so the Android app
and everything new stay in sync around one backend.

---

## 0. The backbone we already have

- **Supabase (Postgres)** is the single source of truth.
- **PowerSync** streams that Postgres data to the Android app's local SQLite and
  uploads local writes back (see `SupabaseConnector.ts`).
- Everything is scoped by `owner_id`.

Status / discipline:

1. **Row-Level Security (RLS) — already enabled** across all tables
   (`owner_id = auth.uid()`), so both mobile and web are safe even if a query
   forgets its filter. Keep every new table's policies in lockstep.
2. **Migrations are the safety net.** `supabase_migration_v2.sql` (and future
   migration files) are the single record of the schema. As we build, each new
   column/table is added there **first**, RLS + PowerSync sync rules updated in
   the same change, then the clients — so nothing is lost and scopes stay
   correct (the procedure in §5).

---

## 1. Web version (synced with Android)

**Goal:** richer data management + accessibility on a big screen, same data.

**Stack:** **Next.js (App Router)**, self-hosted on the **Contabo VPS at
`app.feyton.co.rw`**. Next.js gives us a real server tier (API routes / server
actions / server components + cron) — so secrets and server-side jobs can live on
our own box instead of only Supabase Edge Functions.

**Monorepo** with npm workspaces:

```
finxai/
  packages/core/     # shared, framework-agnostic logic (no RN, no DOM)
  apps/mobile/       # the current React Native app
  apps/web/          # new — Next.js (App Router)
```

- **`packages/core`** — extract the pure logic both clients share so they never
  drift: `theme` tokens, `resolveCat` + category data (`data.json`), `fmtAmount`,
  the **AI action catalog** (`aiActions.ts` — schemas are UI-agnostic), the
  Anthropic client, and TypeScript types for every table.
- **Web data layer:**
  - **Reads/writes:** `@supabase/supabase-js` against the same Postgres, honoring
    the existing RLS. Use the **server client** in server components/route
    handlers (service role stays server-only) and the **browser client** for
    realtime subscriptions and user-scoped queries (anon key + RLS).
  - The web is online-first, so no PowerSync on web — Supabase Realtime covers
    live updates. (PowerSync-web via wa-sqlite is only for future offline web.)
- **Server tier (Next.js on Contabo) can host:**
  - the **invite emailer** (move `send-invite` from a Supabase Edge Function to a
    Next.js route handler that holds the Brevo creds as VPS env vars — one fewer
    moving part);
  - an **AI proxy** so the Anthropic key lives server-side instead of on devices;
  - **cron** (systemd timer / node-cron) for scheduled-payment reminders,
    debt-installment nudges, and digest emails;
  - **reverse-geocoding** for location tags (§2).
- **Auth** — same Google sign-in through Supabase; sessions work across both
  clients (Supabase SSR helpers for cookies on Next.js).
- **Deploy on Contabo:** Node build behind **Nginx** at `app.feyton.co.rw` with
  a Let's Encrypt cert; run via **PM2** or a **systemd** service (or Docker).
  CI/CD later; manual `git pull && npm run build && pm2 reload` to start.
- **What the web unlocks:** bulk edit/categorize, CSV/PDF export, big-screen
  charts and filters, budget management, merchant/channel rule management, and an
  admin view of the AI's learned rules.

**Migration path (low-risk, incremental):**
1. Monorepo: move the current app under `apps/mobile` (path-only change).
2. Extract `packages/core` a slice at a time (types → `theme` → `resolveCat` +
   `data.json`), repoint mobile imports.
3. Scaffold `apps/web` (Next.js + Supabase SSR), ship a read-only dashboard, then
   editing. RLS already protects writes.
4. Stand up `app.feyton.co.rw` on Contabo (Nginx + TLS + PM2); move `send-invite`
   into a Next.js route handler once it's live.

**Status (2026-07-09) — Phase 3+4 read-only slice shipped:**
- `apps/web` scaffolded (Next.js 15 App Router + Supabase SSR, Google OAuth,
  cookie sessions). Read-only dashboard: overview, transactions, accounts,
  budgets — app dark theme. Mobile app untouched (no `apps/mobile` move yet).
- **Live at https://app.feyton.co.rw** — Contabo, PM2 (`finxai-web`, port 3011),
  Nginx reverse-proxy, Let's Encrypt TLS (auto-renew).
- **CI/CD:** push to `main` touching `apps/web/**` → GitHub Actions
  (`.github/workflows/deploy-web.yml`) → SSH to VPS via a deploy key **locked to
  a forced command** (`/usr/local/bin/finxai-deploy.sh`, cannot open a shell) →
  `git pull && npm ci && next build && pm2 reload`.
- Shared logic (`theme`, `resolveCat`, `fmtAmount`, table types) is **duplicated**
  into `apps/web/src/lib` for now; promote to `packages/core` (step 2) later.
- **Manual Supabase dashboard step still required** for OAuth (see below).

**⚠ Required Supabase dashboard config (one-time, no API access from code):**
- Auth → URL Configuration → **Site URL** = `https://app.feyton.co.rw`
- Auth → URL Configuration → **Redirect URLs** → add `https://app.feyton.co.rw/**`
  (keep `http://localhost:3000/**` for dev). Without this, Google OAuth falls
  back to the Site URL and dumps users on localhost after sign-in.

**Next on web:** editing (bulk categorize, budget mgmt), CSV/PDF export,
server-side AI proxy + invite emailer route (holds Anthropic/Brevo creds as VPS
env vars), then `packages/core` extraction.

---

## 2. Location tagging (pin the shop)

**Constraint:** SMS carries **no location**. So we capture it on our side.

**Feasible in three tiers, ship incrementally:**

- **Tier 1 — foreground capture (easy, do first).** When a transaction is
  created/confirmed in-app, grab the current GPS fix (`ACCESS_FINE_LOCATION`,
  requested at that moment), store `lat`/`lng`/`accuracy`, reverse-geocode to a
  place name. Covers manual entries and confirmations.
- **Tier 2 — merchant→place memory (high value, cheap).** Once a merchant is seen
  at a location, remember it (a `merchant_places` table or the existing merchant
  memory). Future transactions from that same merchant — **including background
  SMS ones** — inherit the pin with no GPS needed. This is what makes "pinpoint
  the shop" work without draining the battery.
- **Tier 3 — background capture on SMS arrival (optional, heavier).** SMS is
  received via a broadcast even in the background; to tag it live we'd need
  `ACCESS_BACKGROUND_LOCATION` and a headless task reading last-known location.
  Battery + Play-policy cost is real — only if Tier 2 proves insufficient.

**Schema:** add `lat REAL`, `lng REAL`, `place TEXT` to `transactions`; optional
`merchant_places(pattern, lat, lng, place, owner_id)`. Reverse-geocode with
Google Geocoding or OpenStreetMap Nominatim. The web map view (Tier 1+2 data)
then plots spending by shop.

---

## 3. Account transfers (bank ↔ wallet)

The `transfers` table already exists (from/to account, amount, fee). To finish:

- **Manual transfer UI** — a "Transfer" mode: from-account → to-account, amount,
  fee; on save, debit source, credit destination, write a `transfers` row.
- **AI action** — `create_transfer` in `aiActions.ts` so the coach can move money
  on request ("move 50k from BK to MoMo"), gated by the usual confirm.
- **SMS/AI-sorter context** — teach the parser that a debit on one own-account
  paired with a credit on another (or narrations like "transfer to own account",
  "wallet top-up") is a **transfer, not an expense**, so it nets to zero across
  net worth. Match by account number when possible; otherwise surface as a
  suggested transfer for the user to confirm.

---

## 4. Payment-channel intelligence + re-initiate payment

**Vision:** learn per seller — the **channel** (MoMoPay / Bank transfer / Direct
transfer / Airtime / Bill), the **code** (e.g. MoMoPay merchant code), and the
**fee** — so later you can search a seller and fire a new payment down the same
rail (`*182*8*1*<code>#` for MoMoPay, the bank flow for transfers).

**Data model (needs the §5 schema procedure):**
- `transactions.channel TEXT`, `transactions.pay_code TEXT` (fee already exists).
- Extend merchant memory: `merchant_rules` (or a new `merchant_channels`) learns
  `channel` + `pay_code` per normalized seller, the same way category is learned
  today. The **Fix sheet** gains channel + code fields; confirming trains it.
- Local-first option (no backend change) to start: store channel/code in the
  device-local merchant memory (like the current sender→account channel memory),
  then promote to synced columns once the migration lands.

**Parser training:** extend the Gemini prompt to also extract `channel` and `fee`
from the SMS (BK/MoMo narrations are distinctive), and pass known
seller→channel rules as context so it self-corrects — mirroring how category
rules are already fed in.

**Re-initiate payment (later):** a "Pay again" action on a seller builds the USSD
string from the learned channel + code and dials it via `Linking.openURL('tel:'
+ encodeURIComponent('*182*8*1*<code>#'))`. Fees are tracked from the parsed
`fees`, so we can show the true cost per rail.

---

## 5. How to add a column without breaking sync (do this in order)

Adding a field to a synced table is a 3-step dance — wrong order = failed uploads:

1. **Supabase first:** `ALTER TABLE <t> ADD COLUMN <c> ...;` (add to
   `supabase_migration_v2.sql` and run it).
2. **PowerSync Sync Rules:** add the column to the table's rule so it streams
   down (PowerSync dashboard).
3. **Client schema last:** add `column.<type>` to `PowerSyncSchema.ts`.

Only after 1+2 should the client start *writing* the column, or the connector's
upsert will 400 on an unknown Supabase column and retry forever.

---

## Suggested sequence

1. RLS policies + schema procedure baked in (unblocks everything).
2. Transfers (manual UI + AI action + sorter context) — table already exists.
3. Payment-channel learning (local-first → synced columns) + fee tracking.
4. `packages/core` extraction, then `apps/web` read-only dashboard → editing.
5. Location Tier 1 + Tier 2 (foreground + merchant→place memory), web map view.
6. Location Tier 3 and USSD "Pay again" as the payoffs once data is flowing.
