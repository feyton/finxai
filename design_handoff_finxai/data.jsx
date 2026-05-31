// data.jsx — mock data, authentically Rwandan (RWF, MoMo, BK, local merchants)

const fmt = (n) => {
  const s = Math.abs(Math.round(n)).toLocaleString('en-US');
  return s;
};
const signed = (n) => (n < 0 ? '-' : '+') + fmt(n);

// ── Categories ────────────────────────────────────────────────
const CATS = {
  food:     { id: 'food', label: 'Food & Dining', icon: 'food', color: '#F59E0B' },
  groceries:{ id: 'groceries', label: 'Groceries', icon: 'cart', color: '#22C55E' },
  transport:{ id: 'transport', label: 'Transport', icon: 'car', color: '#60A5FA' },
  utilities:{ id: 'utilities', label: 'Utilities', icon: 'zap', color: '#FBBF24' },
  airtime:  { id: 'airtime', label: 'Airtime & Data', icon: 'phone', color: '#A78BFA' },
  rent:     { id: 'rent', label: 'Rent', icon: 'home2', color: '#F472B6' },
  health:   { id: 'health', label: 'Health', icon: 'health', color: '#FB7185' },
  shopping: { id: 'shopping', label: 'Shopping', icon: 'bag', color: '#34D399' },
  salary:   { id: 'salary', label: 'Salary', icon: 'coins', color: '#22C55E' },
  family:   { id: 'family', label: 'Family & Transfers', icon: 'users', color: '#38BDF8' },
  fun:      { id: 'fun', label: 'Entertainment', icon: 'flame', color: '#FB923C' },
  savings:  { id: 'savings', label: 'Savings', icon: 'target', color: '#2DD4BF' },
  education:{ id: 'education', label: 'Education', icon: 'star', color: '#818CF8' },
};

// ── Accounts ──────────────────────────────────────────────────
const ACCOUNTS = [
  { id: 'momo', name: 'MTN MoMo', kind: 'Mobile Money', balance: 184500, icon: 'phone', tint: '#FFCC00', last: '*** 0789', shared: false },
  { id: 'bk', name: 'Bank of Kigali', kind: 'Bank account', balance: 612300, icon: 'bank', tint: '#1E73BE', last: '00041 ••• 22', shared: true },
  { id: 'cash', name: 'Cash', kind: 'Wallet', balance: 23000, icon: 'coins', tint: '#22C55E', last: 'Physical', shared: false },
  { id: 'equity', name: 'Equity Bank', kind: 'Bank account', balance: 95800, icon: 'card', tint: '#E2231A', last: '•••• 7741', shared: false },
  { id: 'airtel', name: 'Airtel Money', kind: 'Mobile Money', balance: 12400, icon: 'phone', tint: '#E40000', last: '*** 0731', shared: false },
];
const totalBalance = ACCOUNTS.reduce((s, a) => s + a.balance, 0);

// ── Transactions ──────────────────────────────────────────────
// amount: negative = expense, positive = income
const TXNS = [
  { id: 't1', merchant: 'SIMBA Supermarket', cat: 'groceries', acct: 'momo', amount: -28400, date: 'Today', time: '13:42', source: 'sms', confidence: 0.97, note: 'Kicukiro branch' },
  { id: 't2', merchant: 'Moto — Kacyiru', cat: 'transport', acct: 'cash', amount: -1000, date: 'Today', time: '12:10', source: 'manual', confidence: 1, note: '' },
  { id: 't3', merchant: 'Question Coffee', cat: 'food', acct: 'momo', amount: -4500, date: 'Today', time: '09:25', source: 'sms', confidence: 0.93, note: 'Flat white' },
  { id: 't4', merchant: 'Salary — Rw Tech Ltd', cat: 'salary', acct: 'bk', amount: 620000, date: 'Yesterday', time: '08:01', source: 'sms', confidence: 0.99, note: 'May payroll' },
  { id: 't5', merchant: 'REG Cash Power', cat: 'utilities', acct: 'momo', amount: -10000, date: 'Yesterday', time: '19:33', source: 'sms', confidence: 0.95, note: 'Token 4821 ••••' },
  { id: 't6', merchant: 'MTN Airtime', cat: 'airtime', acct: 'momo', amount: -2000, date: 'Yesterday', time: '18:50', source: 'sms', confidence: 0.98, note: 'Bundle 5GB' },
  { id: 't7', merchant: 'To Aline (wife)', cat: 'family', acct: 'momo', amount: -30000, date: 'Yesterday', time: '14:02', source: 'sms', confidence: 0.9, note: 'Home shopping' },
  { id: 't8', merchant: 'Meze Fresh', cat: 'food', acct: 'equity', amount: -8500, date: 'Mon 26', time: '13:15', source: 'sms', confidence: 0.88, note: 'Burrito bowl' },
  { id: 't9', merchant: 'YEGO Cab', cat: 'transport', acct: 'momo', amount: -3800, date: 'Mon 26', time: '21:40', source: 'sms', confidence: 0.92, note: 'Town → Nyamirambo' },
  { id: 't10', merchant: 'Kimironko Market', cat: 'groceries', acct: 'cash', amount: -12000, date: 'Sun 25', time: '11:05', source: 'manual', confidence: 1, note: 'Vegetables, fruit' },
  { id: 't11', merchant: 'Canal+ Rwanda', cat: 'fun', acct: 'bk', amount: -18000, date: 'Sun 25', time: '07:30', source: 'sms', confidence: 0.94, note: 'Evasion monthly' },
  { id: 't12', merchant: 'From Jean Bosco', cat: 'family', acct: 'momo', amount: 50000, date: 'Sat 24', time: '16:20', source: 'sms', confidence: 0.96, note: 'Loan return' },
  { id: 't13', merchant: 'Inzora Rooftop', cat: 'food', acct: 'equity', amount: -15600, date: 'Sat 24', time: '19:10', source: 'sms', confidence: 0.85, note: '' },
  { id: 't14', merchant: 'WASAC Water', cat: 'utilities', acct: 'bk', amount: -6700, date: 'Fri 23', time: '10:00', source: 'sms', confidence: 0.91, note: 'April bill' },
];

