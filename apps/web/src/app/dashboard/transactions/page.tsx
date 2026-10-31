import {createClient} from '@/lib/supabase/server';
import {loadDatasets} from '@/lib/insights';
import {Topbar} from '@/components/ui';
import type {Tag, Transaction} from '@/lib/types';
import {TransactionsClient} from './TransactionsClient';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{account?: string; tag?: string}>;
}) {
  const params = await searchParams;
  const d = await loadDatasets(6);
  const supabase = await createClient();
  const [txRes, splitsRes, rulesRes, tagsRes, taggedRes] = await Promise.all([
    supabase.from('transactions').select('*').order('date_time', {ascending: false}).limit(600),
    supabase.from('split_details').select('*'),
    supabase.from('merchant_rules').select('*').order('confirmation_count', {ascending: false}),
    supabase.from('tags').select('*').order('created_at', {ascending: false}),
    // EVERY tagged row, not just those inside the 600-row window above. A tag is
    // usually an errand spanning weeks; filtering to it and silently missing the
    // older half would show a wrong balance with nothing on screen to say so.
    supabase
      .from('transactions')
      .select('*')
      .not('tag_ids', 'is', null)
      .order('date_time', {ascending: false})
      .limit(5000),
  ]);
  const seen = new Set<string>();
  const tx = [...(txRes.data ?? []), ...(taggedRes.data ?? [])]
    .filter(t => (seen.has(t.id) ? false : (seen.add(t.id), true)))
    .sort((a, b) => (b.date_time ?? '').localeCompare(a.date_time ?? '')) as Transaction[];
  const {
    data: {user},
  } = await supabase.auth.getUser();

  return (
    <>
      <Topbar
        title="Transactions"
        sub="Deep filtering, bulk edit and enrichment — changes sync back to the phone"
        syncLabel={d.syncLabel}
        reviewCount={d.reviewCount}
      />
      <TransactionsClient
        initialTx={tx}
        initialTags={(tagsRes.data ?? []) as Tag[]}
        ownerId={user?.id ?? ''}
        presetTag={params.tag ?? 'all'}
        accounts={d.accounts}
        initialSplits={splitsRes.data ?? []}
        initialRules={rulesRes.data ?? []}
        presetAccount={params.account ?? 'all'}
      />
    </>
  );
}
