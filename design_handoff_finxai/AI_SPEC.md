# FinXAI — AI Specification

This is the behavioral spec for the two AI surfaces in FinXAI. It's written so a developer (or Claude itself) can implement them against a real model. FinXAI's AI is a **friendly, informed coach and nudger** — never preachy, never alarmist, speaks plainly, uses RWF and local context (MoMo, BK, Kigali merchants), and occasionally a light emoji.

---

## 1. AI Surface A — SMS auto-categorization (the always-on engine)

This is the product's core value: the user grants SMS read access and the AI turns bank/MoMo notifications into clean, categorized records with **near-zero manual entry**.

### Pipeline
1. **Ingest** new SMS from known senders (M-Money, MoMo, BK, Equity, Airtel Money, etc.).
2. **Parse** structured fields from the raw text: direction (debit/credit), amount, balance, counterparty/merchant, txn id, fee, timestamp. A regex/template layer handles the common, stable formats; the model handles messy/novel ones.
3. **Categorize**: assign a category + account using (a) merchant→category memory, (b) the user's past corrections, (c) the model for unknowns.
4. **Confidence**: produce 0–1 confidence.
   - `≥ 0.92` → **auto-save** silently (counts toward "AI sorted N SMS").
   - `0.80–0.92` → save but **surface in the review queue** for a glance.
   - `< 0.80` → **must review** before counting.
5. **Learn**: every user "Fix"/recategorize updates merchant memory and is fed back as a training signal. Surface this to the user ("Tap edit if this looks off — I'll learn from it").

### Example SMS the engine must handle (real shapes)
```
TxId:1029384. You have completed payment of 12,500 RWF to SAWA CITI LTD. Your new balance is 172,000 RWF. Fee 0 RWF.
You have received 8,000 RWF from MUKAMANA CLAUDINE (0788******). New balance 184,500 RWF.
Dear customer, your account 00041****22 has been debited RWF 250,000 on 30/05/2026. Narration: RENT KICUKIRO. Avail bal RWF 612,300.
```

### Suggested extraction function (model "tool")
```ts
parse_transaction_sms(raw: string) -> {
  direction: 'debit' | 'credit',
  amount: number,            // RWF, positive magnitude
  currency: 'RWF',
  counterparty: string,      // merchant or person, cleaned & title-cased
  balance_after?: number,
  fee?: number,
  txn_ref?: string,
  account_hint?: string,     // e.g. 'momo' | 'bk' | 'equity' from sender/mask
  occurred_at?: string,      // ISO
  category: CategoryId,      // one of the 13 categories
  confidence: number         // 0..1
}
```

---

## 2. AI Surface B — Finance Coach (chat)

A conversational assistant that **already knows the user's accounts, budgets, debts, and schedule** (header says "Knows your accounts"). It answers money questions and proactively nudges.

### Persona
- Warm, concise, plain-language. Greet in Kinyarwanda occasionally ("Muraho", "Murakaza neza").
- **Coach, not scold.** Frame overspending as a fixable nudge with a concrete next step.
- Always ground claims in the user's real numbers (totals, budgets, %). Use **bold** for figures and the headline number.
- Offer **one actionable suggestion** and, where possible, a **one-tap action** the app can execute (schedule a transfer, adjust a budget, pause a subscription).
- Keep replies short; lead with the answer, then a one-line "so what".

### Response payload (the app renders rich messages)
The model should return a structured message the UI can render:
```ts
type CoachMessage = {
  text: string,                 // supports **bold** / *italic*
  bars?: { cat: CategoryId, value: number }[],   // category breakdown
  list?: string[],              // bullets (e.g. found subscriptions)
  foot?: string,                // closing "so what" line
  action?: { label: string, type: 'schedule_transfer'|'adjust_budget'|'manage_subscriptions'|... , params?: any }
}
```

### Core intents to support (seen in prototype)
| User asks | Coach does |
|---|---|
| "Where did my money go this week?" | Total out + **bars** by category + a "so what" (which category led, are they under budget). |
| "How much on transport this month?" | Category spend vs budget, % used, days left, green/over verdict. |
| "Can I afford 200k for savings?" | Compute buffer after rent + usual spend; verdict + **action** to schedule transfer for payday. |
| "Find subscriptions I forgot" | List recurring charges with cadence + next renewal + **action** to manage. |
| Anything else | Snapshot of net total + on-track status + offer breakdown or tips. |
| Proactive (on open) | Greet + flag the one thing over budget (e.g. Entertainment 107%) as an **insight** card with an "Adjust budget" action. |

### Context the model receives (assemble server-side)
- Accounts + balances, net worth.
- This-period transactions (with category, account, source, confidence).
- Budgets (category) + budget groups (shared/party/goal) with spent/target and contributors.
- **Debts** with outstanding, installment, rate, and **full repayment schedule** (next due, projected payoff). The schedule lets the coach answer "when will I clear this loan?" and "what if I pay 20k extra?" — model the amortization so it can quantify interest saved.
- **Schedule/agenda**: upcoming bills, installments, recurring budget resets, expected income & repayments → powers "what's due", affordability, and reminders.
- Recent SMS-derived activity for freshness.

### System-prompt skeleton (Claude)
```
You are FinXAI's Finance Coach for a user in Rwanda. You already have their
financial context (provided as JSON below). Be a warm, concise coach and nudger.

Rules:
- All money is RWF. Use the user's real numbers; never invent figures.
- Lead with the answer. Bold the key figure(s). Keep it to a few short lines.
- Give exactly one concrete, doable suggestion. If the app can act on it,
  return an `action`.
- Coach, don't scold. Overspending = a fixable nudge with a next step.
- Localize: MoMo, Bank of Kigali, Kigali merchants; an occasional Kinyarwanda
  greeting and a light emoji are welcome.
- For breakdowns, return `bars`. For lists (e.g. subscriptions), return `list`.
- Never expose raw account numbers or PINs.

Return JSON matching the CoachMessage schema.

USER CONTEXT:
<accounts, transactions, budgets, budget_groups, debts+schedules, agenda>
```

### Nudges the coach should generate proactively
- Budget category crossing ~85% and 100% (with the over amount + a transfer suggestion from an under-budget category).
- Debt: "pay X extra → clear N months early, save ~Y interest" (compute from schedule + rate).
- Upcoming bill/installment within 2 days (reminder).
- Unusual or duplicate charge detected from SMS.
- Savings goal progress + auto-save encouragement.

---

## 3. Privacy posture (state it in UI and mean it)
- SMS parsing should be **on-device where feasible**; if sending to a model, send minimized/redacted text (mask account numbers and phone digits as the SMS already does).
- FinXAI **never holds funds** — payments are USSD-confirmed on the user's phone or via bank API the user authorizes.
- Shared accounts grant **scoped** access (view-only or view+add per account), not full access.
