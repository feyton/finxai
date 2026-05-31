# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FinXAI is an Android expense tracking app that uses SMS parsing and AI to automate financial record creation. Built with React Native 0.78.2 and TypeScript, backed by MongoDB Realm (Atlas Device Sync) for persistent cloud-synced data.

## Commands

```bash
yarn install          # Install dependencies
yarn start            # Start Metro bundler
yarn android          # Run on Android emulator/device
yarn lint             # ESLint check
yarn test             # Jest tests

# Production APK build (combines bundle + Gradle assemble)
npm run build
# Or manually:
npx react-native bundle --platform android --dev false --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res/
cd android && ./gradlew assembleRelease
```

## Architecture

### Navigation (src/navigation/)

Two-level navigation structure:
- **AuthStack** — shown when no authenticated Realm user
- **MainStack** — bottom tab navigator with 4 tabs: Home, Accounts, Records (Transactions), Budget
- **App.tsx** — wraps everything in Realm's `AppProvider` / `UserProvider`, registers modal screens on top of the tab navigator (CreateRecord, CreateBudget, ManageCategories, UserProfile, etc.)

### Data Layer — Realm (src/tools/)

All persistent data goes through Realm with MongoDB Atlas Sync (app ID: `finxai-krgaaei`). Key schema objects:
- **Account** — holds a list of Transaction objects + available balance
- **Transaction** — expense/income/transfer records (amount, date, category, fees)
- **AutoRecord** — SMS-parsed transactions awaiting user confirmation
- **Budget / BudgetItem** — period-based budgets with per-category allocations
- **Category / Subcategory** — hierarchical categories loaded from `src/tools/data.json`
- **ScheduledPayment / Subscription** — recurring payment tracking

Components read data via `useQuery()` and write via `useRealm()`. Sync uses `DownloadBeforeOpen` for a fresh realm or `OpenImmediately` when one already exists on disk.

### SMS Parsing Pipeline

1. `SMSRetriever.tsx` — reads Android SMS inbox (requires READ_SMS permission, requested at runtime in App.tsx)
2. `src/tools/parseSMS.ts` — uses compromise.js (NLP) + regex to extract amount (RWF currency), payee, date, transaction type, and fees
3. Parsed results become **AutoRecord** entries
4. User confirms or discards each one via the Confirm screen

### UI Patterns

- **Styling:** NativeWind 4 (Tailwind CSS) + `twrnc`. Dark theme: `#1d2027` (primary bg), `#252933` (secondary bg).
- **Forms:** react-hook-form with `Controller` wrapping custom `FloatingInput` components.
- **Icons:** Inline SVGs via react-native-svg (not image assets).
- **Toasts:** react-native-toast-notifications for user feedback.
- **Fonts:** Poppins and Lato loaded from `src/assets/fonts/` via `react-native.config.js`.

### Authentication

Google Sign-In (`@react-native-google-signin/google-signin`) with offline access, exchanging the auth code for Realm credentials via `Credentials.google()`. The Web Client ID is hardcoded in `LoginScreen.tsx`.

## Key Conventions

- All screens use functional components with hooks (`useQuery`, `useRealm`, `useUser`, `useNavigation`).
- Static category data (13+ expense categories, 4 income categories with emoji icons) lives in `src/tools/data.json` — do not store categories in Realm.
- Realm writes must happen inside `realm.write(() => { ... })` callbacks.
- Subscriptions must be explicitly added/updated when introducing new query filters — see existing `useEffect` blocks in screens that call `sub.subscribe()`.
- No `.env` file — Google OAuth client ID and Realm App ID are hardcoded; keep them that way unless refactoring env management.
