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
  category: string | null;
  subcategory: string | null;
  amount: number | null;
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
  owner_id: string;
  created_at: string | null;
}
