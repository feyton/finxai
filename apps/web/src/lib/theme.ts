// Ported from the mobile app's src/theme.ts (pure logic, no RN).
// Kept in sync manually for now; will move to packages/core in a later phase.

// Web admin palette — dark-first, blue accent (mirrors globals.css @theme).
export const T = {
  bg: '#0B0E14',
  surface: '#10141C',
  surface2: '#151B26',
  surface3: '#1B2330',
  border: 'rgba(148,163,184,0.10)',
  border2: 'rgba(148,163,184,0.20)',
  text: '#E2E8F0',
  text2: '#94A3B8',
  text3: '#5B6B7F',
  accent: '#3B82F6',
  accent600: '#2563EB',
  accentSoft: 'rgba(59,130,246,0.13)',
  income: '#34D399',
  expense: '#FB7185',
  warn: '#FBBF24',
  info: '#60A5FA',
  // validated chart pair (dark surface) — money in / money out
  chartIn: '#3B82F6',
  chartOut: '#F43F5E',
};

export type CategoryId =
  | 'food' | 'groceries' | 'transport' | 'utilities' | 'airtime' | 'rent'
  | 'health' | 'shopping' | 'salary' | 'family' | 'fun' | 'savings' | 'education';

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
};

// Maps legacy category strings from existing data to a CategoryId.
export function resolveCat(raw: string): CategoryId {
  const s = (raw ?? '').toLowerCase();
  if (s.includes('food') || s.includes('dining') || s.includes('restaurant') || s.includes('cafe')) return 'food';
  if (s.includes('grocer') || s.includes('supermarket') || s.includes('market')) return 'groceries';
  if (s.includes('transport') || s.includes('travel') || s.includes('fuel') || s.includes('moto') || s.includes('cab')) return 'transport';
  if (s.includes('utilit') || s.includes('electric') || s.includes('water') || s.includes('power') || s.includes('wasac') || s.includes('reg')) return 'utilities';
  if (s.includes('airtime') || s.includes('data') || s.includes('bundle')) return 'airtime';
  if (s.includes('rent') || s.includes('house') || s.includes('apartment')) return 'rent';
  if (s.includes('health') || s.includes('medical') || s.includes('pharmacy') || s.includes('hospital')) return 'health';
  if (s.includes('shopping') || s.includes('clothes') || s.includes('clothing') || s.includes('fashion')) return 'shopping';
  if (s.includes('salary') || s.includes('wage') || s.includes('payroll') || s.includes('income')) return 'salary';
  if (s.includes('family') || s.includes('transfer') || s.includes('send') || s.includes('from ') || s.includes('to ')) return 'family';
  if (s.includes('entertainment') || s.includes('fun') || s.includes('leisure') || s.includes('canal') || s.includes('movie')) return 'fun';
  if (s.includes('saving') || s.includes('invest')) return 'savings';
  if (s.includes('education') || s.includes('school') || s.includes('tuition') || s.includes('uni')) return 'education';
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
