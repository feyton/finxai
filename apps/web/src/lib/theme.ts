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
// Taxonomy and resolveCat come from ../../../../shared/categories, the single source
// of truth shared with the React Native app. Re-exported so existing
// `from '@/lib/theme'` imports are unaffected.
//
// This file used to keep its own copies, and they drifted: resolveCat was missing the
// 'housing' branch (so "Housing" was captured by rent's `includes('house')` test) and
// CATS was missing six categories (so Personal Care, Technology, Debt, Gifts, Misc and
// Freelance all collapsed into Shopping). Roughly 423,000 RWF in one month was reported
// under the wrong headings while the phone showed the right answer. Sharing the module
// removes the failure mode rather than re-fixing it.
export type {CategoryId, CategoryKind, TxType} from './shared/categories';
export {
  resolveCat,
  CATEGORY_IDS,
  CATEGORY_META,
  categoriesForDirection,
  categoriesForType,
  coerceForType,
  matchCategory,
  subcategoriesOf,
  typeForCategory,
  validForType,
} from './shared/categories';

import {CATEGORY_META, subcategoriesOf, type CategoryId as Cat, type CategoryMeta} from './shared/categories';

// Emoji per category — the web's presentation choice. The mobile app maps the same ids
// onto lucide icon names instead, which is why only this part stays local.
const CAT_EMOJI: Record<Cat, string> = {
  // spending
  groceries: '🛒',
  eating_out: '🍽️',
  transport: '🚗',
  housing: '🏠',
  utilities: '⚡',
  airtime: '📱',
  health: '❤️',
  education: '🎓',
  family: '👨‍👩‍👧',
  giving: '🎁',
  shopping: '🛍️',
  personal_care: '💇',
  fun: '🎬',
  government: '🏛️',
  other_spending: '🏷️',
  // income
  salary: '💼',
  business: '🤝',
  family_in: '👨‍👩‍👧',
  refunds: '↩️',
  interest: '📈',
  other_income: '💰',
  // transfers
  own_transfer: '🔁',
  to_savings: '🐷',
  from_savings: '🐷',
  cash_withdrawal: '💵',
  // loans
  loan_received: '🏦',
  loan_repayment: '💳',
  lent_out: '🤝',
  repaid_to_me: '🤝',
};

export type CatInfo = CategoryMeta & {emoji: string};
export const CATS: Record<Cat, CatInfo> = Object.fromEntries(
  (Object.keys(CATEGORY_META) as Cat[]).map(id => [id, {...CATEGORY_META[id], emoji: CAT_EMOJI[id]}]),
) as Record<Cat, CatInfo>;

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

// Built-in subcategories now come straight from the shared taxonomy — each
// category owns its list (taxonomy v2). They used to be matched to categories BY
// NAME from a byte-copy of the phone's data.json, which is how Shopping came to
// hold "Charity" and "Personal Loans". Custom ones come from the `subcategories`
// table and are merged by the caller.
export function builtinSubcats(cat: Cat): {name: string; icon: string}[] {
  return subcategoriesOf(cat).map(sc => ({name: sc.name, icon: sc.emoji}));
}

export function fmtAmount(n: number): string {
  return Math.abs(Math.round(n ?? 0)).toLocaleString('en-US');
}

export function fmtMoney(n: number, currency = 'RWF'): string {
  return `${currency} ${fmtAmount(n)}`;
}
