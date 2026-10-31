// SINGLE SOURCE OF TRUTH for the category taxonomy, shared by the React Native app
// (src/theme.ts) and the Next web app (apps/web/src/lib/theme.ts).
//
// WHY THIS FILE EXISTS: these two apps kept their own copies of CategoryId, the label
// table and resolveCat, and the copies drifted. Three separate bugs came from that on
// 2026-07-30 alone (web had no 'housing' branch; six categories collapsed into Shopping;
// ~423,000 RWF filed under the wrong headings in one month). Add a category here and
// both apps get it.
//
// TAXONOMY v2 (2026-10-31). Every category belongs to exactly ONE kind — expense,
// income, transfer or loan — because v1 had no direction at all: income could be filed
// as Groceries, transfers carried Salary/Shopping/Transport, and "Family & Transfers"
// mixed sending money to a relative with moving money between your own accounts. The
// shape follows the established taxonomies (Plaid PFC, Monarch, Lunch Money): direction
// lives at the top level, so a subcategory can only ever be valid for one direction.
// Categories are by INTENT, never by payment rail ("paid via MoMoPay" is the channel
// field's job). Buckets are tuned to Rwandan households (FinScope 2024: food, airtime &
// data, medical, school fees, utilities; savings groups/SACCOs; MoKash).
//
// Subcategories live here too (they used to be matched to categories BY NAME through
// resolveCat from a separate data.json, which is how Shopping came to hold "Charity"
// and "Personal Loans").
//
// Deliberately platform-free: no React, no react-native, no next/*.

export type CategoryKind = 'expense' | 'income' | 'transfer' | 'loan';

export type CategoryId =
  // expense
  | 'groceries' | 'eating_out' | 'transport' | 'housing' | 'utilities' | 'airtime'
  | 'health' | 'education' | 'family' | 'giving' | 'shopping' | 'personal_care'
  | 'fun' | 'government' | 'other_spending'
  // income
  | 'salary' | 'business' | 'family_in' | 'refunds' | 'interest' | 'other_income'
  // transfer — your own money moving; excluded from spending and income totals
  | 'own_transfer' | 'to_savings' | 'from_savings' | 'cash_withdrawal'
  // loan — borrowed money is neither income nor spending
  | 'loan_received' | 'loan_repayment' | 'lent_out' | 'repaid_to_me';

export interface SubcategoryMeta {
  name: string;
  emoji: string;
}

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  /** Shared because a category should be the same colour in both apps. */
  color: string;
  kind: CategoryKind;
  /** One line, read by the classifier AND shown as a hint in pickers. */
  description: string;
  subcategories: SubcategoryMeta[];
}

const sub = (name: string, emoji: string): SubcategoryMeta => ({name, emoji});

