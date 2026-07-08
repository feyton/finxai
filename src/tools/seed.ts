// seed.ts — demo data seeding for development & UI testing.
// Inserts a realistic Rwandan dataset (RWF, MoMo, BK, local merchants) scoped
// to the signed-in user, mirroring the design prototype in design_handoff_finxai.
// All writes go through PowerSync so they sync up to Supabase like real usage.

import {AbstractPowerSyncDatabase} from '@powersync/react-native';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Date helpers (all relative to "now" so the demo always looks fresh) ──
function daysAgo(days: number, hour = 12, minute = 0): string {
  const t = new Date();
  t.setDate(t.getDate() - days);
  t.setHours(hour, minute, 0, 0);
  return t.toISOString();
}

function monthsFromNow(months: number, day = 5): string {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth() + months, day).toISOString();
}

function monthStart(): string {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), 1).toISOString();
}

function monthEnd(): string {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth() + 1, 0, 23, 59, 59).toISOString();
}

export async function hasSeededData(
  db: AbstractPowerSyncDatabase,
  ownerId: string,
): Promise<boolean> {
  const {rows} = await db.execute(
    'SELECT COUNT(*) as c FROM accounts WHERE owner_id = ?',
    [ownerId],
  );
  return (rows?._array?.[0]?.c ?? 0) > 0;
}

const TABLES = [
  'transactions',
  'split_details',
  'auto_records',
  'transfers',
  'budget_items',
  'budgets',
  'scheduled_payments',
  'subscriptions',
  'debt_schedules',
  'debts',
  'budget_group_expenses',
  'budget_group_contributors',
  'budget_groups',
  'shopping_items',
  'shopping_lists',
  'shared_people',
  'merchant_rules',
  'accounts',
];

export async function clearMyData(
  db: AbstractPowerSyncDatabase,
  ownerId: string,
): Promise<void> {
  for (const table of TABLES) {
    await db.execute(`DELETE FROM ${table} WHERE owner_id = ?`, [ownerId]);
  }
}

