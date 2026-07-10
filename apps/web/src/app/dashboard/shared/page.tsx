import {createClient} from '@/lib/supabase/server';
import type {Account, AccountShare} from '@/lib/types';
import {SharedClient} from './SharedClient';

export const dynamic = 'force-dynamic';

export default async function SharedPage() {
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  const uid = user?.id ?? '';

  const [accountsRes, sharesRes] = await Promise.all([
    supabase.from('accounts').select('*'),
    supabase.from('account_shares').select('*').order('created_at', {ascending: false}),
  ]);

  return (
    <SharedClient
      uid={uid}
      userName={
        (user?.user_metadata?.full_name as string) ||
        (user?.user_metadata?.name as string) ||
        user?.email ||
        'A FinXAI user'
      }
      initialAccounts={(accountsRes.data ?? []) as Account[]}
      initialShares={(sharesRes.data ?? []) as AccountShare[]}
    />
  );
}