export const CATEGORY_META: Record<CategoryId, CategoryMeta> = {
  // ── Spending ────────────────────────────────────────────────────
  groceries: {
    id: 'groceries', label: 'Groceries & Household', color: '#22C55E', kind: 'expense',
    description: 'Food and supplies bought to use at home — supermarkets, markets, shops.',
    subcategories: [sub('Staples', '🌾'), sub('Produce', '🥬'), sub('Meat & fish', '🍖'), sub('Drinks', '🥤'), sub('Household supplies', '🧴')],
  },
  eating_out: {
    id: 'eating_out', label: 'Eating Out', color: '#F59E0B', kind: 'expense',
    description: 'Food and drinks prepared for you — restaurants, cafés, takeaway, bars.',
    subcategories: [sub('Restaurants', '🍽️'), sub('Coffee & snacks', '☕'), sub('Takeaway & delivery', '🥡'), sub('Bars', '🍺')],
  },
  transport: {
    id: 'transport', label: 'Transport', color: '#60A5FA', kind: 'expense',
    description: 'Getting around — moto, bus, taxi, fuel, parking, vehicle upkeep.',
    subcategories: [sub('Moto', '🏍️'), sub('Bus (Tap&Go)', '🚌'), sub('Taxi & cab', '🚕'), sub('Fuel', '⛽'), sub('Parking', '🅿️'), sub('Vehicle upkeep', '🔧')],
  },
  housing: {
    id: 'housing', label: 'Housing', color: '#C084FC', kind: 'expense',
    description: 'Where you live — rent, repairs, furniture, domestic help, security.',
    subcategories: [sub('Rent', '🔑'), sub('Repairs', '🛠️'), sub('Furniture & appliances', '🛋️'), sub('Domestic help', '🧹'), sub('Security', '🛡️')],
  },
  utilities: {
    id: 'utilities', label: 'Bills & Utilities', color: '#FBBF24', kind: 'expense',
    // Eval 2026-10-31: "Internet" here pulled MTN "Bundles and Packs" (phone data)
    // into utilities, and City of Kigali sanitation fees went to Government.
    description: 'Household bills — electricity (Cash Power), water (WASAC), home internet, TV, and city sanitation/waste fees (e.g. City of Kigali). Phone data bundles are NOT here — they are Airtime & Data.',
    subcategories: [sub('Electricity', '⚡'), sub('Water', '💧'), sub('Home internet', '🌐'), sub('TV subscription', '📺'), sub('Waste & sanitation', '🗑️')],
  },
  airtime: {
    id: 'airtime', label: 'Airtime & Data', color: '#A78BFA', kind: 'expense',
    description: 'Phone credit and mobile data bundles ("Bundles and Packs") for yourself.',
    subcategories: [sub('Airtime', '📞'), sub('Data bundles', '📶')],
  },
  health: {
    id: 'health', label: 'Health', color: '#FB7185', kind: 'expense',
    description: 'Medical costs — pharmacy, clinic, hospital, Mutuelle or insurance, fitness.',
    subcategories: [sub('Pharmacy', '💊'), sub('Clinic & hospital', '🏥'), sub('Mutuelle & insurance', '🩺'), sub('Fitness', '🏋️')],
  },
  education: {
    id: 'education', label: 'Education', color: '#818CF8', kind: 'expense',
    description: 'School fees, books and supplies, courses.',
    subcategories: [sub('School fees', '🏫'), sub('Books & supplies', '📚'), sub('Courses', '🧑‍💻')],
  },
  family: {
    id: 'family', label: 'Family Support', color: '#38BDF8', kind: 'expense',
    description: 'Money you give to relatives or for children. NOT moving money between your own accounts.',
    subcategories: [sub('Parents & relatives', '👵'), sub('Children', '🧒'), sub('Money sent home', '🏡')],
  },
  giving: {
    id: 'giving', label: 'Giving', color: '#FDA4AF', kind: 'expense',
    description: 'Church tithes and offerings, contributions to weddings and funerals, gifts, charity.',
    subcategories: [sub('Church', '🙏'), sub('Ceremonies', '💒'), sub('Gifts', '🎁'), sub('Charity', '🤲')],
  },
  shopping: {
    id: 'shopping', label: 'Shopping', color: '#34D399', kind: 'expense',
    description: 'Goods that are not groceries — clothes, shoes, electronics, other items.',
    subcategories: [sub('Clothes & shoes', '👕'), sub('Electronics', '💻'), sub('Other goods', '📦')],
  },
  personal_care: {
    id: 'personal_care', label: 'Personal Care', color: '#F0ABFC', kind: 'expense',
    description: 'Hair, beauty and toiletries.',
    subcategories: [sub('Hair & beauty', '💇'), sub('Toiletries', '🧼')],
  },
  fun: {
    id: 'fun', label: 'Entertainment', color: '#FB923C', kind: 'expense',
    description: 'Streaming, events and outings, betting and lottery, hobbies.',
    subcategories: [sub('Streaming', '📺'), sub('Events & outings', '🎟️'), sub('Betting & lottery', '🎲'), sub('Hobbies', '🎨')],
  },
  government: {
    id: 'government', label: 'Government & Fees', color: '#94A3B8', kind: 'expense',
    description: 'Irembo services, taxes (RRA), and standalone bank or MoMo charges. NOT city sanitation fees — those are Bills & Utilities.',
    subcategories: [sub('Irembo services', '🏛️'), sub('Taxes', '🧾'), sub('Bank & MoMo charges', '💳')],
  },
  other_spending: {
    id: 'other_spending', label: 'Other Spending', color: '#64748B', kind: 'expense',
    description: 'Money out that fits nothing above. Use rarely.',
    subcategories: [],
  },

  // ── Income ──────────────────────────────────────────────────────
  salary: {
    id: 'salary', label: 'Salary & Wages', color: '#16A34A', kind: 'income',
    description: 'Pay from an employer.',
    subcategories: [],
  },
  business: {
    id: 'business', label: 'Business & Freelance', color: '#4ADE80', kind: 'income',
    description: 'Money earned from your own work or business — sales, freelance, rent you collect.',
    subcategories: [sub('Sales', '🛒'), sub('Freelance', '🧑‍💻'), sub('Rental income', '🏠')],
  },
  family_in: {
    id: 'family_in', label: 'Money from Family', color: '#38BDF8', kind: 'income',
    description: 'Money relatives or friends send you as support or a gift (not a loan).',
    subcategories: [],
  },
  refunds: {
    id: 'refunds', label: 'Refunds & Reversals', color: '#2DD4BF', kind: 'income',
    description: 'Money given back to you — refunds, reversed or failed payments.',
    subcategories: [],
  },
  interest: {
    id: 'interest', label: 'Interest & Returns', color: '#10B981', kind: 'income',
    description: 'Interest on savings, dividends, investment returns.',
    subcategories: [],
  },
  other_income: {
    id: 'other_income', label: 'Other Income', color: '#84CC16', kind: 'income',
    description: 'Money in that fits nothing above. Use rarely.',
    subcategories: [],
  },

  // ── Transfers (own money; not spending, not income) ───────────────
  own_transfer: {
    id: 'own_transfer', label: 'Between My Accounts', color: '#94A3B8', kind: 'transfer',
    description: 'Moving your own money between your own accounts. Never a payment to another person.',
    subcategories: [],
  },
  to_savings: {
    id: 'to_savings', label: 'To Savings', color: '#2DD4BF', kind: 'transfer',
    description: 'Putting money aside — MoKash, Ejo Heza, savings groups (ibimina), SACCO, investments.',
    subcategories: [sub('MoKash', '🐷'), sub('Ejo Heza', '🏦'), sub('Savings group', '🤝'), sub('SACCO', '🏛️'), sub('Investments', '📈')],
  },
  from_savings: {
    id: 'from_savings', label: 'From Savings', color: '#2DD4BF', kind: 'transfer',
    description: 'Taking money back out of your savings.',
    subcategories: [sub('MoKash', '🐷'), sub('Savings group', '🤝'), sub('SACCO', '🏛️'), sub('Investments', '📈')],
  },
  cash_withdrawal: {
    id: 'cash_withdrawal', label: 'Cash Withdrawal', color: '#94A3B8', kind: 'transfer',
    description: 'Turning your balance into cash — an agent or ATM withdrawal.',
    subcategories: [],
  },

  // ── Loans (borrowed money; not income, not spending) ──────────────
  loan_received: {
    id: 'loan_received', label: 'Loan Received', color: '#EF4444', kind: 'loan',
    description: 'Money you borrowed arriving — MoKash, bank or a person.',
    subcategories: [sub('MoKash loan', '📱'), sub('Bank loan', '🏦'), sub('From a person', '🤝')],
  },
  loan_repayment: {
    id: 'loan_repayment', label: 'Loan Repayment', color: '#EF4444', kind: 'loan',
    description: 'Paying back money you borrowed.',
    subcategories: [sub('MoKash loan', '📱'), sub('Bank loan', '🏦'), sub('To a person', '🤝')],
  },
  lent_out: {
    id: 'lent_out', label: 'Lent to Someone', color: '#F97316', kind: 'loan',
    description: 'Money you lent and expect back.',
    subcategories: [],
  },
  repaid_to_me: {
    id: 'repaid_to_me', label: 'Repaid to Me', color: '#F97316', kind: 'loan',
    description: 'Someone paying back money you lent them.',
    subcategories: [],
  },
};

