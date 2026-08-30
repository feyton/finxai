// Row types mirroring src/tools/PowerSyncSchema.ts (the shared Postgres schema).
// Keep in lockstep with the schema; will move to packages/core later.

export interface Account {
  id: string;
  name: string | null;
  type: string | null;
  available_balance: number | null;
  opening_balance: number | null;
  transfer: number | null;
  auto: number | null;
  address: string | null;
  log_date: number | null;
  number: string | null;
  logo: string | null;
  provider_name: string | null;
  owner_id: string;
  created_at: string | null;
}

export interface Transaction {
  id: string;
  amount: number | null;
  account_id: string | null;
  category: string | null;
  subcategory: string | null;
  date_time: string | null;
  sms: string | null;
  sender: string | null;
  confirmed: number | null;
  currency: string | null;
  payee: string | null;
  merchant: string | null;
  transaction_type: string | null; // 'expense' | 'income' | 'transfer'
  note: string | null;
  fees: number | null;
  budget_id: string | null;
  source: string | null;
  confidence: number | null;
  transfer_account_id: string | null; // counterparty account for transfers
  transfer_direction: string | null; // 'in' | 'out' (transfers only)
  balance_after: number | null; // bank-reported balance after this txn (audit)
  // The bank's own reference. Present since v6 and written by the web's own
  // promote path, which this type could not previously describe.
  txn_ref: string | null;
  // Which path classified this: 'ai' when the server-side model answered, 'regex'
  // when it fell back to on-device pattern matching. Null on rows written before
  // migration v8 added the column.
  parse_source: string | null;
  // How the money left and the payee's id on that rail (v16) — what the phone's
  // "Pay again" rebuilds a USSD string from.
  channel: string | null;
  pay_code: string | null;
  // Where the money went out. Null on most rows.
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
  location_at: string | null;
  // 'device' = a real fix taken as the SMS arrived; 'merchant' = inherited from
  // a previous device-located payment to the same merchant (v17). Do not render
  // an inherited pin as though it were measured.
  location_source: string | null;
  owner_id: string;
  created_at: string | null;
}

/**
 * A parsed SMS the classifier was not confident enough to file on its own — it waits
 * here until someone confirms, corrects or ignores it. Promoting one writes a
 * `transactions` row with the SAME id and deletes this one (see lib/reviewActions).
 *
 * Nearly the same shape as Transaction, minus what only a filed record has
 * (budget_id, transfer_direction) — the direction is re-read from the SMS at promotion
 * time rather than stored.
 */
export interface AutoRecord {
  id: string;
  amount: number | null;
  account_id: string | null;
  category: string | null;
  subcategory: string | null;
  date_time: string | null;
  sms: string | null;
  sender: string | null;
  confirmed: number | null;
  currency: string | null;
  payee: string | null;
  merchant: string | null;
  transaction_type: string | null; // 'expense' | 'income' | 'transfer'
  note: string | null;
  fees: number | null;
  source: string | null;
  confidence: number | null;
  transfer_account_id: string | null;
  balance_after: number | null;
  txn_ref: string | null;
  parse_source: string | null; // 'ai' | 'regex' | null (pre-v8 rows)
  // Where the phone was when the alert arrived. Money-out only, and only when a usable
  // fix was already available — so most rows carry none.
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
  location_at: string | null;
  owner_id: string;
  created_at: string | null;
}

export interface Budget {
  id: string;
  name: string | null;
  period: string | null;
  start_date: string | null;
  end_date: string | null;
  amount: number | null;
  recurring: number | null;
  event: string | null;
  shared_with: string | null;
  collaborators: string | null;
  owner_id: string;
  created_at: string | null;
}

export interface BudgetItem {
  id: string;
  budget_id: string | null;
  name: string | null; // user-facing item label, e.g. 'Cake'
  category: string | null;
  subcategory: string | null;
  amount: number | null;
  owner_id: string;
}

export interface AccountShare {
  id: string;
  account_id: string;
  owner_id: string;
  invitee_email: string;
  shared_with_id: string | null;
  access: string; // 'view' | 'edit'
  status: string; // 'pending' | 'active'
  created_at: string | null;
}

export interface Subcategory {
  id: string;
  category: string; // CategoryId: 'food', 'transport', …
  name: string;
  icon: string | null;
  owner_id: string;
  created_at: string | null;
}

export interface SplitDetail {
  id: string;
  transaction_id: string;
  amount: number | null;
  category: string | null;
  subcategory: string | null;
  note: string | null;
  owner_id: string;
}

export interface Debt {
  id: string;
  dir: string | null; // 'borrowed' | 'lent'
  party: string | null;
  sub: string | null;
  principal: number | null;
  outstanding: number | null;
  rate: number | null;
  frequency: string | null;
  installment: number | null;
  next_due: string | null;
  account_id: string | null;
  term: number | null;
  paid: number | null;
  tint: string | null;
  icon: string | null;
  // v14 — how interest is charged and how the management fee is taken. The web's
  // own debt form writes all four; the type simply never caught up.
  method: string | null; // 'flat' | 'reducing' | 'equal_principal'
  management_fee_pct: number | null;
  management_fee_flat: number | null;
  fee_timing: string | null; // 'upfront' | 'spread'
  owner_id: string;
  created_at: string | null;
}
