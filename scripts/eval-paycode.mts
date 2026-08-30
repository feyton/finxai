/**
 * Measures pay-code coverage against the REAL harvested SMS corpus.
 *
 * The Pay-again screen is only as good as this hit rate: a code we cannot
 * extract is a merchant the user still has to type by hand, which is the exact
 * problem the feature exists to remove. Guessing at the rate from a handful of
 * hand-picked examples is how you ship a feature that works on the four
 * messages you tested and nothing else.
 *
 *   npx tsx scripts/eval-paycode.mts
 *
 * Reads eval/golden.json (gitignored — real SMS bodies, never committed).
 */
import {readFileSync} from 'node:fs';
import {extractPayCode, regexExtract} from '../src/tools/smsParser';
import {buildUssd, railFor} from '../src/tools/ussd';

interface Case {
  sms: string;
  sender?: string;
  merchant?: string;
  transaction_type?: string;
}

const cases: Case[] = JSON.parse(readFileSync('eval/golden.json', 'utf8'));

// Only money-out can be re-paid; income and transfers are correctly out of scope.
const expenses = cases.filter(c => (c.transaction_type ?? 'expense') === 'expense');

let withCode = 0;
let dialable = 0;
const byChannel = new Map<string, {total: number; coded: number}>();
const misses: Case[] = [];

for (const c of expenses) {
  const facts = regexExtract(c.sms ?? '');
  const code = extractPayCode(c.sms ?? '');
  const ch = facts.channelHint || 'Other';
  const b = byChannel.get(ch) ?? {total: 0, coded: 0};
  b.total++;
  if (code) {
    b.coded++;
    withCode++;
    if (buildUssd({channel: ch, payCode: code})) {
      dialable++;
    }
  } else if (railFor(ch)) {
    // A rail we COULD dial but no code found — the actionable misses.
    misses.push(c);
  }
  byChannel.set(ch, b);
}

const pct = (n: number, d: number) => (d === 0 ? '  0.0%' : `${((n / d) * 100).toFixed(1)}%`);

console.log(`\nCorpus: ${cases.length} messages, ${expenses.length} money-out\n`);
console.log(`  pay_code extracted : ${withCode}/${expenses.length}  (${pct(withCode, expenses.length)})`);
console.log(`  dialable USSD      : ${dialable}/${expenses.length}  (${pct(dialable, expenses.length)})`);

console.log('\nBy detected channel:');
for (const [ch, b] of [...byChannel].sort((a, b2) => b2[1].total - a[1].total)) {
  const dial = railFor(ch) ? '' : '   (not a dialable rail)';
  console.log(`  ${ch.padEnd(15)} ${String(b.coded).padStart(3)}/${String(b.total).padEnd(3)} ${pct(b.coded, b.total).padStart(6)}${dial}`);
}

// The useful output is not the score, it is the messages we should have matched.
if (misses.length) {
  console.log(`\n${misses.length} message(s) on a dialable rail with NO code — first 12:`);
  for (const m of misses.slice(0, 12)) {
    console.log(`  · ${(m.sms ?? '').replace(/\s+/g, ' ').slice(0, 150)}`);
  }
}
console.log();
