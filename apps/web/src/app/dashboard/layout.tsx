import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {Icon} from '@/components/Icon';
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
  const initial = (name[0] ?? 'F').toUpperCase();

  const sidebar = (
    <>
      <div className="flex items-center gap-2.5 px-[18px] pb-[18px] pt-5">
        <div
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] text-white"
          style={{background: 'var(--accent)'}}>
          <Icon name="sparkles" size={17} sw={2.4} />
        </div>
        <div className="text-[15.5px] font-bold tracking-wide text-white">FinXAI</div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-1.5">
        <Nav />
      </nav>

      <div className="border-t p-3.5" style={{borderColor: 'rgba(255,255,255,0.06)'}}>
        <div className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
            style={{background: 'var(--accent)'}}>
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-white">{name}</div>
            <div className="text-[10.5px]" style={{color: 'var(--sidebar-text-2)'}}>
              Kigali, Rwanda
            </div>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              title="Sign out"
              className="press flex h-7 w-7 items-center justify-center rounded-lg"
              style={{color: 'var(--sidebar-text-2)'}}>
              <Icon name="logout" size={14} sw={2} />
            </button>
          </form>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      {/* Desktop sidebar */}
      <aside
        className="sticky top-0 hidden h-screen flex-col md:flex"
        style={{
          background: 'var(--sidebar-bg)',
          color: 'var(--sidebar-text)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}>
        {sidebar}
      </aside>

      {/* Mobile top nav */}
      <div
        className="flex items-center gap-1 overflow-x-auto px-3 py-2 md:hidden"
        style={{background: 'var(--sidebar-bg)'}}>
        <div
          className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
          style={{background: 'var(--accent)'}}>
          <Icon name="sparkles" size={14} sw={2.4} />
        </div>
        <Nav />
      </div>

      <main className="min-w-0">{children}</main>
    </div>
  );
}
