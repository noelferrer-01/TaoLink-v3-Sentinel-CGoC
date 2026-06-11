import Link from 'next/link';
import { hr, READINESS_KIND_LABELS, FIREARM_LINK_UNVERIFIED_LABEL, type ReadinessKind } from '@/modules/hr';
import { CRED_TYPE_LABELS } from '@/modules/persons';
import { PageShell } from '@/components/page-shell';
import { Pagination, clampPageSize } from '@/components/pagination';

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default async function ReadinessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const armedOnly = params.armed === 'true';
  const page = parsePage(params.page);
  const pageSize = clampPageSize(params.size);

  const { rows, total } = await hr.listReadinessIssues({
    armedOnly,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  return (
    <PageShell
      title="Licence readiness"
      description="Guards who are missing or about to lose a licence they are required to keep current. Each licence is flagged on its own renewal lead time — firearms (LTOPF) and SOSIA show 90 days ahead, others sooner. A present firearms licence still shows a caveat because the firearm-to-guard link isn't tracked yet."
      footerHint="Click a guard to open their record and add or renew the licence on their Licences & clearances panel."
    >
      {/* Filter bar — plain GET form, works without client JS */}
      <form method="get" className="card" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div className="field" style={{ flex: '0 1 14rem' }}>
          <label className="field-label" htmlFor="armed">Posts</label>
          <select id="armed" name="armed" className="input" defaultValue={armedOnly ? 'true' : ''}>
            <option value="">All guards</option>
            <option value="true">Armed posts only</option>
          </select>
        </div>
        {pageSize !== 50 && <input type="hidden" name="size" value={pageSize} />}
        <button type="submit" className="btn btn--ghost">Filter</button>
      </form>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>No licence issues {armedOnly ? 'for armed-post guards' : 'on file'}. Everyone required is current.</p>
        </div>
      ) : (
        <div className="table-wrap"><table className="table">
          <thead>
            <tr>
              <th>Guard</th>
              <th>Licence / clearance</th>
              <th>Issue</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((issue) => (
              <tr key={`${issue.employeeId}-${issue.credType}`}>
                <td>
                  <Link href={`/employees/${issue.employeeId}`} style={{ fontWeight: 600, fontFamily: 'var(--ff-mono)' }}>
                    {issue.employeeCode}
                  </Link>
                </td>
                <td>{CRED_TYPE_LABELS[issue.credType]}</td>
                <td>
                  <span className={`status-pill is-cred-${issue.kind}`}>
                    {READINESS_KIND_LABELS[issue.kind as ReadinessKind]}
                  </span>
                  {/* Firearm caveat rides alongside the state — shown for a valid
                      LTOPF AND when it's expiring/expired/revoked (ADR 0018). */}
                  {issue.firearmLinkUnverified && (
                    <span className="status-pill is-cred-unverified" style={{ marginLeft: '0.35rem' }}>
                      {FIREARM_LINK_UNVERIFIED_LABEL}
                    </span>
                  )}
                </td>
                <td style={{ color: 'var(--muted)' }}>{formatDate(issue.expiresOn)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        searchParams={params}
        basePath="/recruitment/readiness"
        unitLabel="issue"
      />
    </PageShell>
  );
}
