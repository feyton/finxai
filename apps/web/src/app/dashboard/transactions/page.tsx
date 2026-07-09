import {createClient} from '@/lib/supabase/server';
import type {Account, Transaction} from '@/lib/types';
import {TransactionsClient} from './TransactionsClient';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const supabase = await createClient();
  const [txRes, accRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('*')
      .order('date_time', {ascending: false})
      .limit(500),
    supabase.from('accounts').select('*').order('name'),
  ]);

  return (
    <TransactionsClient
      initialTx={(txRes.data ?? []) as Transaction[]}
      accounts={(accRes.data ?? []) as Account[]}
    />
  );
}