export const CATEGORY_IDS = Object.keys(CATEGORY_META) as CategoryId[];

// ── Direction ──────────────────────────────────────────────────────

export type TxType = 'expense' | 'income' | 'transfer';

/**
 * The stored transaction_type for a category. Loans are stored as transfers: they
 * move a balance but are neither income nor spending, and the transfer type already
 * keeps them out of both totals. Balance replay is unchanged — a transfer's in/out
 * comes from transfer_direction, exactly as an income/expense of the same sign.
 */
export function typeForCategory(id: CategoryId): TxType {
  const k = CATEGORY_META[id].kind;
  return k === 'loan' || k === 'transfer' ? 'transfer' : k;
}

/** Which categories may be filed with a stored transaction_type. */
export function validForType(id: CategoryId, type: string | null | undefined): boolean {
  return typeForCategory(id) === (type === 'income' || type === 'transfer' ? type : 'expense');
}

/**
 * Categories a transaction moving money in this DIRECTION may take. This is the menu
 * the classifier and the pickers offer — "there is no income called Groceries".
 */
export function categoriesForDirection(direction: 'in' | 'out'): CategoryId[] {
  // Both savings categories in BOTH directions: when the savings pocket is itself
  // a tracked account (MoKash), a deposit arrives there as an INBOUND leg and is
  // still To Savings. Into-vs-out-of savings is stated by the SMS, not the leg.
  const out: CategoryId[] = ['own_transfer', 'to_savings', 'from_savings', 'cash_withdrawal', 'loan_repayment', 'lent_out'];
  const inn: CategoryId[] = ['own_transfer', 'to_savings', 'from_savings', 'loan_received', 'repaid_to_me'];
  return CATEGORY_IDS.filter(id => {
    const k = CATEGORY_META[id].kind;
    if (direction === 'out') {
      return k === 'expense' || out.includes(id);
    }
    return k === 'income' || inn.includes(id);
  });
}

