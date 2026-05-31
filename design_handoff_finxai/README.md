# Handoff: FinXAI — AI-powered finance tracker (Rwanda)

## Overview
FinXAI is a personal finance app for the Rwandan market. Its core bet: people won't manually log every transaction, so the app **reads bank/MoMo SMS, auto-categorizes with AI, and coaches the user**. This bundle contains a high-fidelity, fully interactive **HTML/React prototype** of the redesigned app, covering: Home dashboard, AI Finance Coach chat, SMS auto-categorization review, Records, Accounts, Debts & loans (with repayment schedules), Budgets (personal + shared + party + recurring goals), Schedule (agenda), Shopping lists, Shared accounts, and a MoMo USSD / bank-API payment flow.

## About the Design Files
The files in this bundle are **design references created in HTML + React (via in-browser Babel)** — they show the intended look, layout, copy, and interaction behavior. **They are not the production codebase.** The task is to **recreate these designs in React Native** (the target environment), using RN-native primitives (`View`, `Text`, `Pressable`, `FlatList`, `SafeAreaView`), your navigation library (e.g. React Navigation), and your styling approach (StyleSheet / styled-components / Tamagui / NativeWind). Treat the HTML/CSS as the spec for visual values and behavior, not as code to port line-by-line.

The prototype is split into small files by concern (data, icons, shared UI, and one file per screen group) — mirror that structure in RN (a `theme.ts`, an `Icon` component, shared primitives, and screen components).

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and interactions are final and intentional. Recreate pixel-faithfully. The design canvas is **412 × 892** (Android, Pixel-class). All type sizes are tuned for **compact density with Poppins**.

---

## Design Tokens

### Color (dark theme — the product is dark-first)
| Token | Value | Use |
|---|---|---|
| `bg` | `#0A0D10` | App background |
| `surface` | `#13171B` | Cards |
| `surface-2` | `#1A1F24` | Inset controls, chips, icon buttons |
| `surface-3` | `#232A30` | Toggle track, deepest insets |
| `border` | `rgba(255,255,255,0.07)` | Hairline card borders |
| `border-2` | `rgba(255,255,255,0.12)` | Stronger borders, sheet handle |
| `text` | `#F2F4F5` | Primary text |
| `text-2` | `#A6AEB6` | Secondary text |
| `text-3` | `#6B747C` | Tertiary / captions |
| `accent` | `#22C55E` | Primary (emerald). Buttons, active nav, AI |
| `accent-600` | `#16A34A` | Accent pressed / gradient end |
| `accent-soft` | `rgba(34,197,94,0.14)` | Accent tint backgrounds |
| `accent-ink` | `#052E16` | Text/icon ON accent fills |
| `income` | `#34D399` | Positive amounts |
| `expense` | `#FB7185` | Negative amounts |
| `warn` | `#FBBF24` | Warnings, "due next" |
| `info` | `#60A5FA` | Shared/family accents |

Category colors (icon chips): food `#F59E0B`, groceries `#22C55E`, transport `#60A5FA`, utilities `#FBBF24`, airtime `#A78BFA`, rent `#F472B6`, health `#FB7185`, shopping `#34D399`, salary `#22C55E`, family `#38BDF8`, fun `#FB923C`, savings `#2DD4BF`, education `#818CF8`. Icon chip = `color + '22'` fill, `color + '33'` border, icon in full `color`.

Tints used for accounts: MTN MoMo `#FFCC00`, Bank of Kigali `#1E73BE`, Cash `#22C55E`, Equity `#E2231A`, Airtel `#E40000`.

### Typography — **Poppins** (single family; `JetBrains Mono` only for code/USSD/raw SMS)
Weights used: 400/500/600/700/800. Numbers use **tabular-nums** everywhere amounts appear.
| Role | Size / Weight |
|---|---|
| Balance hero | 30–34 / 700, letter-spacing -0.5 |
| Screen title (`h2`) | 20 / 700 |
| Section header | 14 / 600 |
| Card title | 13–14 / 600 |
| Body | 13–13.5 / 400–500 |
| Secondary | 11.5–12 / 400–500 |
| Caption / pill | 10–11 / 600 |
| Nav label | 10 / 500–600 |
"RWF" suffix renders ~0.66× the amount size in `text-3`.

