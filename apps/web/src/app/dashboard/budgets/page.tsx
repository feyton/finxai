import {loadDatasets} from '@/lib/insights';
import {Topbar} from '@/components/ui';
import {BudgetsClient} from './BudgetsClient';

export const dynamic = 'force-dynamic';

export default async function BudgetsPage() {
  const d = await loadDatasets(6);
  return (
    <>
      <Topbar
        title="Budgets"
        sub="Named plans with items — claim spending and contributions against them"
        syncLabel={d.syncLabel}
        reviewCount={d.reviewCount}
      />
      <BudgetsClient
        budgets={d.budgets}
        items={d.items}
        tx={d.tx}
        splits={d.splits}
      />
    </>
  );
}