export function categoriesForType(type: string | null | undefined): CategoryId[] {
  return CATEGORY_IDS.filter(id => validForType(id, type));
}

export function subcategoriesOf(id: CategoryId): SubcategoryMeta[] {
  return CATEGORY_META[id]?.subcategories ?? [];
}

// ── Reading stored values ──────────────────────────────────────────

/**
 * Old (v1) ids and labels. Rows written before v2 store these; they keep resolving
 * until the one-time migration (supabase_migration_v23.sql) rewrites them, and
 * forever after for anything that slipped through.
 */
const LEGACY_IDS: Record<string, CategoryId> = {
  food: 'eating_out',
  rent: 'housing',
  savings: 'to_savings',
  technology: 'shopping',
  debt: 'loan_repayment',
  gifts: 'giving',
  misc: 'other_spending',
  freelance: 'business',
  transfer: 'own_transfer', // merchant_rules used 'transfer' for "this counterparty is a transfer"
};

/**
 * Keyword rules, IN ORDER — earlier wins. Data rather than code so that the one-time
 * SQL migration is GENERATED from the same table (scripts/gen-category-migration.mjs)
 * and cannot disagree with the app. Each entry: substrings of the lowercased value.
 *
 * Order notes:
 *  - savings / loan / transfer wording before the spending words they contain.
 *  - 'from family' before 'family'; 'other income' before generic income words.
 *  - no bare 'reg' (v1 had one: "Regular Family Transfer" resolved to Utilities).
 */
export const CATEGORY_KEYWORDS: [CategoryId, string[]][] = [
  // NOT 'family & transfers': that v1 label meant money sent to family on an expense
  // row. The 'family' keyword below catches it, and direction does the rest.
  ['own_transfer', ['between my accounts', 'own account', 'own transfer']],
  ['from_savings', ['from savings']],
  ['to_savings', ['to savings', 'saving', 'mokash', 'ejo heza', 'ibimina', 'sacco', 'invest']],
  ['cash_withdrawal', ['cash withdrawal', 'withdraw', 'cash out']],
  ['loan_received', ['loan received', 'disbursement']],
  ['repaid_to_me', ['repaid to me']],
  ['lent_out', ['lent']],
  ['housing', ['housing', 'mortgage']],
  ['loan_repayment', ['loan', 'debt', 'credit card', 'repayment']],
  ['refunds', ['refund', 'reversal']],
  ['interest', ['interest', 'dividend', 'returns']],
  ['family_in', ['money from family', 'from family']],
  ['salary', ['salary', 'wage', 'payroll']],
  ['business', ['business', 'freelance', 'side hustle', 'gig', 'consult', 'sales', 'rental income']],
  ['other_income', ['other income', 'income']],
  ['eating_out', ['eating out', 'food', 'dining', 'restaurant', 'cafe', 'coffee', 'snack', 'takeaway', 'takeout']],
  ['groceries', ['grocer', 'supermarket', 'market', 'household', 'produce', 'staples']],
  ['transport', ['transport', 'travel', 'fuel', 'moto', 'cab', 'taxi', 'bus', 'parking', 'vehicle']],
  ['utilities', ['bills', 'utilit', 'electric', 'water', 'power', 'wasac', 'internet', 'trash', 'waste']],
  ['airtime', ['airtime', 'data', 'bundle']],
  ['housing', ['rent', 'house', 'apartment', 'repairs', 'furniture']],
  ['personal_care', ['personal care', 'personal_care', 'grooming', 'salon', 'barber', 'beauty', 'toiletr']],
  ['health', ['health', 'medical', 'pharmacy', 'hospital', 'clinic', 'mutuelle', 'doctor', 'dental']],
  ['shopping', ['tech', 'software', 'gadget', 'electronics', 'device', 'cloud']],
  ['giving', ['giving', 'gift', 'donat', 'charity', 'church', 'tithe', 'ceremon', 'wedding', 'funeral']],
  ['government', ['government', 'irembo', 'tax', 'fees', 'charges']],
  ['shopping', ['shopping', 'clothes', 'clothing', 'fashion', 'shoe']],
  ['family', ['family', 'relative', 'parent', 'children', 'support', 'sent home']],
  ['own_transfer', ['transfer']],
  ['fun', ['entertainment', 'fun', 'leisure', 'canal', 'movie', 'streaming', 'betting', 'lottery', 'hobb', 'concert', 'game']],
  ['education', ['education', 'school', 'tuition', 'course', 'book']],
  ['other_spending', ['misc', 'other spending', 'other']],
];