### Radius & spacing
- Radius: cards `16`, large/hero `22`, small `10`; icon buttons `11–12`; pills `99`.
- Tweakable "sharp" variant: `9 / 13 / 7`.
- Screen padding `16`. Card inner padding `13–18`. Gaps `8–16` via flex `gap` (use RN `gap` / spacers).
- Pressable feedback: `scale(0.97)` on press (use RN `Pressable` with scale or opacity).

### Icons
Single consistent **line-icon set** (Lucide path data, 24×24 viewBox, stroke-width ~1.9, round caps/joins). In RN use `lucide-react-native` or `react-native-svg` with the same names. Names used: home, wallet, receipt, pie, bell, plus, chevronRight/Left/Down, arrowLeft, refresh, sparkles (AI), send, search, upRight, downLeft, bag, cart, calendar, calendarPlus, users, userPlus, tag, card, phone, bank, trendUp/Down, check, checkCircle, x, pencil, dots, target, food, car, zap, sliders, eye, share, mic, lock, coins, repeat, filter, message, alert, info, gift, globe, clock, flame, shield, star, scan, split, health.

---

## Navigation & Routing
- **Bottom tab bar** (5 slots): Home · Accounts · **[AI — raised center FAB]** · Records · Budget. The AI button is a 52px gradient circle (`#34D399→#16A34A`), raised `-22px`, 3px `bg`-colored border, green glow shadow. Active tab = `accent`, inactive = `text-3`; active icons render filled.
- **Stack on top of tabs**: tapping into detail/flow screens pushes; a back chevron (38px `surface-2` rounded square) pops. In RN use a native stack per tab (or a root stack) — mirror the `go(name, params)` / `back()` model in the prototype's `app.jsx`.
- **AI chat** is full-screen (no bottom tab bar visible) with its own header + input bar.

Route list (prototype names → screens): `home`, `accounts`, `account(:id)`, `add-account`, `records`, `txn(:id)`, `budget` (hub), `budget-group(:id)`, `create-budget`, `ai` (chat), `sms` (review), `categories`, `shopping`, `shared`, `schedule`, `debt`, `debt-detail(:id)`, `add-debt`, `notifications`, `profile`, `add-txn`.

---

## Screens / Views

### 1. Home (`screens-home.jsx`)
- **TopBar**: 30px emerald sparkles logo, "Murakaza neza / Hello Fabrice", bell (with red unread dot), avatar.
- **AI sync banner** (tappable → `sms`): emerald gradient card, sparkles chip, "AI sorted 11 SMS for you · N need a quick check · synced 2 min ago", green chevron affordance.
- **Balance hero**: radial emerald-tinted surface; "Total balance" + eye icon; `+3.4% this month` pill; **928,000 RWF** at 34/700; two inset tiles Income (`income`) / Spent (`expense`) with up/down icons.
- **Accounts rail**: horizontal scroll of 152px account cards (icon chip in account tint, shared icon, name, balance) + dashed "Add" card → `add-account`.
- **Quick actions** (4-col grid): Debt · Shopping · Shared · Schedule (icon chip + label).
- **AI Coach nudge** card (→ `ai`): avatar, "AI Coach" label, a contextual sentence about dining budget.
- **Recent transactions**: card list of `TxnRow` (category chip, merchant, category + sparkles if SMS-sourced, amount colored, time).

### 2. AI Finance Coach (`screens-chat.jsx`)
Full-screen. Header: back, gradient sparkles avatar, "Finance Coach" + green dot "Knows your accounts", history icon. Thread of bubbles (AI left on `surface`, user right on `accent` with `accent-ink` text). AI bubbles can embed: **breakdown bars** (category label + bar in category color + tabular amount), bullet lists, a footer line, and an **action button** (e.g. "Schedule 200,000 → Savings"). Typing indicator = 3 bouncing dots. Suggestion chips row (horizontal scroll). Input bar: rounded field + mic, 44px circular emerald send button. See **AI_SPEC.md** for behavior.

### 3. SMS auto-categorization review (`screens-plan.jsx` → `SmsReview`)
Intro card explaining high-confidence items are auto-saved. Each **SmsCard**: top section = raw SMS in `JetBrains Mono` 10.5 on `surface-2` with sender + timestamp; bottom = AI interpretation (category chip, merchant, category·account, amount, **confidence pill**) + "Fix" / "Confirm" buttons. Confirming removes the card; empty state = "All sorted. Congz! 🎉". Confidence pill: ≥92% emerald, ≥80% amber, else rose; shows `%` with sparkles icon.

