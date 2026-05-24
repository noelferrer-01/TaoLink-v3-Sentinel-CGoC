import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getSessionFromCookie } from '@/modules/auth';
import { SidebarNav } from './_nav';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSessionFromCookie();
  if (!session) redirect('/login');

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/dashboard" className="masthead">
          <div className="masthead-title">Sentinel</div>
          <div className="masthead-rule">
            <span className="masthead-tag">Commander Group</span>
          </div>
        </Link>

        <SidebarNav />

        <div className="sidebar-foot">
          <div className="sidebar-foot-user">
            Signed in as
            <strong>{session.user.email}</strong>
          </div>
          <form
            action="/api/auth/logout"
            method="post"
            className="sidebar-foot-form"
          >
            <button type="submit">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
