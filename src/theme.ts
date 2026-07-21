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

export type CategoryId =
  | 'food' | 'groceries' | 'transport' | 'utilities' | 'airtime' | 'rent'
  | 'health' | 'shopping' | 'salary' | 'family' | 'fun' | 'savings' | 'education';

export const CATS: Record<CategoryId, {id: CategoryId; label: string; icon: string; color: string}> = {
  food:      {id: 'food',      label: 'Food & Dining',      icon: 'UtensilsCrossed', color: '#F59E0B'},
  groceries: {id: 'groceries', label: 'Groceries',          icon: 'ShoppingCart',    color: '#22C55E'},
  transport: {id: 'transport', label: 'Transport',          icon: 'Car',             color: '#60A5FA'},
  utilities: {id: 'utilities', label: 'Utilities',          icon: 'Zap',             color: '#FBBF24'},
  airtime:   {id: 'airtime',   label: 'Airtime & Data',     icon: 'Phone',           color: '#A78BFA'},
  rent:      {id: 'rent',      label: 'Rent',               icon: 'Home',            color: '#F472B6'},
  health:    {id: 'health',    label: 'Health',             icon: 'Heart',           color: '#FB7185'},
  shopping:  {id: 'shopping',  label: 'Shopping',           icon: 'ShoppingBag',     color: '#34D399'},
  salary:    {id: 'salary',    label: 'Salary',             icon: 'Coins',           color: '#22C55E'},
  family:    {id: 'family',    label: 'Family & Transfers', icon: 'Users',           color: '#38BDF8'},
  fun:       {id: 'fun',       label: 'Entertainment',      icon: 'Flame',           color: '#FB923C'},
  savings:   {id: 'savings',   label: 'Savings',            icon: 'Target',          color: '#2DD4BF'},
  education: {id: 'education', label: 'Education',          icon: 'Star',            color: '#818CF8'},
};

// Maps legacy category strings from existing data to the new CategoryId
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
