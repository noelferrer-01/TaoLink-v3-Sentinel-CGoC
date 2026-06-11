import Link from 'next/link';
import { billing } from '@/modules/billing';
import { clients } from '@/modules/clients';
import { payroll } from '@/modules/payroll';
import { PageShell } from '@/components/page-shell';
import { formatPeso } from '../payroll/peso';
import { GenerateSoa } from './generate-soa';
import { ReattachButton } from './reattach-button';

// ─── Status pill helpers (mirrors payroll/page.tsx) ─────────────────────────────

function statusLabel(s: string): string {
  switch (s) {
    case 'draft': return 'Draft';
    case 'finalized': return 'Finalized';
    case 'paid': return 'Paid';
    default: return s;
  }
}

function statusClass(s: string): string {
  switch (s) {
    case 'paid': return 'is-deployed';     // green / positive
    case 'finalized': return 'is-hired';   // navy
    case 'draft': return 'is-applicant';   // muted
    default: return 'is-applicant';
  }
}

/** Parse a `start|end` period string, timezone-safe (no Date() needed). */
function parsePeriod(raw: string | undefined): { start: string; end: string } | null {
  if (!raw) return null;
  const [start, end] = raw.split('|');
  if (!start || !end) return null;
  return { start, end };
}

/** Format a YYYY-MM-DD as "Mon D, YYYY" without timezone drift. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const [invoices, clientList, payRuns] = await Promise.all([
    billing.listInvoices({}),
    clients.listClients(),
    payroll.listPayRuns(),
  ]);

  // clientId → name (listInvoices doesn't carry the client name).
  const clientName = new Map(clientList.map((c) => [c.id, c.name]));

  // Period for the Unattributed panel: ?period=start|end, else most recent pay run.
  const periodOptions = payRuns.map((r) => ({
    value: `${r.periodStart}|${r.periodEnd}`,
    label: `${r.periodStart} → ${r.periodEnd}`,
  }));
  const selectedPeriod =
    parsePeriod(params.period) ??
    (payRuns[0] ? { start: payRuns[0].periodStart, end: payRuns[0].periodEnd } : null);
  const selectedPeriodValue = selectedPeriod
    ? `${selectedPeriod.start}|${selectedPeriod.end}`
    : '';

  const unattributed = selectedPeriod
    ? await billing.listUnattributedWorkedDays(selectedPeriod)
    : [];

  return (
    <PageShell
      breadcrumb={<>Sentinel · Billing</>}
      title="Statements of Account"
      description="One SOA per client per period — each guard's days at that client × the contracted rate. Generate pulls live from DTR."
      footerHint="No statement showing up? Set the client's billing rate on its detail page, then close the DTR period and run payroll for that month first."
    >
      {/* Generate control */}
      <GenerateSoa
        clients={clientList.map((c) => ({ id: c.id, name: c.name }))}
        periods={periodOptions}
      />

      {/* Invoices table */}
      {invoices.length === 0 ? (
        <div className="empty-state">
          <h3>No statements yet</h3>
          <p>
            Once you generate a statement for a client and period above, it lands
            here. Each row opens the printable SOA.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>SOA No.</th>
                <th>Client</th>
                <th>Period</th>
                <th>Total</th>
                <th>Status</th>
                <th aria-label="Open"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td style={{ fontFamily: 'var(--ff-mono)' }}>
                    {inv.soaNumber ?? <span style={{ color: 'var(--muted)' }}>Draft</span>}
                  </td>
                  <td>
                    <div className="cell-name">
                      {clientName.get(inv.clientId) ?? (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      )}
                    </div>
                  </td>
                  <td>{inv.periodStart} → {inv.periodEnd}</td>
                  <td className="cell-num numeric">{formatPeso(inv.totalDue)}</td>
                  <td>
                    <span className={`status-pill ${statusClass(inv.status)}`}>
                      {statusLabel(inv.status)}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={`/billing/${inv.id}`}
                      className="btn btn--ghost"
                      style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Unattributed worked days — period-level, all clients */}
      <div className="section-rule" style={{ marginTop: '2.5rem' }}>
        <h2>
          Unattributed worked days
          {selectedPeriod && (
            <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '0.875rem', marginLeft: '0.5rem' }}>
              {selectedPeriod.start} → {selectedPeriod.end} · all clients
            </span>
          )}
        </h2>
      </div>

      <p className="field-hint" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
        Days a guard worked with no posting attached → unbillable until re-attached.
      </p>

      {/* Period switcher — plain GET form, works without client JS */}
      {periodOptions.length > 0 && (
        <form
          method="get"
          className="card"
          style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}
        >
          <div className="field" style={{ flex: '0 1 22rem' }}>
            <label className="field-label" htmlFor="period">Period</label>
            <select id="period" name="period" className="input" defaultValue={selectedPeriodValue}>
              {periodOptions.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn--ghost">Filter</button>
        </form>
      )}

      {!selectedPeriod ? (
        <div className="empty-state">
          <p>No pay-run periods yet — once a DTR period is closed you can check it for unattributed days here.</p>
        </div>
      ) : unattributed.length === 0 ? (
        <div className="empty-state">
          <p>No unattributed worked days for this period — every worked day is billable.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Guard</th>
                <th>Name</th>
                <th>Date</th>
                <th aria-label="Re-attach"></th>
              </tr>
            </thead>
            <tbody>
              {unattributed.map((u) => (
                <tr key={u.dtrEntryId}>
                  <td style={{ fontFamily: 'var(--ff-mono)' }}>{u.employeeCode}</td>
                  <td>{u.lastName}, {u.firstName.charAt(0)}.</td>
                  <td style={{ color: 'var(--muted)' }}>{formatDate(u.date)}</td>
                  <td><ReattachButton dtrEntryId={u.dtrEntryId} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
