/**
 * AI action registry — the catalog of actions the Finance Coach can take.
 *
 * This is deliberately structured like an MCP tool server: each action has a
 * JSON-schema `input_schema`, a `kind` (read = safe/auto, write = needs user
 * confirmation), a `run` executor bound to PowerSync, and a `summary` used to
 * describe a pending write in the confirmation prompt. If we later host a real
 * remote MCP server, these definitions port over unchanged — only `run` moves
 * server-side.
 */

import {AbstractPowerSyncDatabase} from '@powersync/react-native';
import {CATS, CategoryId, fmtAmount, resolveCat} from '../theme';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface ActionContext {
  db: AbstractPowerSyncDatabase;
  userId: string;
}

export interface AiAction {
  name: string;
  description: string;
  kind: 'read' | 'write';
  input_schema: Record<string, any>;
  // Human-readable description of a pending write, shown in the confirm prompt.
  summary?: (input: any) => string;
  run: (ctx: ActionContext, input: any) => Promise<string>;
}

// ── Helpers ────────────────────────────────────────────────────
async function rows(ctx: ActionContext, sql: string, params: any[]) {
  const res = await ctx.db.execute(sql, params);
  return (res.rows?._array ?? []) as any[];
}

async function resolveAccount(ctx: ActionContext, nameOrId?: string) {
  const accounts = await rows(
    ctx,
    'SELECT id, name, type, available_balance FROM accounts WHERE owner_id = ?',
    [ctx.userId],
  );
  if (!accounts.length) {
    return null;
  }
  if (!nameOrId) {
    return accounts[0];
  }
  const q = nameOrId.toLowerCase();
  return (
    accounts.find(a => a.id === nameOrId) ||
    accounts.find(a => (a.name ?? '').toLowerCase() === q) ||
    accounts.find(a => (a.name ?? '').toLowerCase().includes(q)) ||
    accounts[0]
  );
}

function categoryLabel(raw: string): {id: CategoryId; label: string} {
  const id = resolveCat(raw) as CategoryId;
  return {id, label: CATS[id]?.label ?? raw};
}

