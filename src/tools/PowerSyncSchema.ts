import {column, Schema, Table} from '@powersync/react-native';

// Note: PowerSync always adds an `id` UUID primary key — do not list it here.
// Booleans → integer (0/1). Arrays/objects → text (JSON string).

const accounts = new Table({
  name: column.text,
  type: column.text,
  available_balance: column.real,
  opening_balance: column.real,
  transfer: column.real,
  auto: column.integer,
  address: column.text,
  log_date: column.integer,
  number: column.text,
  logo: column.text,
  provider_name: column.text,
  owner_id: column.text,
  created_at: column.text,
});

const transactions = new Table({
  amount: column.real,
  account_id: column.text,
  category: column.text,
  subcategory: column.text,
  date_time: column.text,
  sms: column.text,
  sender: column.text,         // SMS sender address (e.g. 'MTN', 'BK')
  confirmed: column.integer,
  currency: column.text,
  payee: column.text,
  merchant: column.text,       // cleaned merchant name (AI-extracted)
  transaction_type: column.text,
  note: column.text,
  fees: column.real,
  budget_id: column.text,
  source: column.text,         // 'sms' | 'manual' | 'ai'
  confidence: column.real,     // 0..1 (AI confidence; 1 for manual)
  owner_id: column.text,
  created_at: column.text,
});

const split_details = new Table({
  transaction_id: column.text,
  amount: column.real,
  category: column.text,
  subcategory: column.text,
  note: column.text,
  owner_id: column.text,
});

const auto_records = new Table({
  amount: column.real,
  account_id: column.text,
  category: column.text,
  subcategory: column.text,
  date_time: column.text,
  sms: column.text,
  sender: column.text,         // 'M-Money' | 'BK' | 'Equity' etc.
  confirmed: column.integer,
  currency: column.text,
  payee: column.text,
  merchant: column.text,       // cleaned merchant name (AI-extracted)
  transaction_type: column.text,
  fees: column.real,
  confidence: column.real,     // 0..1 AI confidence score
  source: column.text,         // 'sms' | 'ai'
  owner_id: column.text,
  created_at: column.text,
});

const transfers = new Table({
  from_account_id: column.text,
  to_account_id: column.text,
  amount: column.real,
  date_time: column.text,
  note: column.text,
  currency: column.text,
  fees: column.real,
  owner_id: column.text,
  created_at: column.text,
});

const budgets = new Table({
  name: column.text,
  period: column.text,
  start_date: column.text,
  end_date: column.text,
  amount: column.real,
  recurring: column.integer,
  event: column.text,
  shared_with: column.text,   // JSON-encoded string[]
  collaborators: column.text, // JSON-encoded string[]
  owner_id: column.text,
  created_at: column.text,
});

const budget_items = new Table({
  budget_id: column.text,
  category: column.text,
  subcategory: column.text,
  amount: column.real,
  owner_id: column.text,
});

const scheduled_payments = new Table({
  name: column.text,
  amount: column.real,
  account_id: column.text,
  to_account_id: column.text,
  payee: column.text,
  frequency: column.text,
  transaction_type: column.text,
  start_date: column.text,
  next_reminder_date: column.text,
  last_paid_date: column.text,
  is_recurring: column.integer,
  note: column.text,
  labels: column.text, // JSON-encoded string[]
  owner_id: column.text,
  created_at: column.text,
});

const subscriptions = new Table({
  provider_name: column.text,
  amount: column.real,
  account_id: column.text,
  frequency: column.text,
  due_date: column.text,
  is_recurring: column.integer,
  note: column.text,
  labels: column.text, // JSON-encoded string[]
  active: column.integer,
  owner_id: column.text,
  created_at: column.text,
});

// ── New tables ────────────────────────────────────────────────

const debts = new Table({
  dir: column.text,           // 'borrowed' | 'lent'
  party: column.text,         // counterparty name
  sub: column.text,           // e.g. 'Personal loan'
  principal: column.real,
  outstanding: column.real,
  rate: column.real,          // annual % interest (0 if none)
  frequency: column.text,     // 'Weekly' | 'Monthly' | 'One-off'
  installment: column.real,
  next_due: column.text,      // ISO date
  account_id: column.text,
  term: column.integer,       // total installments
  paid: column.integer,       // installments paid so far
  tint: column.text,
  icon: column.text,
  owner_id: column.text,
  created_at: column.text,
});

const debt_schedules = new Table({
  debt_id: column.text,
  n: column.integer,          // installment number (1-based)
  due_date: column.text,      // ISO date
  amount: column.real,
  status: column.text,        // 'paid' | 'due' | 'upcoming'
  owner_id: column.text,
});

const budget_groups = new Table({
  name: column.text,
  emoji: column.text,
  type: column.text,          // 'party' | 'shared' | 'goal'
  tint: column.text,
  target: column.real,
  spent: column.real,
  date_label: column.text,    // 'Resets 1 Jul' | '14 Jun 26' | 'Auto-save 50,000/mo'
  recurring: column.integer,
  frequency: column.text,
  owner_id: column.text,
  created_at: column.text,
});

const budget_group_contributors = new Table({
  group_id: column.text,
  name: column.text,
  initials: column.text,
  tint: column.text,
  amount: column.real,
  owner_id: column.text,
});

const budget_group_expenses = new Table({
  group_id: column.text,
  merchant: column.text,
  category: column.text,
  amount: column.real,
  transaction_id: column.text,
  owner_id: column.text,
  created_at: column.text,
});

const shopping_lists = new Table({
  name: column.text,
  shared: column.integer,     // 0/1
  shared_with: column.text,   // collaborator name
  owner_id: column.text,
  created_at: column.text,
});

const shopping_items = new Table({
  list_id: column.text,
  text: column.text,
  quantity: column.text,
  estimated_cost: column.real,
  done: column.integer,       // 0/1
  owner_id: column.text,
});

const merchant_rules = new Table({
  pattern: column.text,            // lowercase normalised merchant name
  category: column.text,           // CategoryId the user assigned
  correction_count: column.integer, // times user corrected this mapping
  confirmation_count: column.integer,// times user confirmed this mapping
  owner_id: column.text,
  updated_at: column.text,
});

const shared_people = new Table({
  name: column.text,
  role: column.text,
  initials: column.text,
  tint: column.text,
  access: column.text,        // 'View only' | 'Can view & add'
  accounts: column.text,      // JSON array of account IDs
  status: column.text,        // 'active' | 'pending'
  owner_id: column.text,
  created_at: column.text,
});

export const AppSchema = new Schema({
  accounts,
  transactions,
  split_details,
  auto_records,
  transfers,
  budgets,
  budget_items,
  scheduled_payments,
  subscriptions,
  debts,
  debt_schedules,
  budget_groups,
  budget_group_contributors,
  budget_group_expenses,
  shopping_lists,
  shopping_items,
  shared_people,
  merchant_rules,
});
