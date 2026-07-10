import {createClient} from '@/lib/supabase/server';
import {loadDatasets} from '@/lib/insights';
import {Topbar} from '@/components/ui';
import type {Transaction} from '@/lib/types';
import {TransactionsClient} from './TransactionsClient';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{account?: string}>;
}) {
  const params = await searchParams;
  const d = await loadDatasets(6);
  const supabase = await createClient();
  const [txRes, splitsRes, rulesRes] = await Promise.all([
    supabase.from('transactions').select('*').order('date_time', {ascending: false}).limit(600),
    supabase.from('split_details').select('*'),
    supabase.from('merchant_rules').select('*').order('confirmation_count', {ascending: false}),
  ]);

  return (
    <>
      <Topbar
        title="Transactions"
        sub="Deep filtering, bulk edit and enrichment — changes sync back to the phone"
        syncLabel={d.syncLabel}
        reviewCount={d.reviewCount}
      />
      <TransactionsClient
        initialTx={(txRes.data ?? []) as Transaction[]}
        accounts={d.accounts}
        initialSplits={splitsRes.data ?? []}
        initialRules={rulesRes.data ?? []}
        presetAccount={params.account ?? 'all'}
      />
    </>
  );
}
