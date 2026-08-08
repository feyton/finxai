import {createClient} from '@/lib/supabase/server';
import {Topbar} from '@/components/ui';
import type {Account, AutoRecord, Subcategory} from '@/lib/types';
import {ReviewClient} from './ReviewClient';

export const dynamic = 'force-dynamic';

/**
 * Pending SMS review — the web half of the phone's SMS Review screen.
 *
 * These rows are the ones the classifier was not confident about, and until now they
 * could only be cleared on the phone: the dashboard could count them ("12 to review on
 * the phone") but not act on any of them. Reviewing is the one FinXAI task a keyboard
 * is genuinely better at, so it belongs here.
 */
export default async function ReviewPage() {
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  const [recordsRes, accountsRes, subcatsRes] = await Promise.all([
    // Oldest first: the backlog is worked through in the order it arrived, and a record
    // that has waited three weeks is the one most likely to be forgotten entirely.
    supabase.from('auto_records').select('*').order('date_time', {ascending: true}),
    supabase.from('accounts').select('*').order('name'),
    supabase.from('subcategories').select('*'),
  ]);

  const records = (recordsRes.data ?? []) as AutoRecord[];

  return (
    <>
      {/* No review-count badge here, deliberately: it is server-rendered and would keep
          claiming twelve while the list below shrinks to nine as records are cleared.
          On this page the list IS the count. */}
      <Topbar
        title="SMS Review"
        sub="Confirm, correct or ignore the records the AI was not sure about — every fix trains it"
      />
      <ReviewClient
        initialRecords={records}
        accounts={(accountsRes.data ?? []) as Account[]}
        customSubcats={(subcatsRes.data ?? []) as Subcategory[]}
        ownerId={user?.id ?? ''}
      />
    </>
  );
}
