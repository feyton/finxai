import {createClient} from '@/lib/supabase/server';
import {loadDatasets} from '@/lib/insights';
import {Topbar} from '@/components/ui';
import {DebtsClient} from './DebtsClient';

export const dynamic = 'force-dynamic';

export default async function DebtsPage() {
  const d = await loadDatasets(6);
  const supabase = await createClient();
  const {data: schedules} = await supabase
    .from('debt_schedules')
    .select('*')
    .order('n', {ascending: true});

  return (
    <>
      <Topbar
        title="Debts & loans"
        sub="Repayment schedules, amortization and payoff projections"
        syncLabel={d.syncLabel}
        reviewCount={d.reviewCount}
      />
      <DebtsClient debts={d.debts} schedules={schedules ?? []} />
    </>
  );
}
