'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { href: string; label: string };

const sections: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Operations',
    items: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/employees', label: 'Guards' },
      { href: '/clients', label: 'Clients' },
      { href: '/assignments', label: 'Assignments' },
    ],
  },
  {
    heading: 'Payroll',
    items: [
      { href: '/dtr', label: 'Time records (DTR)' },
      { href: '/payroll', label: 'Pay runs' },
      { href: '/exports', label: 'Government exports' },
    ],
  },
];

export function SidebarNav() {
  const pathname = usePathname() ?? '';

  return (
    <nav className="sidebar-nav" aria-label="Primary">
      {sections.map((section) => (
        <div key={section.heading}>
          <div className="sidebar-section">{section.heading}</div>
          {section.items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? 'sidebar-link is-active' : 'sidebar-link'}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