export async function seedDemoData(
  db: AbstractPowerSyncDatabase,
  ownerId: string,
): Promise<void> {
  const created = daysAgo(60, 9, 0);

  // ── Accounts (net worth 928,000 RWF) ─────────────────────────
  const momo = uuid();
  const bk = uuid();
  const cash = uuid();
  const equity = uuid();
  const airtel = uuid();

  const accounts: Array<[string, string, string, number, number, string, string, string]> = [
    // [id, name, number, balance, auto, address, provider_name, type]
    [momo, 'MTN MoMo', '0788 ••• 789', 184500, 1, 'M-Money', 'MTN MoMo', 'Mobile Money'] as any,
    [bk, 'Bank of Kigali', '00041 ••• 22', 612300, 1, 'BKeBANK', 'Bank of Kigali', 'Bank'] as any,
    [cash, 'Cash', '', 23000, 0, '', 'Cash wallet', 'Cash'] as any,
    [equity, 'Equity Bank', '•••• 7741', 95800, 1, 'EQUITYBANK', 'Equity Bank', 'Bank'] as any,
    [airtel, 'Airtel Money', '0731 ••• 231', 12400, 1, 'Airtel-Money', 'Airtel Money', 'Mobile Money'] as any,
  ];
  for (const [id, name, number, balance, auto, address, provider, type] of accounts) {
    await db.execute(
      'INSERT INTO accounts (id, name, number, opening_balance, available_balance, auto, address, logo, provider_name, type, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, number, balance, balance, auto, address, '', provider, type, ownerId, created],
    );
  }

  // ── Transactions (recent, spread over the last month) ────────
  // [merchant, payee, category, subcategory, account, amount, type, date, sender, source, confidence, fees, note, sms]
  const txns: Array<any[]> = [
    ['SIMBA Supermarket', 'SIMBA Supermarket', 'Food & Dining', 'Groceries', momo, 28400, 'expense', daysAgo(0, 13, 42), 'M-Money', 'sms', 0.97, 250, 'Kicukiro branch', 'TxId:1029111. You have completed payment of 28,400 RWF to SIMBA SUPERMARKET. Fee 250 RWF.'],
    ['Moto — Kacyiru', 'Moto driver', 'Transportation', 'Moto Transport', cash, 1000, 'expense', daysAgo(0, 12, 10), '', 'manual', 1, 0, '', ''],
    ['Question Coffee', 'Question Coffee', 'Food & Dining', 'Coffee & Snacks', momo, 4500, 'expense', daysAgo(0, 9, 25), 'M-Money', 'sms', 0.93, 100, 'Flat white', 'TxId:1029085. You have completed payment of 4,500 RWF to QUESTION COFFEE LTD. Fee 100 RWF.'],
    ['Salary — Rw Tech Ltd', 'Rw Tech Ltd', 'Salary', '', bk, 620000, 'income', daysAgo(1, 8, 1), 'BKeBANK', 'sms', 0.99, 0, 'Monthly payroll', 'Dear customer, your account 00041****22 has been credited RWF 620,000. Narration: SALARY RW TECH.'],
    ['REG Cash Power', 'REG', 'Utilities', 'Electricity', momo, 10000, 'expense', daysAgo(1, 19, 33), 'M-Money', 'sms', 0.95, 0, 'Token 4821 ••••', 'You have purchased Cash Power for 10,000 RWF. Token: 4821-....'],
    ['MTN Airtime', 'MTN Rwanda', 'Utilities', 'Internet', momo, 2000, 'expense', daysAgo(1, 18, 50), 'M-Money', 'sms', 0.98, 0, 'Bundle 5GB', 'You bought 5GB bundle for 2,000 RWF.'],
    ['To Aline (wife)', 'Aline Uwase', 'Gifts & Donations', 'Gifts', momo, 30000, 'expense', daysAgo(1, 14, 2), 'M-Money', 'sms', 0.9, 250, 'Home shopping', 'You have sent 30,000 RWF to ALINE UWASE (0788******). Fee 250 RWF.'],
    ['Sawa Citi', 'SAWA CITI LTD', 'Personal Care', 'Clothes', momo, 12500, 'expense', daysAgo(2, 15, 12), 'M-Money', 'sms', 0.86, 100, '', 'TxId:1029384. You have completed payment of 12,500 RWF to SAWA CITI LTD.'],
    ['Meze Fresh', 'Meze Fresh', 'Food & Dining', 'Restaurants', equity, 8500, 'expense', daysAgo(3, 13, 15), 'EQUITYBANK', 'sms', 0.88, 0, 'Burrito bowl', ''],
    ['YEGO Cab', 'YEGO', 'Transportation', 'Public Transport', momo, 3800, 'expense', daysAgo(3, 21, 40), 'M-Money', 'sms', 0.92, 100, 'Town → Nyamirambo', ''],
    ['Kimironko Market', 'Kimironko Market', 'Food & Dining', 'Groceries', cash, 12000, 'expense', daysAgo(4, 11, 5), '', 'manual', 1, 0, 'Vegetables, fruit', ''],
    ['Canal+ Rwanda', 'Canal+ Rwanda', 'Entertainment', 'Movies & Streaming', bk, 18000, 'expense', daysAgo(4, 7, 30), 'BKeBANK', 'sms', 0.94, 0, 'Evasion monthly', ''],
    ['From Jean Bosco', 'Jean Bosco', 'Other Income', 'Refunds', momo, 50000, 'income', daysAgo(5, 16, 20), 'M-Money', 'sms', 0.96, 0, 'Loan return', 'You have received 50,000 RWF from JEAN BOSCO (0788******).'],
    ['Inzora Rooftop', 'Inzora Rooftop', 'Food & Dining', 'Restaurants', equity, 15600, 'expense', daysAgo(5, 19, 10), 'EQUITYBANK', 'sms', 0.85, 0, '', ''],
    ['WASAC Water', 'WASAC', 'Utilities', 'Water', bk, 6700, 'expense', daysAgo(6, 10, 0), 'BKeBANK', 'sms', 0.91, 0, 'Monthly bill', ''],
    ['House Rent — Kicukiro', 'Landlord', 'Housing', 'Rent/Mortgage', bk, 250000, 'expense', daysAgo(8, 9, 0), 'BKeBANK', 'sms', 0.9, 0, 'Monthly rent', 'Dear customer, your account 00041****22 has been debited RWF 250,000. Narration: RENT KICUKIRO.'],
    ['Kigali Pharmacy', 'Kigali Pharmacy', 'Health & Fitness', 'Medication', momo, 7800, 'expense', daysAgo(10, 17, 45), 'M-Money', 'sms', 0.89, 100, '', ''],
    ['Salary — Rw Tech Ltd', 'Rw Tech Ltd', 'Salary', '', bk, 620000, 'income', daysAgo(31, 8, 1), 'BKeBANK', 'sms', 0.99, 0, 'Monthly payroll', ''],
  ];
  for (const [merchant, payee, category, subcategory, accountId, amount, type, dateTime, sender, source, confidence, fees, note, sms] of txns) {
    await db.execute(
      'INSERT INTO transactions (id, amount, account_id, category, subcategory, date_time, sms, sender, confirmed, currency, payee, merchant, transaction_type, note, fees, budget_id, source, confidence, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [uuid(), amount, accountId, category, subcategory, dateTime, sms, sender, 1, 'RWF', payee, merchant, type, note, fees, null, source, confidence, ownerId, dateTime],
    );
  }

  // ── Transfers ────────────────────────────────────────────────
  await db.execute(
    'INSERT INTO transfers (id, from_account_id, to_account_id, amount, date_time, note, currency, fees, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [uuid(), momo, cash, 20000, daysAgo(2, 10, 30), 'Pocket money', 'RWF', 100, ownerId, daysAgo(2, 10, 30)],
  );

  // ── Auto records (SMS awaiting review) ───────────────────────
  const autoRecords: Array<any[]> = [
    // [merchant, payee, category, account, amount, type, date, sender, confidence, sms]
    ['Sawa Citi', 'SAWA CITI LTD', 'Personal Care', momo, 12500, 'expense', daysAgo(0, 14, 55), 'M-Money', 0.86, 'TxId:1029384. You have completed payment of 12,500 RWF to SAWA CITI LTD. Your new balance is 172,000 RWF. Fee 0 RWF.'],
    ['House Rent', 'Landlord', 'Housing', bk, 250000, 'expense', daysAgo(0, 14, 20), 'BKeBANK', 0.79, 'Dear customer, your account 00041****22 has been debited RWF 250,000. Narration: RENT KICUKIRO. Avail bal RWF 612,300.'],
    ['From Claudine', 'Mukamana Claudine', 'Other Income', momo, 8000, 'income', daysAgo(0, 13, 58), 'M-Money', 0.9, 'You have received 8,000 RWF from MUKAMANA CLAUDINE (0788******). New balance 184,500 RWF.'],
  ];
  for (const [merchant, payee, category, accountId, amount, type, dateTime, sender, confidence, sms] of autoRecords) {
    await db.execute(
      'INSERT INTO auto_records (id, amount, account_id, category, subcategory, date_time, sms, sender, confirmed, currency, payee, merchant, transaction_type, fees, confidence, source, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [uuid(), amount, accountId, category, '', dateTime, sms, sender, 0, 'RWF', payee, merchant, type, 0, confidence, 'sms', ownerId, dateTime],
    );
  }

  // ── Budget (this month) with per-category items ──────────────
  const budgetId = uuid();
  await db.execute(
    'INSERT INTO budgets (id, name, period, start_date, end_date, amount, recurring, event, shared_with, collaborators, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [budgetId, 'Monthly essentials', 'monthly', monthStart(), monthEnd(), 435000, 1, '', '[]', '[]', ownerId, created],
  );
  const budgetItems: Array<[string, string, number]> = [
    ['Food & Dining', 'Groceries', 120000],
    ['Food & Dining', 'Restaurants', 80000],
    ['Transportation', '', 50000],
    ['Utilities', '', 40000],
    ['Entertainment', '', 45000],
    ['Gifts & Donations', '', 100000],
  ];
  for (const [category, subcategory, amount] of budgetItems) {
    await db.execute(
      'INSERT INTO budget_items (id, budget_id, category, subcategory, amount, owner_id) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), budgetId, category, subcategory, amount, ownerId],
    );
  }

  // ── Scheduled payments ───────────────────────────────────────
  const scheduled: Array<any[]> = [
    ['House rent — Kicukiro', 250000, bk, 'Landlord', 'monthly', 'expense', monthsFromNow(1, 1)],
    ['WASAC water bill', 7000, bk, 'WASAC', 'monthly', 'expense', monthsFromNow(1, 23)],
  ];
  for (const [name, amount, accountId, payee, frequency, type, nextDate] of scheduled) {
    await db.execute(
      'INSERT INTO scheduled_payments (id, name, amount, account_id, payee, frequency, transaction_type, start_date, next_reminder_date, is_recurring, note, labels, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [uuid(), name, amount, accountId, payee, frequency, type, monthStart(), nextDate, 1, '', '[]', ownerId, created],
    );
  }

  // ── Subscriptions ────────────────────────────────────────────
  const subs: Array<any[]> = [
    ['Canal+ Rwanda', 18000, bk, 'monthly', monthsFromNow(1, 4)],
    ['Netflix', 13500, momo, 'monthly', monthsFromNow(1, 12)],
  ];
  for (const [provider, amount, accountId, frequency, dueDate] of subs) {
    await db.execute(
      'INSERT INTO subscriptions (id, provider_name, amount, account_id, frequency, due_date, is_recurring, note, labels, active, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [uuid(), provider, amount, accountId, frequency, dueDate, 1, '', '[]', 1, ownerId, created],
    );
  }

  // ── Debts + repayment schedules ──────────────────────────────
  // [dir, party, sub, principal, outstanding, rate, frequency, installment, account, term, paid, tint, icon]
  const debts: Array<any[]> = [
    ['borrowed', 'Bank of Kigali', 'Personal loan', 1500000, 916000, 16, 'Monthly', 142000, bk, 12, 6, '#1E73BE', 'Landmark'],
    ['borrowed', 'SACCO Umurenge', 'Moto loan', 600000, 385000, 12, 'Monthly', 55000, momo, 12, 4, '#F59E0B', 'Bike'],
    ['lent', 'Jean Bosco', 'Personal loan', 100000, 50000, 0, 'One-off', 50000, momo, 2, 1, '#38BDF8', 'User'],
  ];
  for (const [dir, party, sub, principal, outstanding, rate, frequency, installment, accountId, term, paid, tint, icon] of debts) {
    const debtId = uuid();
    const nextDue = monthsFromNow(1, 5);
    await db.execute(
      'INSERT INTO debts (id, dir, party, sub, principal, outstanding, rate, frequency, installment, next_due, account_id, term, paid, tint, icon, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [debtId, dir, party, sub, principal, outstanding, rate, frequency, installment, nextDue, accountId, term, paid, tint, icon, ownerId, created],
    );
    for (let n = 1; n <= term; n++) {
      const status = n <= paid ? 'paid' : n === paid + 1 ? 'due' : 'upcoming';
      await db.execute(
        'INSERT INTO debt_schedules (id, debt_id, n, due_date, amount, status, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), debtId, n, monthsFromNow(n - paid, 5), installment, status, ownerId],
      );
    }
  }

  // ── Budget groups (party / shared / goal) ────────────────────
  // [name, emoji, type, tint, target, spent, dateLabel, recurring, frequency, contributors, expenses]
  const groups: Array<any[]> = [
    [
      "Aline's Birthday", '🎉', 'party', '#F472B6', 250000, 180000, '20 Jul 26', 0, '',
      [['You', 'FH', '#22C55E', 100000], ['Aline', 'AU', '#F472B6', 50000], ['Eric', 'EM', '#60A5FA', 30000]],
      [['Simba Cake Shop', 'Food & Dining', 45000], ['Decor rentals', 'Entertainment', 60000], ['Drinks & catering', 'Food & Dining', 75000]],
    ],
    [
      'Household', '🏠', 'shared', '#60A5FA', 400000, 246000, 'Resets 1st monthly', 1, 'Monthly',
      [['You', 'FH', '#22C55E', 250000], ['Aline', 'AU', '#F472B6', 150000]],
      [['Kimironko Market', 'Food & Dining', 96000], ['REG Cash Power', 'Utilities', 30000], ['SIMBA Supermarket', 'Food & Dining', 120000]],
    ],
    [
      'Emergency fund', '🛟', 'goal', '#2DD4BF', 1000000, 340000, 'Auto-save 50,000/mo', 1, 'Monthly',
      [['You', 'FH', '#22C55E', 340000]],
      [],
    ],
  ];
  for (const [name, emoji, type, tint, target, spent, dateLabel, recurring, frequency, contributors, expenses] of groups) {
    const groupId = uuid();
    await db.execute(
      'INSERT INTO budget_groups (id, name, emoji, type, tint, target, spent, date_label, recurring, frequency, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [groupId, name, emoji, type, tint, target, spent, dateLabel, recurring, frequency, ownerId, created],
    );
    for (const [cName, initials, cTint, amount] of contributors) {
      await db.execute(
        'INSERT INTO budget_group_contributors (id, group_id, name, initials, tint, amount, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), groupId, cName, initials, cTint, amount, ownerId],
      );
    }
    for (const [merchant, category, amount] of expenses) {
      await db.execute(
        'INSERT INTO budget_group_expenses (id, group_id, merchant, category, amount, transaction_id, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid(), groupId, merchant, category, amount, null, ownerId, created],
      );
    }
  }

  // ── Shopping lists ───────────────────────────────────────────
  const lists: Array<any[]> = [
    [
      'Weekly groceries', 1, 'Aline',
      [['Rice 5kg', '1', 6500, 1], ['Cooking oil 3L', '1', 9000, 1], ['Tomatoes', '2kg', 2400, 0], ['Eggs (tray)', '2', 6000, 0], ['Inyange milk', '6', 4800, 0], ['Bread', '2', 2000, 0]],
    ],
    [
      'Baby supplies', 0, '',
      [['Diapers size 4', '1', 14000, 0], ['Wipes', '2', 5000, 0]],
    ],
  ];
  for (const [name, shared, sharedWith, items] of lists) {
    const listId = uuid();
    await db.execute(
      'INSERT INTO shopping_lists (id, name, shared, shared_with, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [listId, name, shared, sharedWith, ownerId, created],
    );
    for (const [text, quantity, cost, done] of items) {
      await db.execute(
        'INSERT INTO shopping_items (id, list_id, text, quantity, estimated_cost, done, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), listId, text, quantity, cost, done, ownerId],
      );
    }
  }

  // ── Shared people ────────────────────────────────────────────
  const people: Array<any[]> = [
    ['Aline Uwase', 'Spouse', 'AU', '#F472B6', 'Can view & add', JSON.stringify([bk]), 'active'],
    ['Mama', 'Family', 'M', '#60A5FA', 'View only', JSON.stringify([momo]), 'pending'],
  ];
  for (const [name, role, initials, tint, access, accountIds, status] of people) {
    await db.execute(
      'INSERT INTO shared_people (id, name, role, initials, tint, access, accounts, status, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [uuid(), name, role, initials, tint, access, accountIds, status, ownerId, created],
    );
  }

  // ── Merchant rules (AI categorisation memory) ────────────────
  const rules: Array<[string, string]> = [
    ['simba supermarket', 'Food & Dining'],
    ['question coffee', 'Food & Dining'],
    ['yego cab', 'Transportation'],
    ['reg cash power', 'Utilities'],
  ];
  for (const [pattern, category] of rules) {
    await db.execute(
      'INSERT INTO merchant_rules (id, pattern, category, correction_count, confirmation_count, owner_id, updated_at) VALUES (?, ?, ?, 0, 2, ?, ?)',
      [uuid(), pattern, category, ownerId, created],
    );
  }
}
