#!/usr/bin/env node
/**
 * Offline evaluation of the SMS classifier, per field and per provider.
 *
 * WHY THIS EXISTS
 * Every prompt tweak, model swap, and threshold change until now has been
 * guesswork. Worse, a change can improve one provider's SMS format while
 * quietly breaking another's, and nothing would tell us. This measures it.
 *
 * It drives the REAL pipeline — buildClassification() and
 * applyClassification() from src/tools/smsParser.ts — so what is measured
 * here is what runs on the phone. Only the network call in between is swapped
 * per provider.
 *
 * GOLDEN SET
 * Your own confirmed transactions are already labelled data: the user saw the
 * record and either confirmed or corrected the merchant and category. Harvest
 * them with:
 *
 *   node scripts/eval-sms.mjs harvest > eval/golden.json
 *
 * (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or run the SQL it prints)
 *
 * RUN
 *   npm run eval -- --set eval/golden.json --providers gemini,claude
 *
 * Env:
 *   GEMINI_API_KEY, GEMINI_MODEL       (default gemini-3.5-flash)
 *   ANTHROPIC_API_KEY, ANTHROPIC_MODEL (default claude-haiku-4-5)
 *   EVAL_CONCURRENCY                   (default 4)
 */
import {existsSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {argv, env, exit} from 'node:process';
import Anthropic from '@anthropic-ai/sdk';

// Direct import: the parser is plain TS with no React Native dependencies (see
// the note atop merchantNormalize.ts), so tsx loads it without a bundler.
// Run with:  npx tsx scripts/eval-sms.mts
import {
  applyClassification,
  buildClassification,
  parseWithRegex,
  regexExtract,
} from '../src/tools/smsParser';
import {resolveCat} from '../src/theme';

// ── Env loading ────────────────────────────────────────────────────────────
// Read .env files ourselves rather than requiring the caller to export things:
// the credentials this needs already live in the repo's env files, and asking
// for them to be re-exported by hand is how a harness stops getting run.
// Existing process.env always wins, so a one-off override still works.
function loadEnvFiles(paths: string[]) {
  for (const p of paths) {
    if (!existsSync(p)) {
      continue;
    }
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m || line.trim().startsWith('#')) {
        continue;
      }
      const key = m[1];
      // Strip surrounding quotes and any trailing inline comment.
      const val = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
      if (env[key] === undefined) {
        env[key] = val;
      }
    }
  }
}
loadEnvFiles(['.env', '.env.local', 'apps/web/.env.local', 'apps/web/.env']);

// Supabase renamed its API keys: `publishable`/`secret` replaced
// `anon`/`service_role`. Accept either name so the harness works against
// whichever convention the repo's env files use.
const supabaseUrl = () => env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAdminKey = () =>
  env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

// ── CLI ────────────────────────────────────────────────────────────────────
const cmd = argv[2] ?? 'run';
const flag = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const HARVEST_SQL = `-- Golden set: SMS the user has already adjudicated.
-- confirmed = 1 means the record was accepted or corrected in SMS Review, so
-- merchant/category/transaction_type are ground truth for that message.
select
  t.sms,
  t.sender,
  t.merchant,
  t.category,
  t.subcategory,
  t.transaction_type,
  t.amount,
  t.fees,
  t.balance_after
from transactions t
where t.owner_id = auth.uid()
  and t.source = 'sms'
  and t.confirmed = 1
  and t.sms is not null
  and length(t.sms) > 20
order by t.created_at desc
limit 500;`;

