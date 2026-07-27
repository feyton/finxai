// Data for the home-screen balance widget. Mirrors AccountsPage.tsx's query
// and "my total excludes shared-to-me accounts" rule so the widget can never
// disagree with the in-app screen about what counts as "my" balance.
import {db} from '../tools/database';
import {supabase} from '../tools/supabase';

export interface WidgetAccount {
  id: string;
  name: string;
  type: string;
  available_balance: number;
  owner_id: string;
}

export interface WidgetAccountsData {
  totalBalance: number;
  accounts: WidgetAccount[];
}

export async function getWidgetAccountsData(): Promise<WidgetAccountsData> {
  const {
    data: {session},
  } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;

  const accounts = await db.getAll<WidgetAccount>(
    'SELECT id, name, type, available_balance, owner_id FROM accounts ORDER BY (owner_id = ?) DESC, created_at DESC',
    [userId ?? ''],
  );

  const totalBalance = accounts
    .filter(a => a.owner_id === userId)
    .reduce((s, a) => s + (a.available_balance ?? 0), 0);

  return {totalBalance, accounts};
}
