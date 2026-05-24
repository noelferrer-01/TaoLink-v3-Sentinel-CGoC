'use client';

/**
 * AdminShellWrapper — client wrapper that syncs sidebar collapsed state
 * to the `.admin-shell` grid so the main content area adjusts width.
 *
 * This must be a client component because it reads localStorage and listens
 * to the custom 'sentinel:sidebar-toggle' event dispatched by SidebarNav.
 */

import { useEffect, useState, type ReactNode } from 'react';

const LS_KEY = 'sentinel.sidebar.collapsed';

export function AdminShellWrapper({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Initialise from localStorage
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored === 'true') setCollapsed(true);
    } catch { /* noop */ }

    // Poll localStorage for changes made by SidebarNav
    // (simpler than a custom event bus for this case)
    function onStorage(e: StorageEvent) {
      if (e.key === LS_KEY) {
        setCollapsed(e.newValue === 'true');
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Also observe the sidebar nav element's class for immediate same-tab sync
  useEffect(() => {
    const sidebar = document.getElementById('admin-sidebar');
    if (!sidebar) return;

    const observer = new MutationObserver(() => {
      const nav = sidebar.querySelector('[data-testid="sidebar-nav"]');
      const isCollapsed = nav?.classList.contains('is-collapsed') ?? false;
      setCollapsed(isCollapsed);
    });

    observer.observe(sidebar, { subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className={collapsed ? 'admin-shell is-sidebar-collapsed' : 'admin-shell'}>
      {children}
    </div>
  );
}
