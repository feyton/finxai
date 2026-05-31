// data-extra.jsx — debts/loans, shared & party budgets, schedule
// helper: build a repayment schedule
function buildSchedule(n, first, amount, paidCount) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const out = [];
  let [d, m, y] = first; // day, monthIndex(0-based), year
  for (let i = 0; i < n; i++) {
    const status = i < paidCount ? 'paid' : i === paidCount ? 'due' : 'upcoming';
    out.push({ n: i + 1, label: `${d} ${months[m]} ${String(y).slice(2)}`, amount, status });
    m += 1; if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

// ── Debts & loans ─────────────────────────────────────────────
const DEBTS = [
  {
    id: 'd1', dir: 'borrowed', party: 'Bank of Kigali', sub: 'Personal loan', icon: 'bank', tint: '#1E73BE',
    principal: 1500000, outstanding: 916000, rate: 16, frequency: 'Monthly', installment: 142000,
    nextDue: '5 Jun 26', account: 'bk', term: 12, paid: 6,
    schedule: buildSchedule(12, [5, 0, 2026], 142000, 6),
  },
  {
    id: 'd2', dir: 'borrowed', party: 'Umurenge SACCO', sub: 'Asset loan (moto)', icon: 'coins', tint: '#22C55E',
    principal: 600000, outstanding: 385000, rate: 12, frequency: 'Monthly', installment: 55000,
    nextDue: '2 Jun 26', account: 'momo', term: 12, paid: 4,
    schedule: buildSchedule(12, [2, 1, 2026], 55000, 4),
  },
  {
    id: 'd3', dir: 'lent', party: 'Jean Bosco', sub: 'Lent to friend', icon: 'users', tint: '#60A5FA',
    principal: 100000, outstanding: 50000, rate: 0, frequency: 'One-off', installment: 50000,
    nextDue: '15 Jun 26', account: 'momo', term: 2, paid: 1,
    schedule: buildSchedule(2, [15, 4, 2026], 50000, 1),
  },
];
const debtTotals = {
  owe: DEBTS.filter(d => d.dir === 'borrowed').reduce((s, d) => s + d.outstanding, 0),
  owed: DEBTS.filter(d => d.dir === 'lent').reduce((s, d) => s + d.outstanding, 0),
};

// ── Budget groups: shared / party / recurring / goals ─────────
const BUDGET_GROUPS = [
  {
    id: 'g1', name: "Aline's Birthday", emoji: '🎉', type: 'party', tint: '#F472B6',
    target: 250000, spent: 180000, date: '14 Jun 26', recurring: false,
    contributors: [
      { name: 'Fabrice', initials: 'F', tint: '#22C55E', amount: 150000 },
      { name: 'Aline', initials: 'AU', tint: '#F472B6', amount: 60000 },
      { name: 'Eric', initials: 'E', tint: '#60A5FA', amount: 40000 },
    ],
    linked: [
      { merchant: 'Inzora Rooftop (deposit)', cat: 'food', amount: -80000 },
      { merchant: 'Simba — cake order', cat: 'groceries', amount: -35000 },
      { merchant: 'Decor & balloons', cat: 'shopping', amount: -65000 },
    ],
  },
  {
    id: 'g2', name: 'Household', emoji: '🏠', type: 'shared', tint: '#60A5FA',
    target: 400000, spent: 246000, date: 'Resets 1 Jul', recurring: true, frequency: 'Monthly',
    contributors: [
      { name: 'Fabrice', initials: 'F', tint: '#22C55E', amount: 250000 },
      { name: 'Aline', initials: 'AU', tint: '#F472B6', amount: 150000 },
    ],
    linked: [
      { merchant: 'SIMBA Supermarket', cat: 'groceries', amount: -28400 },
      { merchant: 'REG Cash Power', cat: 'utilities', amount: -10000 },
      { merchant: 'WASAC Water', cat: 'utilities', amount: -6700 },
    ],
  },
  {
    id: 'g3', name: 'Emergency fund', emoji: '🛟', type: 'goal', tint: '#2DD4BF',
    target: 1000000, spent: 340000, date: 'Auto-save 50,000/mo', recurring: true, frequency: 'Monthly',
    contributors: [{ name: 'Fabrice', initials: 'F', tint: '#22C55E', amount: 340000 }],
    linked: [],
  },
];

// ── Schedule (agenda) — June 2026 ─────────────────────────────
const SCHEDULE = [
  { day: '02', dow: 'Mon', items: [
    { title: 'SACCO loan installment', sub: 'Umurenge SACCO · Debt', amount: -55000, icon: 'coins', tint: '#22C55E', payable: true },
  ]},
  { day: '05', dow: 'Thu', items: [
    { title: 'BK loan installment', sub: 'Bank of Kigali · Debt', amount: -142000, icon: 'bank', tint: '#1E73BE', payable: true },
    { title: 'Salary — Rw Tech', sub: 'Income', amount: 620000, icon: 'coins', tint: '#22C55E', payable: false },
  ]},
  { day: '08', dow: 'Sun', items: [
    { title: 'Canal+ Rwanda', sub: 'Subscription · auto', amount: -18000, icon: 'flame', tint: '#FB923C', payable: true },
  ]},
  { day: '14', dow: 'Sat', items: [
    { title: "Aline's Birthday party", sub: 'Shared budget · 250,000 target', amount: -250000, icon: 'gift', tint: '#F472B6', payable: false },
  ]},
  { day: '15', dow: 'Sun', items: [
    { title: 'Jean Bosco repays', sub: 'Money owed to you', amount: 50000, icon: 'users', tint: '#60A5FA', payable: false },
  ]},
  { day: '23', dow: 'Mon', items: [
    { title: 'WASAC Water', sub: 'Utility bill · auto', amount: -6700, icon: 'zap', tint: '#FBBF24', payable: true },
    { title: 'School fees — Term 2', sub: 'Education', amount: -85000, icon: 'star', tint: '#818CF8', payable: true },
  ]},
];

Object.assign(window, { DEBTS, debtTotals, BUDGET_GROUPS, SCHEDULE, buildSchedule });
