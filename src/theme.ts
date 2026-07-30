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
export {resolveCat, CATEGORY_IDS} from '../shared/categories';

import {
  CATEGORY_META,
  type CategoryId as SharedCategoryId,
} from '../shared/categories';

// Lucide icon per category. This is the ONE part that cannot be shared: the web app
// renders emoji instead, and these names must exist in Components/ui/Icon's whitelist
// (it returns null for anything unregistered).
const CAT_ICON: Record<SharedCategoryId, string> = {
  food: 'UtensilsCrossed',
  groceries: 'ShoppingCart',
  transport: 'Car',
  utilities: 'Zap',
  airtime: 'Phone',
  rent: 'Home',
  health: 'Heart',
  shopping: 'ShoppingBag',
  salary: 'Coins',
  family: 'Users',
  fun: 'Flame',
  savings: 'Target',
  education: 'Star',
  personal_care: 'Scissors',
  housing: 'Building2',
  technology: 'Laptop',
  debt: 'CreditCard',
  gifts: 'Gift',
  misc: 'Tag',
  freelance: 'Handshake',
};

// Built from the shared metadata, so adding a category in one place reaches both apps.
// Typed exactly as before so every consumer is unaffected.
export const CATS: Record<
  SharedCategoryId,
  {id: SharedCategoryId; label: string; icon: string; color: string}
> = Object.fromEntries(
  (Object.keys(CATEGORY_META) as SharedCategoryId[]).map(id => [
    id,
    {...CATEGORY_META[id], icon: CAT_ICON[id]},
  ]),
) as Record<SharedCategoryId, {id: SharedCategoryId; label: string; icon: string; color: string}>;


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
