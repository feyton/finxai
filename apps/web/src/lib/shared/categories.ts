// SINGLE SOURCE OF TRUTH for the category taxonomy, shared by the React Native app
// (src/theme.ts) and the Next web app (apps/web/src/lib/theme.ts).
//
// WHY THIS FILE EXISTS: these two apps kept their own copies of CategoryId, the label
// table and resolveCat, and the copies drifted. Three separate bugs came from that on
// 2026-07-30 alone:
//
//   - web resolveCat had no 'housing' branch, so "Housing" fell through the default and
//     was reported as Rent
//   - web was missing personal_care / technology / debt / gifts / misc / freelance
//     entirely, so all six collapsed into Shopping
//   - together those filed roughly 423,000 RWF under the wrong headings in one month,
//     silently, while the mobile app showed the right answer
//
// resolveCat is ORDER-DEPENDENT (see the comments inline), which is exactly the kind of
// logic that cannot survive being copied. Add a category here and both apps get it.
//
// Deliberately platform-free: no React, no react-native, no next/*, no colour tokens
// beyond plain hex. Each app maps these ids onto its own presentation — mobile to
// lucide icon names, web to emoji — because that part genuinely differs and cannot be
// shared.

export type CategoryId =
  | 'food' | 'groceries' | 'transport' | 'utilities' | 'airtime' | 'rent'
  | 'health' | 'shopping' | 'salary' | 'family' | 'fun' | 'savings' | 'education'
  | 'personal_care' | 'housing' | 'technology' | 'debt' | 'gifts' | 'misc'
  | 'freelance';

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  /** Shared because a category should be the same colour in both apps. */
  color: string;
}

export const CATEGORY_META: Record<CategoryId, CategoryMeta> = {
  food:          {id: 'food',          label: 'Food & Dining',         color: '#F59E0B'},
  groceries:     {id: 'groceries',     label: 'Groceries',             color: '#22C55E'},
  transport:     {id: 'transport',     label: 'Transport',             color: '#60A5FA'},
  utilities:     {id: 'utilities',     label: 'Utilities',             color: '#FBBF24'},
  airtime:       {id: 'airtime',       label: 'Airtime & Data',        color: '#A78BFA'},
  rent:          {id: 'rent',          label: 'Rent',                  color: '#F472B6'},
  health:        {id: 'health',        label: 'Health',                color: '#FB7185'},
  shopping:      {id: 'shopping',      label: 'Shopping',              color: '#34D399'},
  salary:        {id: 'salary',        label: 'Salary',                color: '#22C55E'},
  family:        {id: 'family',        label: 'Family & Transfers',    color: '#38BDF8'},
  fun:           {id: 'fun',           label: 'Entertainment',         color: '#FB923C'},
  savings:       {id: 'savings',       label: 'Savings',               color: '#2DD4BF'},
  education:     {id: 'education',     label: 'Education',             color: '#818CF8'},
  personal_care: {id: 'personal_care', label: 'Personal Care',         color: '#F0ABFC'},
  housing:       {id: 'housing',       label: 'Housing',               color: '#C084FC'},
  technology:    {id: 'technology',    label: 'Technology',            color: '#22D3EE'},
  debt:          {id: 'debt',          label: 'Debt Payments',         color: '#EF4444'},
  gifts:         {id: 'gifts',         label: 'Gifts & Donations',     color: '#FDA4AF'},
  misc:          {id: 'misc',          label: 'Miscellaneous',         color: '#94A3B8'},
  freelance:     {id: 'freelance',     label: 'Freelance/Side Hustle', color: '#4ADE80'},
};

export const CATEGORY_IDS = Object.keys(CATEGORY_META) as CategoryId[];

/**
 * Map any stored category string onto a canonical CategoryId.
 *
 * Stored values are a mix of canonical ids ('rent'), display labels ('Personal Care')
 * and legacy free text, so this has to be tolerant.
 *
 * ORDER MATTERS — earlier branches win. The narrower checks sit ahead of the broader
 * ones they would otherwise be swallowed by, and each such case is commented. Do not
 * reorder without reading those comments.
 */
export function resolveCat(raw: string): CategoryId {
  const s = (raw ?? '').toLowerCase();
  if (s.includes('food') || s.includes('dining') || s.includes('restaurant') || s.includes('cafe')) return 'food';
  if (s.includes('grocer') || s.includes('supermarket') || s.includes('market')) return 'groceries';
  if (s.includes('transport') || s.includes('travel') || s.includes('fuel') || s.includes('moto') || s.includes('cab')) return 'transport';
  if (s.includes('utilit') || s.includes('electric') || s.includes('water') || s.includes('power') || s.includes('wasac') || s.includes('reg')) return 'utilities';
  if (s.includes('airtime') || s.includes('data') || s.includes('bundle')) return 'airtime';
  // Before 'rent': "Housing" does NOT contain "house", so without this it falls all
  // the way through to the default. This branch missing from the web copy is what
  // reported Housing as Rent.
  if (s.includes('housing') || s.includes('mortgage')) return 'housing';
  if (s.includes('rent') || s.includes('house') || s.includes('apartment')) return 'rent';
  // Before 'health': "Personal Care" shares no token with health, but keep it early so
  // 'beauty'/'salon' can never be claimed by a later broad branch.
  if (s.includes('personal care') || s.includes('personal_care') || s.includes('grooming') || s.includes('salon') || s.includes('barber') || s.includes('beauty')) return 'personal_care';
  if (s.includes('health') || s.includes('medical') || s.includes('pharmacy') || s.includes('hospital')) return 'health';
  if (s.includes('tech') || s.includes('software') || s.includes('gadget') || s.includes('electronics')) return 'technology';
  if (s.includes('debt') || s.includes('loan') || s.includes('credit card') || s.includes('repayment')) return 'debt';
  if (s.includes('gift') || s.includes('donat') || s.includes('charity')) return 'gifts';
  // Before 'salary': "Freelance/Side Hustle" shares no token with salary today, but this
  // keeps side-income out of the salary bucket if either list gains a wording like
  // "freelance income".
  if (s.includes('freelance') || s.includes('side hustle') || s.includes('gig') || s.includes('consult')) return 'freelance';
  if (s.includes('shopping') || s.includes('clothes') || s.includes('clothing') || s.includes('fashion')) return 'shopping';
  if (s.includes('salary') || s.includes('wage') || s.includes('payroll') || s.includes('income')) return 'salary';
  if (s.includes('family') || s.includes('transfer') || s.includes('send') || s.includes('from ') || s.includes('to ')) return 'family';
  if (s.includes('entertainment') || s.includes('fun') || s.includes('leisure') || s.includes('canal') || s.includes('movie')) return 'fun';
  if (s.includes('saving') || s.includes('invest')) return 'savings';
  if (s.includes('education') || s.includes('school') || s.includes('tuition') || s.includes('uni')) return 'education';
  // Deliberately matches only 'misc', never a bare 'other' — "Other Income" must keep
  // resolving to salary.
  if (s.includes('misc')) return 'misc';
  return 'shopping';
}
