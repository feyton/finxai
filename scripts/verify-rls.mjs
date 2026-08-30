#!/usr/bin/env node
/**
 * Read-only RLS smoke test, run with the PUBLIC anon key from outside any
 * session — i.e. exactly what an attacker with the key from a decompiled APK
 * can see.
 *
 * A table that returns rows here is world-readable and leaking. A table that
 * returns 0 rows (or a 401/permission error) has RLS enabled and enforcing.
 *
 * This cannot distinguish "RLS on with an owner policy" from "RLS on with no
 * policy at all" — both look like 0 rows from outside — so it complements the
 * pg_policies verify query in the migration, it does not replace it.
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
if (!url || !anon) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY in apps/web/.env.local');
  process.exit(1);
}

const TABLES = [
  'auto_records',
  'scheduled_payments',
  'subscriptions',
  'split_details',
  'transactions',
  'accounts',
  'budgets',
];

let leaking = 0;
for (const t of TABLES) {
  const res = await fetch(`${url}/rest/v1/${t}?select=id&limit=1`, {
    headers: {apikey: anon, Authorization: `Bearer ${anon}`},
  });
  let verdict;
  if (res.status === 200) {
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length === 0) {
      verdict = 'OK       RLS enforcing (0 rows to anon)';
    } else {
      verdict = `LEAKING  returned ${rows.length} row(s) to an anonymous caller`;
      leaking++;
    }
  } else {
    const body = await res.text();
    verdict = `OK       ${res.status} ${body.slice(0, 80)}`;
  }
  console.log(`${t.padEnd(20)} ${verdict}`);
}

console.log(
  leaking === 0
    ? '\nNo table is readable anonymously.'
    : `\n${leaking} TABLE(S) LEAKING — fix before anything else.`,
);
process.exit(leaking === 0 ? 0 : 1);
