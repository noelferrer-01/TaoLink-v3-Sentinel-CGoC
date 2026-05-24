'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

type NavItem = { href: string; label: string; icon: string };

// ─── Nav sections (Slice 2 order: Dashboard → Clients → Employees → Assignments)

const sections: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Operations',
    items: [
      { href: '/dashboard', label: 'Dashboard',   icon: '⊞' },
      { href: '/clients',   label: 'Clients',     icon: '🏢' },
      { href: '/employees', label: 'Employees',   icon: '👤' },
      { href: '/assignments', label: 'Assignments', icon: '📍' },
    ],
  },
  {
    heading: 'Payroll',
    items: [
      { href: '/dtr',     label: 'DTR',                icon: '🕐' },
      { href: '/payroll', label: 'Pay Runs',            icon: '💸' },
      { href: '/exports', label: 'Government Exports',  icon: '📄' },
    ],
  },
];

// localStorage key for persistence
const LS_KEY = 'sentinel.sidebar.collapsed';

// ─── SidebarNav ───────────────────────────────────────────────────────────────

export function SidebarNav() {
  const pathname = usePathname() ?? '';

  // Collapsed state — initialized from localStorage on mount
  const [collapsed, setCollapsed] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    // Read persisted preference
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored === 'true') setCollapsed(true);
    } catch {
      // localStorage may be blocked in some environments
    }
    initialized.current = true;
  }, []);

  // Auto-collapse below 1024px
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1023px)');

    function handleChange(e: MediaQueryListEvent | MediaQueryList) {
      if (e.matches) {
        setCollapsed(true);
        try { localStorage.setItem(LS_KEY, 'true'); } catch { /* noop */ }
      }
    }

    // Initial check
    handleChange(mql);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(LS_KEY, String(next)); } catch { /* noop */ }
      return next;
    });
  }

  return (
    <div
      className={collapsed ? 'sidebar-nav-root is-collapsed' : 'sidebar-nav-root'}
      data-testid="sidebar-nav"
    >
      {/* Collapse toggle button */}
      <button
        type="button"
        className="sidebar-collapse-btn"
        onClick={toggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '→' : '☰'}
      </button>

      <nav className="sidebar-nav" aria-label="Primary">
        {sections.map((section) => (
          <div key={section.heading}>
            <div className="sidebar-section">{!collapsed && section.heading}</div>
            {section.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? 'sidebar-link is-active' : 'sidebar-link'}
                  title={item.label}
                >
                  <span className="sidebar-link-icon" aria-hidden>{item.icon}</span>
                  {!collapsed && (
                    <span className="sidebar-link-label">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
