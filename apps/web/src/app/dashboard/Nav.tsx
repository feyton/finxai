'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Icon} from '@/components/Icon';

const LINKS = [
  {href: '/dashboard', label: 'Dashboard', icon: 'grid'},
  {href: '/dashboard/transactions', label: 'Transactions', icon: 'receipt'},
  {href: '/dashboard/accounts', label: 'Accounts', icon: 'wallet'},
  {href: '/dashboard/budgets', label: 'Budgets', icon: 'pie'},
  {href: '/dashboard/debts', label: 'Debts', icon: 'coins'},
  {href: '/dashboard/analytics', label: 'Analytics', icon: 'bars'},
  {href: '/dashboard/shared', label: 'Shared & Family', icon: 'users'},
];

export function Nav() {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map(l => {
        const active =
          l.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className="press flex w-full items-center gap-[11px] whitespace-nowrap rounded-[10px] px-3 py-2.5 text-left text-[13.5px]"
            style={{
              background: active ? 'var(--sidebar-active-bg)' : 'transparent',
              color: active ? '#fff' : 'var(--sidebar-text)',
              fontWeight: active ? 600 : 500,
            }}>
            <Icon
              name={l.icon}
              size={18}
              sw={active ? 2.2 : 1.8}
              color={active ? 'var(--accent)' : 'var(--sidebar-text-2)'}
            />
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
