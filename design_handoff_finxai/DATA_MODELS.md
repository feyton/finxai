# FinXAI — Data Models

Concrete shapes to model in app state / backend. Derived from the prototype (`data.jsx`, `data-extra.jsx`). Amounts are **integer RWF**; expenses negative, income positive.

```ts
type CategoryId =
  | 'food' | 'groceries' | 'transport' | 'utilities' | 'airtime' | 'rent'
  | 'health' | 'shopping' | 'salary' | 'family' | 'fun' | 'savings' | 'education';

interface Category { id: CategoryId; label: string; icon: string; color: string; }

interface Account {
  id: string;            // 'momo' | 'bk' | 'cash' | 'equity' | 'airtel'
  name: string;          // 'MTN MoMo', 'Bank of Kigali', ...
  kind: 'Mobile Money' | 'Bank account' | 'Wallet';
  balance: number;       // RWF
  icon: string;          // 'phone' | 'bank' | 'coins' | 'card'
  tint: string;          // brand hex
  last: string;          // masked id e.g. '*** 0789' / '00041 ••• 22'
  shared: boolean;
}

interface Transaction {
  id: string;
  merchant: string;
  cat: CategoryId;
  acct: string;          // Account.id
  amount: number;        // negative=expense, positive=income
  date: string;          // display label ('Today', 'Yesterday', 'Mon 26') — store ISO too
  time: string;          // 'HH:MM'
  source: 'sms' | 'manual' | 'auto';
  confidence: number;    // 0..1 (1 for manual)
  note?: string;
  budgetGroupId?: string; // if linked to a shared/party budget
}

// Category (personal) budget for the current period
interface Budget { cat: CategoryId; limit: number; spent: number; }

// SMS awaiting review
interface SmsItem {
  id: string;
  sender: string;        // 'M-Money' | 'BK' | 'Equity' ...
  when: string;          // relative label
  raw: string;           // raw SMS text (masked)
  ai: {                  // model's interpretation
    merchant: string;
    cat: CategoryId;
    acct: string;
    amount: number;
    confidence: number;
  };
}

// ── Debt / loan ───────────────────────────────────────────────
interface ScheduleItem {
  n: number;             // installment number (1-based)
  label: string;         // due date label '5 Jun 26'
  amount: number;        // installment RWF (positive magnitude)
  status: 'paid' | 'due' | 'upcoming';   // 'due' = next unpaid
}
interface Debt {
  id: string;
  dir: 'borrowed' | 'lent';   // borrowed = you owe; lent = owed to you
  party: string;              // counterparty
  sub: string;                // subtitle e.g. 'Personal loan'
  icon: string; tint: string;
  principal: number;
  outstanding: number;
  rate: number;               // annual % (0 if none)
  frequency: 'Weekly' | 'Monthly' | 'One-off';
  installment: number;
  nextDue: string;            // label
  account: string;            // Account.id used to pay/receive
  term: number;               // total installments
  paid: number;               // installments paid
  schedule: ScheduleItem[];   // generated; len === term
}
// helper buildSchedule(n, [day, monthIndex, year], amount, paidCount) -> ScheduleItem[]

// ── Budget groups: shared / party / recurring goal ────────────
interface Contributor { name: string; initials: string; tint: string; amount: number; }
interface BudgetGroup {
  id: string;
  name: string;
  emoji: string;              // identity glyph 🎉🏠🛟
  type: 'party' | 'shared' | 'goal';
  tint: string;
  target: number;             // pool size / spend cap / savings target
  spent: number;              // spent (or saved, for goals)
  date: string;               // 'Resets 1 Jul' | '14 Jun 26' | 'Auto-save 50,000/mo'
  recurring: boolean;
  frequency?: 'Weekly' | 'Monthly' | 'Yearly';
  contributors: Contributor[];
  linked: { merchant: string; cat: CategoryId; amount: number }[]; // auto-linked expenses
}

// ── Shopping ──────────────────────────────────────────────────
interface ShoppingItem { t: string; q: string; est: number; done: boolean; }
interface ShoppingList {
  id: string; name: string;
  shared: boolean; with: string | null;   // collaborator name
  items: ShoppingItem[];
}

// ── Shared people ─────────────────────────────────────────────
interface SharedPerson {
  id: string; name: string; role: string; initials: string; tint: string;
  access: 'View only' | 'Can view & add';
  accounts: string[];        // Account.id[] this person can see
  status: 'active' | 'pending';
}

// ── Schedule / agenda (derive, don't hand-author in prod) ─────
interface AgendaItem {
  title: string; sub: string;
  amount: number;            // signed
  icon: string; tint: string;
  payable: boolean;          // shows "Pay" -> PaySheet; else shows amount
  ref?: { type: 'debt'|'bill'|'budget'|'income'|'repayment', id?: string };
}
interface AgendaDay { day: string; dow: string; items: AgendaItem[]; }
```

## Derivations
- **Net worth** = Σ account balances.
- **This-period in/out** = Σ positive / |Σ negative| transactions in range.
- **Category budget `spent`** = Σ |expenses| in that category this period.
- **Budget group `spent`** = Σ |linked transactions| (party/shared) or Σ contributions (goal).
- **Agenda** = merge upcoming debt installments (`status:'due'/'upcoming'`), recurring bills/subscriptions, recurring-budget resets, party dates, expected income & lent-money repayments — sorted by date; `payable` true for bills/installments the user pays.
- **Debt projection** (for the coach): standard amortization from `outstanding`, `installment`, `rate/12` to compute payoff date and interest, plus "extra payment" what-ifs.

## Seed values (for parity with the prototype)
- Accounts: MoMo 184,500 · BK 612,300 · Cash 23,000 · Equity 95,800 · Airtel 12,400 → **net 928,000**.
- Debts: BK personal loan (1,500,000 → 916,000 outstanding, 142,000/mo, 16%, 6/12 paid); SACCO moto loan (600,000 → 385,000, 55,000/mo, 12%, 4/12); lent to Jean Bosco (100,000 → 50,000, one-off). **You owe 1,301,000 · owed to you 50,000.**
- Budget groups: Aline's Birthday (party, 250,000 target, 180,000 spent, 3 contributors); Household (shared+recurring monthly, 400,000, 246,000); Emergency fund (goal+recurring, 1,000,000 target, 340,000 saved, 50,000/mo auto-save).
