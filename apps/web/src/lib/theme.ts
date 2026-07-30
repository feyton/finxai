// Ported from the mobile app's src/theme.ts (pure logic, no RN).
// Kept in sync manually for now; will move to packages/core in a later phase.

// Web admin palette — light data surface, brand green (mirrors globals.css
// and the FinXAI.zip design handoff).
export const T = {
  bg: '#F6F8F6',
  surface: '#FFFFFF',
  surface2: '#F0F3F0',
  surface3: '#E6EAE5',
  border: 'rgba(13,23,17,0.08)',
  border2: 'rgba(13,23,17,0.16)',
  text: '#10160F',
  text2: '#5B665C',
  text3: '#8A948A',
  accent: '#16A34A',
  accent600: '#128A3E',
  accentSoft: 'rgba(22,163,74,0.12)',
  income: '#0D9668',
  expense: '#DC2626',
  warn: '#D97706',
  info: '#2563EB',
  chartIn: '#0D9668',
  chartOut: '#DC2626',
};

// Keep in lockstep with src/theme.ts in the mobile app — the two read the same
// Postgres rows, so a category the web does not know about is a category the web
// silently files somewhere else.
export type CategoryId =
  | 'food' | 'groceries' | 'transport' | 'utilities' | 'airtime' | 'rent'
  | 'health' | 'shopping' | 'salary' | 'family' | 'fun' | 'savings' | 'education'
  | 'personal_care' | 'housing' | 'technology' | 'debt' | 'gifts' | 'misc'
  | 'freelance';

export const CATS: Record<
  CategoryId,
  {id: CategoryId; label: string; emoji: string; color: string}
> = {
  food:      {id: 'food',      label: 'Food & Dining',      emoji: '🍽️', color: '#F59E0B'},
  groceries: {id: 'groceries', label: 'Groceries',          emoji: '🛒', color: '#22C55E'},
  transport: {id: 'transport', label: 'Transport',          emoji: '🚗', color: '#60A5FA'},
  utilities: {id: 'utilities', label: 'Utilities',          emoji: '⚡', color: '#FBBF24'},
  airtime:   {id: 'airtime',   label: 'Airtime & Data',     emoji: '📱', color: '#A78BFA'},
  rent:      {id: 'rent',      label: 'Rent',               emoji: '🏠', color: '#F472B6'},
  health:    {id: 'health',    label: 'Health',             emoji: '❤️', color: '#FB7185'},
  shopping:  {id: 'shopping',  label: 'Shopping',           emoji: '🛍️', color: '#34D399'},
  salary:    {id: 'salary',    label: 'Salary',             emoji: '🪙', color: '#22C55E'},
  family:    {id: 'family',    label: 'Family & Transfers', emoji: '👪', color: '#38BDF8'},
  fun:       {id: 'fun',       label: 'Entertainment',      emoji: '🔥', color: '#FB923C'},
  savings:   {id: 'savings',   label: 'Savings',            emoji: '🎯', color: '#2DD4BF'},
  education: {id: 'education', label: 'Education',           emoji: '⭐', color: '#818CF8'},
  // Added to match the mobile app. Until these existed here, every one of them
  // resolved to something else on the web: 'Personal Care' and 'Technology' fell
  // through to the 'shopping' default, and 'Housing' was captured by rent's
  // `includes('house')` test — so the two biggest non-rent categories in real
  // data were being reported under the wrong headings.
  personal_care: {id: 'personal_care', label: 'Personal Care',         emoji: '✂️', color: '#F0ABFC'},
  housing:       {id: 'housing',       label: 'Housing',               emoji: '🏢', color: '#C084FC'},
  technology:    {id: 'technology',    label: 'Technology',            emoji: '💻', color: '#22D3EE'},
  debt:          {id: 'debt',          label: 'Debt Payments',         emoji: '💳', color: '#EF4444'},
  gifts:         {id: 'gifts',         label: 'Gifts & Donations',     emoji: '🎁', color: '#FDA4AF'},
  misc:          {id: 'misc',          label: 'Miscellaneous',         emoji: '🏷️', color: '#94A3B8'},
  freelance:     {id: 'freelance',     label: 'Freelance/Side Hustle', emoji: '🤝', color: '#4ADE80'},
};