// ── Providers ──────────────────────────────────────────────────────────────
// Each returns {reply, inputTokens, outputTokens}.
const PROVIDERS: Record<string, (p: {system: string; user: string}) => Promise<any>> = {
  // Keyless baseline: answer as the on-device regex fallback would, so the
  // deterministic fields (amount / fee / balance) and the fallback's merchant
  // quality can be measured on real data with no API key and no cost. Those
  // three SHOULD be ~100% — anything less is a regex bug, and that is the most
  // actionable signal this harness produces.
  async regex() {
    return {reply: '__REGEX_BASELINE__', inputTokens: 0, outputTokens: 0, model: 'regex'};
  },

  async gemini({system, user}: {system: string; user: string}) {
    const key = env.GEMINI_API_KEY;
    if (!key) {throw new Error('GEMINI_API_KEY not set');}
    const model = env.GEMINI_MODEL ?? 'gemini-3.5-flash';
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          contents: [{parts: [{text: `${system}\n\n${user}`}]}],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0,
            maxOutputTokens: 300,
          },
        }),
      },
    );
    if (!res.ok) {throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);}
    const body = await res.json();
    return {
      reply: body?.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
      inputTokens: body?.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: body?.usageMetadata?.candidatesTokenCount ?? 0,
      model,
    };
  },

  async claude({system, user}: {system: string; user: string}) {
    if (!env.ANTHROPIC_API_KEY) {throw new Error('ANTHROPIC_API_KEY not set');}
    const model = env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5';
    const client = new Anthropic();
    // Deliberately no extended thinking and no `effort`: this is a bounded
    // classification over pre-extracted facts, thinking buys nothing, and
    // `effort` is rejected outright on Haiku 4.5.
    const msg: any = await client.messages.create({
      model,
      max_tokens: 300,
      temperature: 0,
      system,
      messages: [{role: 'user', content: user}],
    });
    const text = msg.content.find((b: any) => b.type === 'text')?.text ?? '';
    return {
      reply: text,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      model,
    };
  },
};

// $ per 1M tokens. Keep in sync with apps/web/src/lib/aiUsage.ts.
const PRICING: Record<string, {input: number; output: number}> = {
  'gemini-3.5-flash': {input: 1.5, output: 9.0},
  'claude-haiku-4-5': {input: 1.0, output: 5.0},
  'claude-sonnet-4-6': {input: 3.0, output: 15.0},
  'claude-sonnet-5': {input: 3.0, output: 15.0},
};

// ── Scoring ────────────────────────────────────────────────────────────────
const norm = (s: unknown) => (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');

// Merchant is scored loosely on purpose: the label is whatever the user last
// typed, so "Sawa Citi" vs "Sawa Citi Ltd" is a match, but a timestamp or
// "Unknown" is not.
function merchantMatches(got: unknown, want: unknown) {
  const a = norm(got);
  const b = norm(want);
  if (!a || !b) {return false;}
  if (a === b) {return true};
  if (a.length >= 4 && b.includes(a)) {return true;}
  if (b.length >= 4 && a.includes(b)) {return true;}
  return false;
}

// Which labels are real ground truth and which are not:
//
//   merchant / category / transaction_type — the user SAW these in SMS Review
//     and either confirmed or corrected them. Genuine human labels.
//
//   amount / fees — written by the same regex extractor being measured, so
//     comparing against them is CIRCULAR: 100% proves the extractor is
//     deterministic, not that it is correct. Reported under "consistency", and
//     a drop is still a useful regression alarm.
//
//   balance_after — also written by the app, but NOT always by extraction (it
//     can come from the balance replay in tools/balance.ts), so it disagrees
//     with the SMS text on rows where those two paths diverge. Scored against
//     what the MESSAGE says instead, which is the only thing extraction can be
//     held to.
const HUMAN_FIELDS = ['merchant', 'category', 'isTransfer'] as const;
const CONSISTENCY_FIELDS = ['amount', 'fee', 'balanceVsSms'] as const;

function balanceFromSms(sms: string): number | null {
  const m = sms.match(
    /(?:available\s+balance|new\s+balance|mokash\s+balance|balance)\s*(?:is)?\s*:?\s*(?:RWF|FRW)?\s*([\d,]+(?:\.\d+)?)/i,
  );
  return m ? Math.round(parseFloat(m[1].replace(/,/g, ''))) : null;
}

// Some stored labels were written BEFORE the extraction fixes and carry the old
// bug's residue — e.g. "INSTAPLUS SERVICES Ltd 55411 was completed at
// 2026-07-27 20:23:29". Scoring against those marks a correct answer wrong, so
// they are excluded from the merchant metric and counted separately instead.
function labelIsPolluted(label: unknown): boolean {
  const s = String(label ?? '');
  return /\d{4}-\d{2}-\d{2}/.test(s) || /(?:was|has been)\s+completed/i.test(s);
}

function scoreOne(parsed: any, expected: any) {
  const wantTransfer = expected.transaction_type === 'transfer';
  const smsBalance = balanceFromSms(expected.sms ?? '');
  return {
    merchant: labelIsPolluted(expected.merchant)
      ? null
      : merchantMatches(parsed.merchant, expected.merchant),
    // Legacy rows store a display name ("Family & Transfers", "Entertainment")
    // rather than a CategoryId, so both sides go through the same resolver the
    // app uses instead of being compared as raw strings.
    category: wantTransfer
      ? null
      : resolveCat(String(parsed.category ?? '')) ===
        resolveCat(String(expected.category ?? '')),
    isTransfer: !!parsed.isTransfer === wantTransfer,
    amount: Number(parsed.amount) === Number(expected.amount ?? 0),
    fee: Number(parsed.fee) === Number(expected.fees ?? 0),
    balanceVsSms:
      smsBalance == null ? null : Number(parsed.balance_after) === smsBalance,
  };
}

// ── Runner ─────────────────────────────────────────────────────────────────
async function pool<T, R>(items: T[], limit: number, worker: (item: T, i: number) => Promise<R>): Promise<any[]> {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({length: Math.min(limit, items.length)}, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          out[i] = await worker(items[i], i);
        } catch (e) {
          out[i] = {error: e?.message ?? String(e)};
        }
      }
    }),
  );
  return out;
}