// ── Budgets (this month) ──────────────────────────────────────
const BUDGETS = [
  { cat: 'groceries', limit: 120000, spent: 84300 },
  { cat: 'food', limit: 80000, spent: 71200 },
  { cat: 'transport', limit: 50000, spent: 22600 },
  { cat: 'utilities', limit: 40000, spent: 23400 },
  { cat: 'airtime', limit: 20000, spent: 14000 },
  { cat: 'fun', limit: 45000, spent: 48000 },
  { cat: 'family', limit: 100000, spent: 60000 },
];
const budgetTotal = { limit: BUDGETS.reduce((s, b) => s + b.limit, 0), spent: BUDGETS.reduce((s, b) => s + b.spent, 0) };

// ── SMS inbox awaiting AI review ──────────────────────────────
const SMS_QUEUE = [
  {
    id: 's1', sender: 'M-Money', when: '2 min ago',
    raw: 'TxId:1029384. You have completed payment of 12,500 RWF to SAWA CITI LTD. Your new balance is 172,000 RWF. Fee 0 RWF.',
    ai: { merchant: 'Sawa Citi', cat: 'shopping', acct: 'momo', amount: -12500, confidence: 0.86 },
  },
  {
    id: 's2', sender: 'BK', when: '38 min ago',
    raw: 'Dear customer, your account 00041****22 has been debited RWF 250,000 on 30/05/2026. Narration: RENT KICUKIRO. Avail bal RWF 612,300.',
    ai: { merchant: 'House Rent', cat: 'rent', acct: 'bk', amount: -250000, confidence: 0.79 },
  },
  {
    id: 's3', sender: 'M-Money', when: '1 hr ago',
    raw: 'You have received 8,000 RWF from MUKAMANA CLAUDINE (0788******). New balance 184,500 RWF.',
    ai: { merchant: 'From Claudine', cat: 'family', acct: 'momo', amount: 8000, confidence: 0.9 },
  },
];

// ── Shopping lists ────────────────────────────────────────────
const SHOPPING = [
  {
    id: 'sl1', name: 'Weekly groceries', shared: true, with: 'Aline',
    items: [
      { t: 'Rice 5kg', q: '1', est: 6500, done: true },
      { t: 'Cooking oil 3L', q: '1', est: 9000, done: true },
      { t: 'Tomatoes', q: '2kg', est: 2400, done: false },
      { t: 'Eggs (tray)', q: '2', est: 6000, done: false },
      { t: 'Inyange milk', q: '6', est: 4800, done: false },
      { t: 'Bread', q: '2', est: 2000, done: false },
    ],
  },
  {
    id: 'sl2', name: 'Baby supplies', shared: false, with: null,
    items: [
      { t: 'Diapers size 4', q: '1', est: 14000, done: false },
      { t: 'Wipes', q: '2', est: 5000, done: false },
    ],
  },
];

// ── Shared people ─────────────────────────────────────────────
const SHARED = [
  { id: 'p1', name: 'Aline Uwase', role: 'Spouse', initials: 'AU', tint: '#F472B6', access: 'Can view & add', accounts: ['bk'], status: 'active' },
  { id: 'p2', name: 'Mama (Mom)', role: 'Family', initials: 'M', tint: '#60A5FA', access: 'View only', accounts: ['momo'], status: 'pending' },
];

// ── AI chat seed ──────────────────────────────────────────────
const CHAT_SEED = [
  { who: 'ai', text: "Muraho Fabrice! 👋 I went through your SMS and sorted everything from this week. Quick heads-up: you're a little over on **Entertainment**." },
  { who: 'ai', kind: 'insight', text: "Canal+ (18,000) pushed *Entertainment* to 48,000 of your 45,000 budget — 107%.", action: 'Adjust budget' },
];
const CHAT_SUGGESTIONS = [
  'Where did my money go this week?',
  'How much on transport this month?',
  'Can I afford 200k for savings?',
  'Find subscriptions I forgot',
];

Object.assign(window, {
  fmt, signed, CATS, ACCOUNTS, totalBalance, TXNS, BUDGETS, budgetTotal,
  SMS_QUEUE, SHOPPING, SHARED, CHAT_SEED, CHAT_SUGGESTIONS,
});
