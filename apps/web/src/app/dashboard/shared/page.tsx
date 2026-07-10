import {createClient} from '@/lib/supabase/server';
import {loadDatasets} from '@/lib/insights';
import {Topbar} from '@/components/ui';
import type {AccountShare} from '@/lib/types';
import {SharedClient} from './SharedClient';

export const dynamic = 'force-dynamic';

export default async function SharedPage() {
  const d = await loadDatasets(1);
  const supabase = await createClient();
  const sharesRes = await supabase
    .from('account_shares')
    .select('*')
    .order('created_at', {ascending: false});

  return (
    <>
      <Topbar
        title="Shared & Family"
        sub="Who can see your accounts, and what they can do — SMS parsing stays on the owner's phone"
        syncLabel={d.syncLabel}
        reviewCount={d.reviewCount}
      />
      <div className="px-5 pb-14 pt-5 md:px-7">
        <SharedClient
          uid={d.uid}
          userName={d.userName}
          initialAccounts={d.accounts}
          initialShares={(sharesRes.data ?? []) as AccountShare[]}
        />
      </div>
    </>
  );
}
