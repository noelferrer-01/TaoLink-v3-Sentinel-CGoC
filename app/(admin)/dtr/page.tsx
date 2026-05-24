import Link from 'next/link';
import { assignments } from '@/modules/assignments';
import { dtr } from '@/modules/dtr';
import { ClosePeriodButton } from './close-period-button';
import { FillRowButton, FillAllButton } from './fill-buttons';
import { pickerPeriods, periodForDate, currentPeriod, countDays } from './period';

export default async function DTRPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  const params = await searchParams;
  const safePeriod = params.start ? periodForDate(params.start) : currentPeriod();
  const totalDays = countDays(safePeriod.start, safePeriod.end);

  const [active, closed] = await Promise.all([
    assignments.listAssignmentsOverlappingPeriod(safePeriod.start, safePeriod.end),
    dtr.isPeriodClosed(safePeriod.start, safePeriod.end),
  ]);

  // Dedupe by employee — a guard may show twice if they had a transfer, but
  // for DTR we only care once per period.
  const seen = new Set<string>();
  const guards = active.filter((a) => {
    if (seen.has(a.employee.id)) return false;
    seen.add(a.employee.id);
    return true;
  });
  const guardIds = guards.map((g) => g.employee.id);

  const summary = guardIds.length > 0
    ? await dtr.summarizePeriod(guardIds, safePeriod.start, safePeriod.end)
    : [];
  const recordedByGuard = new Map(summary.map((s) => [s.employeeId, s.recordedDays]));

  const periods = pickerPeriods();

  return (
    <>
      <header className="page-header">
        <div className="breadcrumb">Sentinel · Payroll</div>
        <h1 className="page-title">Time records</h1>
        <p className="page-sub">
          Record which days each guard worked. When you close the period,
          Sentinel locks the DTR and computes payslips automatically. Sentinel
          uses two cutoffs per month (the 1<sup>st</sup>–15<sup>th</sup> and
          the 16<sup>th</sup>–end of month).
        </p>
      </header>

      <form method="get" action="/dtr" className="page-toolbar" style={{ alignItems: 'center' }}>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem' }}>
          <span className="field-label" style={{ margin: 0 }}>Period</span>
          <select
            name="start"
            className="input"
            defaultValue={safePeriod.start}
            style={{ minWidth: 220 }}
          >
            {periods.map((p) => (
              <option key={p.start} value={p.start}>
                {p.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn--ghost" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8125rem' }}>
            Show
          </button>
        </label>
        <div className="page-toolbar-meta" style={{ marginLeft: 'auto' }}>
          {closed ? (
            <span style={{ color: 'var(--danger)' }}>● Closed</span>
          ) : (
            <span style={{ color: 'var(--success)' }}>● Open</span>
          )}{' '}
          · {totalDays} days · {guards.length} active {guards.length === 1 ? 'guard' : 'guards'}
        </div>
      </form>

      {guards.length === 0 ? (
        <div className="empty-state">
          <h3>No guards to record for this period</h3>
          <p>
            Time records are only created for guards with an active assignment.
            Assign at least one guard to a detachment first, then come back
            here.
          </p>
          <div className="empty-state-actions">
            <Link href="/assignments" className="btn btn--ghost">
              Open Assignments →
            </Link>
          </div>
        </div>
      ) : (
        <>
          {!closed ? (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.9375rem', marginBottom: '0.75rem', color: 'var(--ink-soft)' }}>
                <strong>Quick fill:</strong> mark every empty day in this
                period as a worked day (7am–3pm) for every active guard. You
                can override individual days later (coming soon — for now, use
                the database directly for exceptions).
              </div>
              <FillAllButton employeeIds={guardIds} start={safePeriod.start} end={safePeriod.end} />
            </div>
          ) : null}

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Guard</th>
                  <th>Detachment</th>
                  <th className="cell-num">Days recorded</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {guards.map((a) => {
                  const recorded = recordedByGuard.get(a.employee.id) ?? 0;
                  const full = recorded >= totalDays;
                  return (
                    <tr key={a.employee.id}>
                      <td>
                        <div className="cell-name">
                          {a.employee.lastName}, {a.employee.firstName}
                        </div>
                        <div className="cell-sub" style={{ fontFamily: 'var(--ff-mono)' }}>
                          {a.employee.employeeCode}
                        </div>
                      </td>
                      <td>
                        <div>{a.detachment.name}</div>
                        <div className="cell-sub">{a.client.name}</div>
                      </td>
                      <td className="cell-num">
                        <span
                          className="status-pill"
                          style={{
                            color: full ? 'var(--success)' : 'var(--muted)',
                            borderColor: full ? 'var(--success)' : 'var(--rule-strong)',
                          }}
                        >
                          {recorded} / {totalDays}
                        </span>
                      </td>
                      <td>
                        {!closed && recorded < totalDays ? (
                          <FillRowButton
                            employeeId={a.employee.id}
                            start={safePeriod.start}
                            end={safePeriod.end}
                            label={`${a.employee.firstName} ${a.employee.lastName}`}
                          />
                        ) : full ? (
                          <span style={{ color: 'var(--success)', fontFamily: 'var(--ff-mono)', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                            ✓ All days
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--rule)' }}>
            {closed ? (
              <p style={{ color: 'var(--ink-soft)' }}>
                This period is locked. Open the{' '}
                <Link href="/payroll" style={{ color: 'var(--navy)', textDecoration: 'underline' }}>
                  Pay runs page
                </Link>{' '}
                to view payslips.
              </p>
            ) : (
              <ClosePeriodButton
                start={safePeriod.start}
                end={safePeriod.end}
                label={safePeriod.label}
              />
            )}
          </div>
        </>
      )}

      <p className="footnote">Slice 1 · Phase 8 · DTR · Per-cell editing is a Slice-2 follow-up</p>
    </>
  );
}