### 4. Records (`screens-money.jsx`)
Title + search/filter icon buttons. Two summary tiles (Money in / Money out). Filter chips: All · Spending · Income · AI-tagged. Transactions grouped by date label with per-day net total; each group is a card of `TxnRow`.

### 5. Accounts + detail + Add account (`screens-money.jsx`)
- **Accounts**: net-worth hero + list of account rows (tint icon, name, "Shared" pill, kind·mask, balance).
- **Account detail**: tinted hero with balance + Add/Share/Sync buttons; activity list.
- **Add account**: SMS-permission explainer; selectable list (MTN MoMo, Airtel Money, Bank of Kigali, Equity, Cash) with radio check; "Connect securely" CTA. **Connecting = granting SMS read access** — this is the core onboarding.

### 6. Transaction detail (`screens-money.jsx` → `TxnDetail`)
Big category icon, merchant, signed amount. Detail rows (category, account, when, note). If SMS-sourced: an **"Auto-tagged from SMS"** panel with confidence + "I'll learn from it" copy. "Recategorize" / "Split" buttons. Editing a category is the AI's training signal.

### 7. Debts & loans (`screens-debt.jsx`)
- **List**: two summary cards (You owe / Owed to you); AI insight nudge ("Pay 20,000 extra… clear it 2 months early"); active debts with progress bar, % repaid, next due, "You owe"/"Owed" pill.
- **Detail**: tinted hero (outstanding, progress, Principal/Installment/Rate/Cadence stats); **"Pay installment" CTA → PaySheet**; **repayment schedule** = vertical timeline of installments (paid = emerald check, due-next = amber numbered + "Due next" pill, upcoming = gray numbered), amount struck-through when paid; AI footer with projected payoff date.
- **Add/configure debt**: borrowed/lent segmented toggle; fields (counterparty, principal, interest, linked account); cadence Weekly/Monthly/One-off; installment/first-due/#payments; "Create & build schedule" (AI generates schedule + reminders).

### 8. Budgets hub + party detail + create (`screens-budgetx.jsx`)
- **Hub** with segmented tabs **My spending** / **Shared & goals**.
  - *My spending*: progress **Ring** (% used) + "left to spend"; overspend AI nudge; per-category budget cards (chip, spent/limit, %, progress in category color, rose when over).
  - *Shared & goals*: explainer; group cards for **party** / **shared** / **goal**, each with emoji avatar, type pill, recurring repeat-icon, **contributor avatar stack**, progress, spent/target.
- **Group detail** (party/shared/goal): tinted hero (spent of pool / saved of target); **Contributors** list with per-person amounts (goal shows "50,000/month" auto-save); **Linked expenses** list, each marked "auto-linked" with sparkles; "Add expense"/"Invite" buttons. *This is the collaborative party-budget flow: pool contributions, AI links spend to the budget as transactions arrive.*
- **Create budget**: type grid (Category / Shared / Party / Goal); name/limit/account rows; **Recurring toggle** + Weekly/Monthly/Yearly; invite people (avatar stack) for shared/party; "Create budget".

### 9. Schedule (`screens-budgetx.jsx` → `ScheduleScreen`)
Horizontal **date strip** (June 2026) with dot markers on active days + selected highlight. "Due this week" / "Coming in" tiles. **Agenda** grouped by day; each item = tint icon, title, sub (source/type), and either a **"Pay" button → PaySheet** (for payable bills/installments) or a signed amount (income, non-payable). Aggregates: debt installments, recurring bills, subscriptions, budget/party dates, expected income & repayments.

### 10. Shopping lists (`screens-plan.jsx`)
Lists with shared pill ("Aline"), per-item checkboxes (toggle strikethrough), quantity, estimated cost; list footer shows done count + estimated total; "Add item" affordance.

### 11. Shared & family (`screens-plan.jsx`)
Privacy explainer; people cards (avatar, name, "Pending" pill, role·access, account pills); "Invite someone". Access model: per-account, view-only vs view+add — **not** full account access.