const LABEL_TO_ID: Record<string, CategoryId> = Object.fromEntries(
  CATEGORY_IDS.map(id => [CATEGORY_META[id].label.toLowerCase(), id]),
);

/** The category a stored value names, ignoring direction; null when unrecognisable. */
export function matchCategory(raw: string | null | undefined): CategoryId | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) {
    return null;
  }
  if ((CATEGORY_META as Record<string, CategoryMeta>)[s]) {
    return s as CategoryId;
  }
  if (LEGACY_IDS[s]) {
    return LEGACY_IDS[s];
  }
  if (LABEL_TO_ID[s]) {
    return LABEL_TO_ID[s];
  }
  for (const [id, words] of CATEGORY_KEYWORDS) {
    if (words.some(w => s.includes(w))) {
      return id;
    }
  }
  return null;
}

/**
 * The same IDEA in the other direction — used when a category and the money's
 * direction disagree. Sending your mother money is Family Support; her sending you
 * money is Money from Family. Anything with no counterpart falls to that type's
 * catch-all, which is a visible "Other", never a silent wrong guess.
 */
export function coerceForType(
  id: CategoryId,
  type: string | null | undefined,
  transferDirection?: string | null,
): CategoryId {
  if (validForType(id, type)) {
    // A transfer's category must also match its direction.
    if (type === 'transfer') {
      const inbound = transferDirection === 'in';
      // NOT flipped: to/from savings is a fact about the money (into the pocket
      // or out of it), true on both legs. Flipping by leg turned every MoKash
      // deposit — inbound on the tracked MoKash account — into "From Savings".
      if (id === 'loan_received' && !inbound) return 'loan_repayment';
      if (id === 'loan_repayment' && inbound) return 'loan_received';
      if (id === 'lent_out' && inbound) return 'repaid_to_me';
      if (id === 'repaid_to_me' && !inbound) return 'lent_out';
      if (id === 'cash_withdrawal' && inbound) return 'own_transfer';
    }
    return id;
  }
  if (type === 'income') {
    if (id === 'family') return 'family_in';
    if (id === 'to_savings' || id === 'from_savings') return 'interest';
    return 'other_income';
  }
  if (type === 'transfer') {
    // Spending or income wording on a transfer: it is still your own money moving.
    return 'own_transfer';
  }
  // expense
  if (id === 'family_in') return 'family';
  return 'other_spending';
}

/**
 * Map any stored category string onto a canonical CategoryId.
 *
 * Stored values are a mix of v2 ids, v2 labels, v1 ids/labels and legacy free text.
 * Pass the transaction's type (and transfer_direction) wherever it is known: the
 * answer must be valid for that direction — "there is no income called Groceries".
 * Without a type, an unrecognisable value is Other Spending (v1 silently said
 * Shopping).
 */
export function resolveCat(
  raw: string | null | undefined,
  type?: string | null,
  transferDirection?: string | null,
): CategoryId {
  const found = matchCategory(raw);
  if (!type) {
    return found ?? 'other_spending';
  }
  const fallback: CategoryId =
    type === 'income' ? 'other_income' : type === 'transfer' ? 'own_transfer' : 'other_spending';
  return coerceForType(found ?? fallback, type, transferDirection);
}