// Maps legacy category strings from existing data to a CategoryId.
//
// MUST stay byte-identical in behaviour to resolveCat in the mobile app's
// src/theme.ts. Branch ORDER is load-bearing, not stylistic: 'housing' has to be
// tested before 'rent' (because "Housing" contains "house"), and 'personal care'
// before 'health' (so 'salon'/'beauty' can't be claimed by a broader branch
// later). This copy had drifted to the pre-fix ordering, which is why Housing was
// being reported as Rent on the web while the phone showed them apart.
export function resolveCat(raw: string): CategoryId {
  const s = (raw ?? '').toLowerCase();
  if (s.includes('food') || s.includes('dining') || s.includes('restaurant') || s.includes('cafe')) return 'food';
  if (s.includes('grocer') || s.includes('supermarket') || s.includes('market')) return 'groceries';
  if (s.includes('transport') || s.includes('travel') || s.includes('fuel') || s.includes('moto') || s.includes('cab')) return 'transport';
  if (s.includes('utilit') || s.includes('electric') || s.includes('water') || s.includes('power') || s.includes('wasac') || s.includes('reg')) return 'utilities';
  if (s.includes('airtime') || s.includes('data') || s.includes('bundle')) return 'airtime';
  if (s.includes('housing') || s.includes('mortgage')) return 'housing';
  if (s.includes('rent') || s.includes('house') || s.includes('apartment')) return 'rent';
  if (s.includes('personal care') || s.includes('personal_care') || s.includes('grooming') || s.includes('salon') || s.includes('barber') || s.includes('beauty')) return 'personal_care';
  if (s.includes('health') || s.includes('medical') || s.includes('pharmacy') || s.includes('hospital')) return 'health';
  if (s.includes('tech') || s.includes('software') || s.includes('gadget') || s.includes('electronics')) return 'technology';
  if (s.includes('debt') || s.includes('loan') || s.includes('credit card') || s.includes('repayment')) return 'debt';
  if (s.includes('gift') || s.includes('donat') || s.includes('charity')) return 'gifts';
  if (s.includes('freelance') || s.includes('side hustle') || s.includes('gig') || s.includes('consult')) return 'freelance';
  if (s.includes('shopping') || s.includes('clothes') || s.includes('clothing') || s.includes('fashion')) return 'shopping';
  if (s.includes('salary') || s.includes('wage') || s.includes('payroll') || s.includes('income')) return 'salary';
  if (s.includes('family') || s.includes('transfer') || s.includes('send') || s.includes('from ') || s.includes('to ')) return 'family';
  if (s.includes('entertainment') || s.includes('fun') || s.includes('leisure') || s.includes('canal') || s.includes('movie')) return 'fun';
  if (s.includes('saving') || s.includes('invest')) return 'savings';
  if (s.includes('education') || s.includes('school') || s.includes('tuition') || s.includes('uni')) return 'education';
  // Deliberately matches only 'misc', never a bare 'other' — "Other Income"
  // must keep resolving to salary.
  if (s.includes('misc')) return 'misc';
  return 'shopping';
}

export function accountTint(name: string): string {
  const n = (name ?? '').toLowerCase();
  if (n.includes('mokash')) return '#2DD4BF';
  if (n.includes('mtn') || n.includes('momo')) return '#FFCC00';
  if (n.includes('bank of kigali') || n.includes(' bk')) return '#1E73BE';
  if (n.includes('cash') || n.includes('wallet')) return '#22C55E';
  if (n.includes('equity')) return '#E2231A';
  if (n.includes('airtel')) return '#E40000';
  return '#22C55E';
}

// Built-in subcategories per CategoryId (from the mobile app's data.json —
// keep apps/web/src/lib/subcategories.json in lockstep). Custom ones come
// from the `subcategories` table and are merged by the caller.
import subcatData from './subcategories.json';

export function builtinSubcats(cat: CategoryId): {name: string; icon: string}[] {
  const out: {name: string; icon: string}[] = [];
  for (const c of (subcatData as any).categories as any[]) {
    if (resolveCat(c.name) !== cat) continue;
    for (const s of c.subcategories ?? []) {
      if (!out.some(x => x.name === s.name)) out.push({name: s.name, icon: s.icon});
    }
  }
  return out;
}

export function fmtAmount(n: number): string {
  return Math.abs(Math.round(n ?? 0)).toLocaleString('en-US');
}

export function fmtMoney(n: number, currency = 'RWF'): string {
  return `${currency} ${fmtAmount(n)}`;
}