### 12. Payments — MoMo USSD / Bank API (`screens-debt.jsx` → `PaySheet`)
Bottom sheet. Stage 1 "choose": **MTN Mobile Money** + **Airtel Money** (active, "Prefill USSD") and **Bank of Kigali** + **Equity** (disabled "Soon" — future bank-API direct transfer). Stage 2 "ussd": a prefilled dialer string in mono, e.g. `*182*1*1*<amount>#`, with Cancel / **Call**. Stage 3 "done": confirmation — "AI will match the MoMo confirmation SMS and update your balance." Mounted on Debt detail and Schedule pay actions.

> **Future payment integration (build note):** Active path today = **USSD prefill** (open the dialer with the `tel:` / USSD string so the user confirms with their PIN — FinXAI never holds funds). Bank options are stubbed for a later **bank-specific API** direct-transfer integration. Keep the `PaySheet` provider abstract so a real USSD launcher and bank-API client can be slotted in per method.

### 13. Notifications & Profile (`app.jsx`)
- **Notifications**: typed rows (AI sorted, budget exceeded, partner added expense, bill due, salary received) with unread dots.
- **Profile**: avatar + Premium pill; settings rows → SMS auto-import, Categories, Shared & family, Schedule & recurring, Debts & loans, Privacy & security (on-device encryption), Currency & region (RWF · Rwanda).

---

## Interactions & Behavior
- **Screen enter**: fade + 8px rise, ~0.28s `cubic-bezier(.2,.7,.3,1)`.
- **Bottom sheets**: slide up from bottom 0.32s, scrim `rgba(0,0,0,0.55)` fade.
- **Press**: `scale(0.97)`.
- **Progress bars / rings**: animate width/stroke over ~0.6–0.8s.
- **Chat send**: optimistic user bubble → ~1.1s typing indicator → AI reply (`popIn`).
- **AI tagging confidence** drives both the badge color and which SMS auto-save vs. require review (threshold ~0.92 auto, below = review queue).

## State Management
Mirror the prototype's lightweight model. Global/app state needed: **accounts**, **transactions** (with `source`, `confidence`, `cat`, `acct`), **categories**, **budgets** (category) + **budget groups** (shared/party/goal with contributors & linked txns), **debts** (with generated `schedule[]`), **SMS review queue**, **shopping lists**, **shared people**, **schedule/agenda** (derived from debts + recurring + budgets + income), **chat thread**. In RN use Zustand/Redux/Context. Navigation params carry the selected entity id.

## Theme tweaks (optional)
Prototype exposes: **accent color** (5 options), **corner radius** (rounded/sharp), **ambient glow** toggle. Wire accent as a theme variable so it cascades to buttons/active states/AI.

## Assets
- **Fonts**: Poppins (400–800) + JetBrains Mono (400–600) — bundle via `expo-font` or `@react-native-fonts`.
- **Icons**: Lucide (use `lucide-react-native`).
- **No raster image assets** — everything is vector + type. User avatars are initial-on-tint circles; replace with real photos when available.
- Emoji are used intentionally for budget-group identity (🎉🏠🛟) and a few coach/empty-state moments — keep them.

## Files in this bundle
- `index.html` — entry; design tokens (`:root` CSS vars), fonts, script order.
- `app.jsx` — router, bottom nav wiring, tweaks, Notifications/Profile/AddTxn, theme application.
- `data.jsx`, `data-extra.jsx` — all mock data + helpers (`fmt`, `signed`, categories, accounts, transactions, budgets, SMS queue, shopping, shared, chat seed; debts + schedule builder, budget groups, agenda).
- `icons.jsx` — icon path set + `<Icon>`.
- `ui.jsx` — shared primitives (CatChip, Avatar, Money, Card, Progress, Pill, Conf, SectionHeader, ScreenHeader, Sheet, Btn, TopBar, BottomNav).
- `screens-home.jsx`, `screens-chat.jsx`, `screens-money.jsx`, `screens-plan.jsx`, `screens-debt.jsx`, `screens-budgetx.jsx` — screen groups.
- `AI_SPEC.md` — the AI Coach behavior, intents, and model-prompt guidance.
- `DATA_MODELS.md` — concrete data shapes to model in the backend / app state.
- `android-frame.jsx`, `tweaks-panel.jsx` — prototype scaffolding only (do **not** port; RN provides the device & you can skip tweaks).

> Open `index.html` to run the prototype in a browser. Use it as the source of truth for any visual value not spelled out here.
