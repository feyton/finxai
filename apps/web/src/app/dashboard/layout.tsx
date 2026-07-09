import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {Nav} from './Nav';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const name =
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    user.email ||
    'You';

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">F</div>
          <span>FinXAI</span>
        </div>
        <Nav />
        <div className="nav-spacer" />
        <div
          style={{
            padding: '10px 12px',
            fontSize: 12.5,
            color: 'var(--text3)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
          {name}
        </div>
        <form action="/auth/signout" method="post">
          <button className="btn-signout" type="submit" style={{width: '100%'}}>
            Sign out
          </button>
        </form>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