async function run() {
  const setPath = flag('set', 'eval/golden.json');
  const providers = flag('providers', 'gemini,claude').split(',').map(s => s.trim());
  // One value per golden set (it's one user's data), overridable per case.
  const accountHolder = flag('user-name', '');
  let cases: any[];
  try {
    cases = JSON.parse(readFileSync(setPath, 'utf8'));
  } catch {
    console.error(`Could not read golden set at ${setPath}.`);
    console.error('Create it first:  npm run eval:harvest > eval/golden.json');
    exit(1);
  }
  if (!Array.isArray(cases) || cases.length === 0) {
    console.error('Golden set is empty.');
    exit(1);
  }

  // The user's own accounts matter: regexExtract identifies an inter-account
  // transfer by matching the counterparty against them, so an empty list makes
  // every genuine own-account transfer look like an ordinary payment. Optional
  // sidecar file, written by `harvest --accounts`.
  let accounts: {id: string; name: string; number?: string}[] = [];
  const accountsPath = flag('accounts', 'eval/accounts.local.json');
  if (existsSync(accountsPath)) {
    try {
      accounts = JSON.parse(readFileSync(accountsPath, 'utf8'));
    } catch {
      /* leave empty */
    }
  }

  // Learned rules, if supplied. These matter enormously for a fair number:
  // a large share of the golden set is person-to-person MoMo, where the
  // category is NOT inferable from the message text ("payment to Lambert
  // 005868") and only a rule the user taught can supply it. Measuring with no
  // rules therefore measures an unwinnable task and understates production
  // accuracy; measuring with them shows what the user actually experiences.
  let rules: any[] = [];
  const rulesPath = flag('rules', 'eval/rules.local.json');
  if (!argv.includes('--no-rules') && existsSync(rulesPath)) {
    try {
      rules = JSON.parse(readFileSync(rulesPath, 'utf8'));
    } catch {
      /* leave empty */
    }
  }

  console.log(`Golden set: ${cases.length} messages from ${setPath}`);
  console.log(
    rules.length
      ? `Rules: ${rules.length} learned (production-like). --no-rules to measure the model alone.`
      : 'Rules: none — measures the model alone, which understates person-to-person categories.',
  );
  console.log(
    accounts.length
      ? `Accounts: ${accounts.length} (own-account transfer detection active)`
      : 'Accounts: none — transfer detection will under-report. Run: npm run eval:harvest -- --accounts',
  );
  const report: any = {at: new Date().toISOString(), setPath, count: cases.length, providers: {}};

  for (const name of providers) {
    const provider = PROVIDERS[name];
    if (!provider) {
      console.error(`Unknown provider "${name}" — expected one of ${Object.keys(PROVIDERS)}`);
      continue;
    }
    process.stdout.write(`\n${name}: `);

    const t0 = Date.now();
    const results = await pool(cases, Number(env.EVAL_CONCURRENCY ?? 4), async c => {
      // Rules are deliberately EMPTY: we are measuring the model, not the
      // learned-rule overrides that would mask its behaviour.
      // userName matters: detectTransfer recognises a self-transfer by the
      // counterparty matching the account holder, so omitting it makes
      // "received from <yourself>" look like ordinary income.
      const ctx = {
        sender: c.sender ?? '',
        userName: c.userName ?? accountHolder,
        accounts,
        rules,
        // The account this message arrived for, matched by sender name — needed
        // so regexExtract can tell which side of a "Credited/Debited account"
        // alert is the user's.
        currentAccountId: accounts.find(
          a => norm(a.name) && norm(c.sender).includes(norm(a.name)),
        )?.id,
      };
      const facts = regexExtract(c.sms, ctx);
      const planned = buildClassification(c.sms, rules, {}, ctx, facts);
      if (planned.shortCircuit) {
        process.stdout.write('·');
        return {parsed: planned.shortCircuit, skipped: true, inputTokens: 0, outputTokens: 0};
      }
      const {reply, inputTokens, outputTokens, model} = await provider(planned as any);
      const parsed =
        reply === '__REGEX_BASELINE__'
          ? parseWithRegex(c.sms, ctx, facts)
          : applyClassification(reply, planned, c.sms, rules, ctx);
      process.stdout.write('.');
      return {parsed, inputTokens, outputTokens, model};
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const fields = [...HUMAN_FIELDS, ...CONSISTENCY_FIELDS] as unknown as string[];
    const tally: Record<string, {ok: number; n: number}> = Object.fromEntries(
      fields.map(f => [f, {ok: 0, n: 0}]),
    );
    const failures: any[] = [];
    const errorReasons = new Map<string, number>();
    let errors = 0;
    let skipped = 0;
    let inTok = 0;
    let outTok = 0;
    let model = '';
    const confidences: number[] = [];

    results.forEach((r: any, i: number) => {
      if (!r || r.error) {
        errors++;
        // Collapse to the distinctive part so a quota wall or a bad model name
        // is obvious rather than hiding behind a count.
        const key = String(r?.error ?? 'unknown').split(/\r?\n/)[0].slice(0, 110);
        errorReasons.set(key, (errorReasons.get(key) ?? 0) + 1);
        return;
      }
      if (r.skipped) {skipped++;}
      model = r.model ?? model;
      inTok += r.inputTokens ?? 0;
      outTok += r.outputTokens ?? 0;
      if (typeof r.parsed.confidence === 'number') {confidences.push(r.parsed.confidence);}
      const s: any = scoreOne(r.parsed, cases[i]);
      for (const f of fields) {
        if (s[f] === null) {continue;}
        tally[f].n++;
        if (s[f]) {tally[f].ok++;}
      }
      if (!s.merchant || s.category === false) {
        failures.push({
          sms: cases[i].sms.slice(0, 90),
          expected: {merchant: cases[i].merchant, category: cases[i].category},
          got: {merchant: r.parsed.merchant, category: r.parsed.category},
        });
      }
    });

    const price = PRICING[model] ?? {input: 0, output: 0};
    const cost = (inTok / 1e6) * price.input + (outTok / 1e6) * price.output;
    const pct = (f: string) => (tally[f].n ? ((tally[f].ok / tally[f].n) * 100).toFixed(1) : 'n/a');

    console.log(`\n  model        ${model || '(n/a)'}`);
    console.log(`  wall clock   ${elapsed}s   errors ${errors}   short-circuited ${skipped}`);
    for (const [reason, n] of [...errorReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
      console.log(`  ! ${n}x ${reason}`);
    }
    console.log('  -- accuracy vs human labels (what the user confirmed/fixed) --');
    for (const f of HUMAN_FIELDS) {
      console.log(`  ${f.padEnd(14)} ${String(pct(f)).padStart(5)}%  (${tally[f].ok}/${tally[f].n})`);
    }
    console.log(
      "  -- consistency vs the app's own extraction (circular; regression alarm only) --",
    );
    for (const f of CONSISTENCY_FIELDS) {
      console.log(`  ${f.padEnd(14)} ${String(pct(f)).padStart(5)}%  (${tally[f].ok}/${tally[f].n})`);
    }
    console.log(`  tokens       ${inTok} in / ${outTok} out`);
    console.log(`  cost         $${cost.toFixed(4)} total, $${(cost / cases.length).toFixed(5)}/SMS`);

    // Threshold guidance: with the prompt no longer told to emit 0.95 on a
    // rule match, the distribution is the model's own. Inheriting 0.92 from a
    // different model is exactly how auto-save rates drift.
    if (confidences.length) {
      const sorted = [...confidences].sort((a, b) => a - b);
      const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
      console.log(
        `  confidence   p10 ${q(0.1).toFixed(2)}  p50 ${q(0.5).toFixed(2)}  p90 ${q(0.9).toFixed(2)}`,
      );
    }

    report.providers[name] = {
      model, elapsed: Number(elapsed), errors, skipped,
      accuracy: Object.fromEntries(fields.map(f => [f, tally[f]])),
      tokens: {input: inTok, output: outTok},
      costUsd: Number(cost.toFixed(6)),
      confidences,
      failures: failures.slice(0, 40),
    };
  }

  mkdirSync(dirname('eval/report.json'), {recursive: true});
  writeFileSync('eval/report.json', JSON.stringify(report, null, 2));
  console.log('\nFull report (incl. per-message failures) → eval/report.json');
}

async function harvest() {
  const url = supabaseUrl();
  const key = supabaseAdminKey();
  if (!url || !key) {
    console.error(
      'Need SUPABASE_URL plus SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)',
    );
    console.error('in .env / apps/web/.env.local — or run this SQL in the Supabase');
    console.error('editor and save the JSON result to eval/golden.json:\n');
    console.error(HARVEST_SQL);
    exit(1);
  }
  // A service/secret key bypasses RLS, so this returns EVERY user's rows. Scope
  // to one owner when asked, otherwise report the spread so a multi-user pull
  // isn't mistaken for one person's data.
  const owner = flag('owner', '');
  const res = await fetch(
    `${url}/rest/v1/transactions?source=eq.sms&confirmed=eq.1&sms=not.is.null` +
      (owner ? `&owner_id=eq.${owner}` : '') +
      `&select=owner_id,sms,sender,merchant,category,subcategory,transaction_type,amount,fees,balance_after` +
      `&order=created_at.desc&limit=${flag('limit', '500')}`,
    {headers: {apikey: key, Authorization: `Bearer ${key}`}},
  );
  if (!res.ok) {
    console.error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
    exit(1);
  }
  // `--accounts` writes the sidecar the runner needs for transfer detection.
  if (argv.includes('--accounts')) {
    const ares = await fetch(
      `${url}/rest/v1/accounts?select=id,name,number,owner_id` +
        (owner ? `&owner_id=eq.${owner}` : ''),
      {headers: {apikey: key, Authorization: `Bearer ${key}`}},
    );
    if (!ares.ok) {
      console.error(`Supabase ${ares.status}: ${(await ares.text()).slice(0, 200)}`);
      exit(1);
    }
    const accts = (await ares.json()) as any[];
    mkdirSync('eval', {recursive: true});
    writeFileSync('eval/accounts.local.json', JSON.stringify(accts, null, 1));
    console.error(`wrote eval/accounts.local.json (${accts.length} accounts)`);
  }

  const rows = ((await res.json()) as any[]).filter(r => (r.sms ?? '').length > 20);
  const owners = new Set(rows.map(r => r.owner_id));
  if (owners.size > 1) {
    console.error(
      `warning: ${rows.length} rows span ${owners.size} users — pass --owner <uuid> to scope`,
    );
  }
  console.error(`harvested ${rows.length} labelled messages`);
  console.log(JSON.stringify(rows, null, 2));
}

if (cmd === 'harvest') {
  await harvest();
} else if (cmd === 'run') {
  await run();
} else {
  console.error('Usage: npx tsx scripts/eval-sms.mts [harvest|run] [--set path] [--providers gemini,claude]');
  exit(1);
}
