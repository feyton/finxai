import {createClient} from '@/lib/supabase/server';
import {loadDatasets} from '@/lib/insights';
import {Topbar} from '@/components/ui';
import type {Memory} from '@/lib/types';
import {MemoryClient} from './MemoryClient';

export const dynamic = 'force-dynamic';

export default async function MemoryPage() {
  const d = await loadDatasets(1);
  const supabase = await createClient();
  const {data: userData} = await supabase.auth.getUser();
  const ownerId = userData.user?.id ?? '';
  const res = await supabase
    .from('memories')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', {ascending: false});

  return (
    <>
      <Topbar
        title="Memory"
        sub="Facts the SMS classifier reads before it files anything — teach it once instead of correcting it every time"
        syncLabel={d.syncLabel}
        reviewCount={d.reviewCount}
      />
      <MemoryClient
        initial={(res.data ?? []) as Memory[]}
        ownerId={ownerId}
        // A missing table means migration v22 has not run.
        setupError={res.error ? res.error.message : null}
      />
    </>
  );
}
