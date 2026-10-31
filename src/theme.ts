export const T = {
  bg: '#0A0D10',
  surface: '#13171B',
  surface2: '#1A1F24',
  surface3: '#232A30',
  border: 'rgba(255,255,255,0.07)',
  border2: 'rgba(255,255,255,0.12)',
  text: '#F2F4F5',
  text2: '#A6AEB6',
  text3: '#6B747C',
  accent: '#22C55E',
  accent600: '#16A34A',
  accentSoft: 'rgba(34,197,94,0.14)',
  accentInk: '#052E16',
  income: '#34D399',
  expense: '#FB7185',
  warn: '#FBBF24',
  info: '#60A5FA',
};

export const FONTS = {
  regular: 'Poppins-Regular',
  medium: 'Poppins-Medium',
  semibold: 'Poppins-SemiBold',
  bold: 'Poppins-Bold',
  extrabold: 'Poppins-ExtraBold',
};

export const R = {
  card: 16,
  large: 22,
  small: 10,
  pill: 99,
  iconBtn: 12,
};

// The taxonomy and resolveCat now live in ../shared/categories, shared with the web
// app. Re-exported here so the ~50 existing `from '../theme'` imports keep working.
export type {CategoryId} from '../shared/categories';
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
} from '../shared/categories';
export type {CategoryKind, TxType} from '../shared/categories';

import {
  CATEGORY_META,
  type CategoryMeta,
  type CategoryId as SharedCategoryId,
} from '../shared/categories';

// Lucide icon per category. This is the ONE part that cannot be shared: the web app
// renders emoji instead, and these names must exist in Components/ui/Icon's whitelist
// (it returns null for anything unregistered).
const CAT_ICON: Record<SharedCategoryId, string> = {
  // spending
  groceries: 'ShoppingCart',
  eating_out: 'UtensilsCrossed',
  transport: 'Car',
  housing: 'Home',
  utilities: 'Zap',
  airtime: 'Phone',
  health: 'Heart',
  education: 'Star',
  family: 'Users',
  giving: 'Gift',
  shopping: 'ShoppingBag',
  personal_care: 'Scissors',
  fun: 'Flame',
  government: 'Landmark',
  other_spending: 'Tag',
  // income
  salary: 'Coins',
  business: 'Handshake',
  family_in: 'Users',
  refunds: 'RefreshCcw',
  interest: 'TrendingUp',
  other_income: 'Plus',
  // transfers
  own_transfer: 'ArrowLeftRight',
  to_savings: 'Target',
  from_savings: 'Target',
  cash_withdrawal: 'Wallet',
  // loans
  loan_received: 'ArrowDownLeft',
  loan_repayment: 'CreditCard',
  lent_out: 'ArrowUpRight',
  repaid_to_me: 'ArrowDownLeft',
};

// Built from the shared metadata, so adding a category in one place reaches both apps.
// Carries kind/description/subcategories too (v2), so pickers can filter by direction.
export type CatInfo = CategoryMeta & {icon: string};
export const CATS: Record<SharedCategoryId, CatInfo> = Object.fromEntries(
  (Object.keys(CATEGORY_META) as SharedCategoryId[]).map(id => [
    id,
    {...CATEGORY_META[id], icon: CAT_ICON[id]},
  ]),
) as Record<SharedCategoryId, CatInfo>;


// Account brand helpers
export function accountTint(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('mokash')) return '#2DD4BF';
  if (n.includes('mtn') || n.includes('momo')) return '#FFCC00';
  if (n.includes('bank of kigali') || n.includes(' bk')) return '#1E73BE';
  if (n.includes('cash') || n.includes('wallet')) return '#22C55E';
  if (n.includes('equity')) return '#E2231A';
  if (n.includes('airtel')) return '#E40000';
  if (n.includes('bpr')) return '#F97316';
  return '#22C55E';
}

export function accountIcon(name: string, type: string): string {
  const n = name.toLowerCase();
  if (n.includes('mokash') || type === 'Savings') return 'Target';
  if (n.includes('cash') || n.includes('wallet')) return 'Coins';
  if (n.includes('momo') || n.includes('airtel') || type === 'Mobile Money') return 'Phone';
  return 'Landmark';
}

export function fmtAmount(n: number): string {
  return Math.abs(Math.round(n)).toLocaleString('en-US');
}

/**
 * A BALANCE, sign kept. fmtAmount drops the sign on purpose — callers put their
 * own +/− on a movement — but a balance has no caller-supplied sign, so through
 * fmtAmount an overdrawn account read as money you have: a −256,015 MoKash
 * balance (an ad filed as an expense) showed as 256,015 and lifted the total.
 */
export function fmtBalance(n: number): string {
  const r = Math.round(n);
  return (r < 0 ? '−' : '') + fmtAmount(r);
}
