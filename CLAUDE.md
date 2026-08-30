# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Project Overview

FinXAI is an Android expense tracker for Rwanda (RWF). It reads MoMo/bank SMS,
parses them into transactions, and adds budgets, debts, shared accounts, a
spending map and an AI coach on top. React Native 0.85 + TypeScript 6, synced
through **PowerSync → Supabase Postgres**.

There is also a Next.js web app (`apps/web`) on the same Postgres, deployed to
`app.feyton.co.rw`, which doubles as the app's server tier (AI proxy, invites).

> This file was rewritten 2026-08-30. It previously described a Realm/Atlas
> stack that had been gone for months — if something here contradicts the code,
> trust the code and fix this file.

## Commands

```bash
npm install           # npm, NOT yarn
npm start             # Metro
npm run android       # run on emulator/device (AVD: finxai_pixel)
npm test              # jest
npx tsc --noEmit      # typecheck — CI gates on this
npm run build         # signed arm64 APK, local testing only
npm run sync:shared   # refresh apps/web's copy of shared/ (see Drift below)
npm run eval          # SMS classifier eval against the real corpus
node scripts/verify-columns.mjs   # assert Postgres has columns before writing them
node scripts/verify-rls.mjs       # assert no table is readable with the anon key
```

`npm run lint` is currently broken (eslint config). Use `tsc` + `jest`.

## Releases — every push to `main` is a release

`.github/workflows/release.yml` builds a signed arm64 APK and publishes a GitHub
Release, which the in-app updater and Obtainium pick up. **There is no release
command.** Version comes from git: `versionName = <VERSION file>.<commits since
VERSION changed>`. Bump major/minor by editing `VERSION`; `[skip ci]` skips a
build. A *cancelled* run is normal concurrency (see DISTRIBUTION.md), not a
failure — only care if the newest run failed.

Consequence worth internalising: **anything you push ships to a real phone.**
Never push client code that writes a column before the migration is applied.

## Architecture

### Data layer — PowerSync + Supabase

- `src/tools/PowerSyncSchema.ts` — the client's view of every synced table.
- `src/tools/SupabaseConnector.ts` — upload path. Batches 500 CRUD ops, groups
  consecutive PUTs per table, and **discards permanently-failing batches**
  (22xxx/23xxx/42xxx/PGRST) instead of retrying forever. Transient errors
  rethrow so PowerSync retries.
- `src/tools/syncRepair.ts` / `syncWatchdog.ts` — PowerSync can report
  `connected: true` with a wedged upload queue and no error. The watchdog spots
  a non-draining queue; `describeQueue()` inspects it. **Run `describeQueue()`
  before theorising about sync.**
- Reads go through `useQuery` (reactive) — never make a reactive query a
  dependency of an effect that also writes to that table. That loop once queued
  11,245 operations and killed sync in both directions.

### Adding a column (do this in order — wrong order breaks sync)

1. **Postgres first** — add to a new `supabase_migration_vN.sql`, run it by hand
   in the Supabase SQL editor. There is no migration runner.
2. **Sync rules** — `powersync/sync-rules.yaml` is the versioned source; the
   deployed copy lives in the PowerSync dashboard and is pasted by hand. Adding
   a *column* needs no change (every query is `SELECT *`); adding a *table* does.
3. **Client last** — `PowerSyncSchema.ts`, then code that writes it.

Verify with `node scripts/verify-columns.mjs` before shipping the write.

### Security model

- RLS (`owner_id = auth.uid()`) is the real boundary; the Supabase anon key is
  public by design and hardcoded in `src/tools/supabase.ts`.
- **No model API keys on the device.** SMS classification and coach chat go
  through `apps/web/src/app/api/ai/*`, which holds the keys server-side, picks
  the provider per user, rate-limits, and caps daily spend.
- The repo is **public**. Never commit real SMS bodies, contact names or phone
  numbers — `eval/*.json` is gitignored for exactly this reason, and test
  fixtures must use invented data.

### SMS pipeline

Two entry points, one shared core in `src/tools/smsIngest.ts`:

- **Live/background:** `SmsReceiver.kt` → headless task → `smsTaskHandler.ts`.
- **Foreground poller:** `Components/SMSRetriever.tsx` (batch-only concerns:
  cross-message transfer hints, the `log_date` cursor).

`src/tools/smsParser.ts` splits deliberately into **deterministic regex facts**
(amount, fee, balance, direction, channel, pay code) and **fuzzy model
classification** (merchant, category). Put new extraction on the correct side:
anything that moves money — like `pay_code` — belongs in the regex half.

IDs are deterministic (`txnId.ts`), so a re-parse converges on one row.
Confidence ≥ `THRESHOLD_AUTO_SAVE` writes to `transactions`, else `auto_records`
(the review queue). **All promotion goes through `promoteAutoRecord`** — four
hand-written copies of that INSERT is how locations were silently dropped.

### Duplication and drift

`shared/` holds logic both clients need. Web cannot import above its root, so
`scripts/sync-shared.mjs` copies it into `apps/web/src/lib/shared/` and
`__tests__/sharedDrift.test.ts` **fails the build on any difference**. This
exists because a hand-maintained web copy of `resolveCat` missing one branch
misfiled ~423,000 RWF in a month. Never hand-edit the copy.

Still unguarded (fix if you touch them): `apps/web/src/lib/subcategories.json`
is a byte-copy of `src/tools/data.json`, and `apps/web/src/lib/types.ts` is a
hand-maintained mirror of `PowerSyncSchema.ts`.

## Conventions

- Functional components + hooks. Styling is **`src/theme.ts`** (`T`, `FONTS`,
  `R`, `CATS`) with `StyleSheet.create` — no NativeWind, no Tailwind, no
  `className`. Do not reintroduce them; css-interop stripped Pressable styles.
- Icons are lucide via `src/Components/ui/Icon.tsx` — add a name to its map
  before using it.
- Categories live in `src/tools/data.json` (+ user rows in `subcategories`),
  never in a synced categories table. `transactions.category` stores a **label**,
  `split_details.category` stores an **id**; `resolveCat` absorbs both.
- Balances are a stored column repaired by anchor-and-replay
  (`shared/balanceReplay.ts` via `src/tools/balance.ts`). Prefer
  `syncAccountBalance` over incrementing `available_balance` by hand.
- Comments explain **why**, usually naming the incident that caused the code.
  Keep that style; it is the most valuable thing in this codebase.
