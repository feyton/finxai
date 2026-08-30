#!/usr/bin/env node
/**
 * Confirms a column actually exists in Postgres before the client starts
 * writing it (ROADMAP §5 step 1). Uses the anon key: RLS returns no rows, but
 * PostgREST still fails the request with 42703 when the column is missing —
 * so this distinguishes "exists, empty" from "does not exist" without ever
 * reading a user's data.
 *
 * Getting this wrong is not a compile error, it is a 400 on every upsert that
 * the connector then discards as a permanent failure. Cheap to check.
 */
import {readFileSync} from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../apps/web/.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const EXPECTED = [
  ['transactions', 'channel,pay_code'],
  ['auto_records', 'channel,pay_code'],
  ['merchant_rules', 'channel,pay_code'],
  // v17 — merchant->place memory
  ['transactions', 'location_source'],
  ['auto_records', 'location_source'],
];

let missing = 0;
for (const [table, cols] of EXPECTED) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${cols}&limit=1`, {
    headers: {apikey: anon, Authorization: `Bearer ${anon}`},
  });
  if (res.ok) {
    console.log(`${table.padEnd(16)} OK       ${cols} present`);
  } else {
    const body = await res.text();
    console.log(`${table.padEnd(16)} MISSING  ${body.slice(0, 120)}`);
    missing++;
  }
}
console.log(
  missing === 0
    ? '\nAll columns present — safe for the client to write them.'
    : `\n${missing} table(s) missing columns — do NOT ship client writes yet.`,
);
process.exit(missing === 0 ? 0 : 1);