// ── The registry ───────────────────────────────────────────────
export const AI_ACTIONS: AiAction[] = [
  {
    name: 'get_spending_by_category',
    description:
      'Sum the user\'s confirmed expenses grouped by category over a period. Use this for "where did my money go" / "how much on X" questions that need exact figures beyond the summary already provided.',
    kind: 'read',
    input_schema: {
      type: 'object',
      properties: {
        since_days: {
          type: 'integer',
          description: 'How many days back to include (e.g. 7 for this week, 30 for this month). Default 30.',
        },
        category: {
          type: 'string',
          description: 'Optional category name to filter to (e.g. "Transport").',
        },
      },
    },
    run: async (ctx, input) => {
      const days = input?.since_days ?? 30;
      const since = new Date();
      since.setDate(since.getDate() - days);
      const txns = await rows(
        ctx,
        "SELECT amount, category FROM transactions WHERE owner_id = ? AND transaction_type = 'expense' AND confirmed = 1 AND date_time >= ?",
        [ctx.userId, since.toISOString()],
      );
      const map: Record<string, number> = {};
      for (const t of txns) {
        const {label} = categoryLabel(t.category ?? '');
        map[label] = (map[label] ?? 0) + (t.amount ?? 0);
      }
      let entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
      if (input?.category) {
        const want = categoryLabel(input.category).label.toLowerCase();
        entries = entries.filter(([l]) => l.toLowerCase().includes(want));
      }
      if (!entries.length) {
        return `No expenses in the last ${days} days${input?.category ? ` for ${input.category}` : ''}.`;
      }
      const total = entries.reduce((s, [, v]) => s + v, 0);
      const lines = entries.map(([l, v]) => `${l}: RWF ${fmtAmount(v)}`).join('; ');
      return `Last ${days} days — total RWF ${fmtAmount(total)}. By category: ${lines}.`;
    },
  },

  {
    name: 'list_recent_transactions',
    description:
      'List the most recent confirmed transactions, optionally filtered by category or type. Use when the user asks to see specific transactions.',
    kind: 'read',
    input_schema: {
      type: 'object',
      properties: {
        limit: {type: 'integer', description: 'How many to return (default 10, max 30).'},
        category: {type: 'string', description: 'Optional category name filter.'},
        type: {type: 'string', enum: ['expense', 'income'], description: 'Optional type filter.'},
      },
    },
    run: async (ctx, input) => {
      const limit = Math.min(input?.limit ?? 10, 30);
      const txns = await rows(
        ctx,
        'SELECT amount, category, merchant, payee, transaction_type, date_time FROM transactions WHERE owner_id = ? AND confirmed = 1 ORDER BY date_time DESC LIMIT 60',
        [ctx.userId],
      );
      let filtered = txns;
      if (input?.type) {
        filtered = filtered.filter(t => t.transaction_type === input.type);
      }
      if (input?.category) {
        const want = categoryLabel(input.category).id;
        filtered = filtered.filter(t => resolveCat(t.category ?? '') === want);
      }
      filtered = filtered.slice(0, limit);
      if (!filtered.length) {
        return 'No matching transactions.';
      }
      return filtered
        .map(t => {
          const sign = t.transaction_type === 'income' ? '+' : '-';
          const label = t.merchant || t.payee || categoryLabel(t.category ?? '').label;
          const date = (t.date_time ?? '').slice(0, 10);
          return `${date} ${sign}RWF ${fmtAmount(t.amount ?? 0)} — ${label}`;
        })
        .join('\n');
    },
  },

  {
    name: 'add_transaction',
    description:
      'Record a new expense or income the user tells you about (that is not already in their SMS). Confirm the amount, account, and category with the user before calling if any are ambiguous.',
    kind: 'write',
    input_schema: {
      type: 'object',
      properties: {
        amount: {type: 'number', description: 'Positive amount in RWF.'},
        type: {type: 'string', enum: ['expense', 'income'], description: 'Whether money went out or came in.'},
        account_name: {type: 'string', description: 'Which account (e.g. "MTN MoMo", "Cash").'},
        category: {type: 'string', description: 'Category name (e.g. "Transport", "Food & Dining").'},
        merchant: {type: 'string', description: 'Who it was paid to / received from.'},
        note: {type: 'string'},
      },
      required: ['amount', 'type'],
    },
    summary: input =>
      `Add ${input.type} of RWF ${fmtAmount(input.amount)}${input.merchant ? ` — ${input.merchant}` : ''}${input.account_name ? ` on ${input.account_name}` : ''}`,
    run: async (ctx, input) => {
      const account = await resolveAccount(ctx, input.account_name);
      if (!account) {
        return 'No account exists yet — the user needs to add one first.';
      }
      const amt = Math.abs(input.amount);
      const {label} = categoryLabel(input.category ?? '');
      const now = new Date().toISOString();
      await ctx.db.execute(
        'INSERT INTO transactions (id, amount, account_id, category, subcategory, date_time, confirmed, currency, payee, merchant, transaction_type, note, fees, budget_id, source, confidence, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          uuid(), amt, account.id, label, '', now, 1, 'RWF',
          input.merchant ?? '', input.merchant ?? '', input.type,
          input.note ?? '', 0, null, 'ai', 1, ctx.userId, now,
        ],
      );
      const sign = input.type === 'income' ? 1 : -1;
      await ctx.db.execute(
        'UPDATE accounts SET available_balance = available_balance + ? WHERE id = ?',
        [sign * amt, account.id],
      );
      return `Recorded ${input.type} of RWF ${fmtAmount(amt)} (${label}) on ${account.name}.`;
    },
  },

  {
    name: 'recategorize_transaction',
    description:
      'Change the category of the most recent transaction matching a merchant name. Use when the user says something like "that Simba charge was groceries not shopping".',
    kind: 'write',
    input_schema: {
      type: 'object',
      properties: {
        merchant: {type: 'string', description: 'Merchant/payee name to match.'},
        new_category: {type: 'string', description: 'The correct category name.'},
      },
      required: ['merchant', 'new_category'],
    },
    summary: input => `Recategorize "${input.merchant}" → ${categoryLabel(input.new_category).label}`,
    run: async (ctx, input) => {
      const q = `%${input.merchant.toLowerCase()}%`;
      const match = (
        await rows(
          ctx,
          'SELECT id, merchant, payee FROM transactions WHERE owner_id = ? AND (LOWER(merchant) LIKE ? OR LOWER(payee) LIKE ?) ORDER BY date_time DESC LIMIT 1',
          [ctx.userId, q, q],
        )
      )[0];
      if (!match) {
        return `No transaction found matching "${input.merchant}".`;
      }
      const {label} = categoryLabel(input.new_category);
      await ctx.db.execute('UPDATE transactions SET category = ? WHERE id = ?', [label, match.id]);
      return `Recategorized ${match.merchant || match.payee} to ${label}.`;
    },
  },

  {
    name: 'create_budget',
    description:
      'Create a monthly spending cap for a category. Use when the user asks to set or start a budget.',
    kind: 'write',
    input_schema: {
      type: 'object',
      properties: {
        category: {type: 'string', description: 'Category to cap (e.g. "Entertainment").'},
        limit: {type: 'number', description: 'Monthly limit in RWF.'},
      },
      required: ['category', 'limit'],
    },
    summary: input => `Create ${categoryLabel(input.category).label} budget of RWF ${fmtAmount(input.limit)}/month`,
    run: async (ctx, input) => {
      const {label} = categoryLabel(input.category);
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const budgetId = uuid();
      await ctx.db.execute(
        'INSERT INTO budgets (id, name, period, start_date, end_date, amount, recurring, event, shared_with, collaborators, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [budgetId, `${label} budget`, 'monthly', start.toISOString(), end.toISOString(), input.limit, 1, '', '[]', '[]', ctx.userId, now.toISOString()],
      );
      await ctx.db.execute(
        'INSERT INTO budget_items (id, budget_id, category, subcategory, amount, owner_id) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), budgetId, label, '', input.limit, ctx.userId],
      );
      return `Created a ${label} budget capped at RWF ${fmtAmount(input.limit)} per month.`;
    },
  },

  {
    name: 'add_scheduled_payment',
    description:
      'Schedule a recurring bill or payment reminder. Use when the user asks to be reminded of a recurring payment (rent, subscription, loan installment).',
    kind: 'write',
    input_schema: {
      type: 'object',
      properties: {
        name: {type: 'string', description: 'What the payment is (e.g. "House rent").'},
        amount: {type: 'number', description: 'Amount in RWF.'},
        account_name: {type: 'string', description: 'Account it is paid from.'},
        frequency: {type: 'string', enum: ['weekly', 'monthly', 'yearly'], description: 'How often.'},
      },
      required: ['name', 'amount', 'frequency'],
    },
    summary: input => `Schedule "${input.name}" — RWF ${fmtAmount(input.amount)} ${input.frequency}`,
    run: async (ctx, input) => {
      const account = await resolveAccount(ctx, input.account_name);
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
      await ctx.db.execute(
        'INSERT INTO scheduled_payments (id, name, amount, account_id, payee, frequency, transaction_type, start_date, next_reminder_date, is_recurring, note, labels, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          uuid(), input.name, input.amount, account?.id ?? null, '', input.frequency, 'expense',
          now.toISOString(), next.toISOString(), 1, '', '[]', ctx.userId, now.toISOString(),
        ],
      );
      return `Scheduled "${input.name}" (RWF ${fmtAmount(input.amount)}, ${input.frequency}).`;
    },
  },
];

// Tool schemas in the shape the Anthropic Messages API expects.
export function anthropicToolSchemas() {
  return AI_ACTIONS.map(a => ({
    name: a.name,
    description: a.description,
    input_schema: a.input_schema,
  }));
}

export function findAction(name: string): AiAction | undefined {
  return AI_ACTIONS.find(a => a.name === name);
}
