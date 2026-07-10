'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';

const LINKS = [
  {href: '/dashboard', label: 'Overview', icon: '▦'},
  {href: '/dashboard/transactions', label: 'Transactions', icon: '⇅'},
  {href: '/dashboard/accounts', label: 'Accounts', icon: '▤'},
  {href: '/dashboard/budgets', label: 'Budgets', icon: '◔'},
  {href: '/dashboard/shared', label: 'Shared', icon: '⧉'},
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
            className={`nav-link${active ? ' active' : ''}`}>
            <span className="w-4 text-center text-[13px] opacity-80">{l.icon}</span>
            <span>{l.label}</span>
          </Link>
        );
      })}
    </>
  );
}
