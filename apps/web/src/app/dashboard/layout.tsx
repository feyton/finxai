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
      {/* Desktop sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">F</div>
          <span>FinXAI</span>
          <span className="ml-auto rounded-md bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold text-accent2">
            ADMIN
          </span>
        </div>
        <Nav />
        <div className="nav-spacer" />
        <div className="truncate px-2.5 pb-2 text-[11px] text-ink3">{name}</div>
        <form action="/auth/signout" method="post">
          <button className="btn-signout" type="submit">
            Sign out
          </button>
        </form>
      </aside>

      {/* Mobile top bar */}
      <div className="topbar">
        <div className="brand-mark mr-1">F</div>
        <Nav />
      </div>

      <main className="main">{children}</main>
    </div>
  );
}
