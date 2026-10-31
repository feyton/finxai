import {createClient} from '@/lib/supabase/server';
import {loadDatasets} from '@/lib/insights';
import {Topbar} from '@/components/ui';
import type {Person} from '@/lib/types';
import {PeopleClient, type PeopleTxRow} from './PeopleClient';

export const dynamic = 'force-dynamic';

// The columns the suggestions and the re-file plan read — nothing more, because
// this pulls the whole history (a re-file must see every past payment).
const COLS =
  'id, merchant, payee, pay_code, amount, category, transaction_type, transfer_direction, transfer_account_id, date_time';

export default async function PeoplePage() {
  const d = await loadDatasets(1);
  const supabase = await createClient();
  const [peopleRes, userRes] = await Promise.all([
    supabase.from('people').select('*').order('created_at', {ascending: false}),
    supabase.auth.getUser(),
  ]);
  const ownerId = userRes.data.user?.id ?? '';

  // PostgREST caps a response (1000 rows by default), so page through it.
  const rows: PeopleTxRow[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const {data, error} = await supabase
      .from('transactions')
      .select(COLS)
      // Own rows only: RLS also lets a shared account's rows through, and the
      // re-file must never touch someone else's transactions.
      .eq('owner_id', ownerId)
      .order('date_time', {ascending: false})
      .range(from, from + 999);
    if (error || !data?.length) break;
    rows.push(...(data as PeopleTxRow[]));
    if (data.length < 1000) break;
  }

  return (
    <>
      <Topbar
        title="People & places"
        sub="Say who someone is, or what a place is, and their payments file themselves — no AI guess"
        syncLabel={d.syncLabel}
        reviewCount={d.reviewCount}
      />
      <PeopleClient
        initialPeople={(peopleRes.data ?? []) as Person[]}
        rows={rows}
        ownerId={ownerId}
        // A missing table means migration v24 has not run; every action here would fail.
        setupError={peopleRes.error ? peopleRes.error.message : null}
      />
    </>
  );
}
