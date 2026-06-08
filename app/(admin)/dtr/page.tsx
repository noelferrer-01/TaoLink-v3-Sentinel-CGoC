import Link from 'next/link';
import { assignments } from '@/modules/assignments';
import { clients } from '@/modules/clients';
import { dtr } from '@/modules/dtr';
import { payrollCalendars } from '@/modules/payroll-calendars';
import { PageShell } from '@/components/page-shell';
import { Pagination, clampPageSize } from '@/components/pagination';
import { CountdownBadge } from '@/components/countdown-badge';
import { ClosePeriodButton } from './close-period-button';
import { FillRowButton, FillAllButton } from './fill-buttons';
import { pickerPeriods, periodForDate, currentPeriod, countDays } from './period';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default async function DTRPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const safePeriod = params.start ? periodForDate(params.start) : currentPeriod();
  const totalDays = countDays(safePeriod.start, safePeriod.end);
  const today = todayIso();
  const page = parsePage(params.page);
  const pageSize = clampPageSize(params.size);

  // The visible employee grid is paginated; the Mark-all-worked action must
  // still see every employee in the period, so it gets its own cheap ID-only
  // query alongside the joined page.
  const [pageResult, allEmployeeIds, closed, allClients] = await Promise.all([
    assignments.listOverlappingEmployeesPage(safePeriod.start, safePeriod.end, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    assignments.listOverlappingEmployeeIds(safePeriod.start, safePeriod.end),
    dtr.isPeriodClosed(safePeriod.start, safePeriod.end),
    clients.listClients(),
  ]);
  const { rows: guards, total: totalGuards } = pageResult;

  // Resolve cut-off + payday via the first client's calendar (or fallback
  // defaults if there are no clients yet). Multi-client per-period dashboard
  // is Slice 3+ — for the v1 single-client demo, the first client is the
  // payroll basis.
  const periodStartDate = new Date(safePeriod.start + 'T00:00:00Z');
  const periodEndDate = new Date(safePeriod.end + 'T00:00:00Z');
  const calendarOwner = allClients[0] ?? null;
  const resolved = calendarOwner
    ? await payrollCalendars.resolveForPeriod(calendarOwner.id, periodStartDate, periodEndDate)
    : null;

  // Dedup happens at the DB level via DISTINCT ON in listOverlappingEmployeesPage,
  // so each guard appears once even after a mid-period transfer.
  const visibleGuardIds = guards.map((g) => g.employee.id);

  const summary = visibleGuardIds.length > 0
    ? await dtr.summarizePeriod(visibleGuardIds, safePeriod.start, safePeriod.end)
    : [];
  const recordedByGuard = new Map(summary.map((s) => [s.employeeId, s.recordedDays]));

  const periods = pickerPeriods();

  const toolbar = resolved ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}>
      <CountdownBadge label="Cut-off" dueDate={resolved.dtrCutoffDate} today={today} />
      <CountdownBadge label="Payday" dueDate={resolved.paydayDate} today={today} />
    </div>
  ) : undefined;

  return (
    <PageShell
      breadcrumb={<>Sentinel · Payroll · Time records</>}
      title="Time records"
      description="Record which days each employee worked. When you close the period, Sentinel locks the DTR and computes payslips automatically. Sentinel uses two cutoffs per month (the 1st–15th and the 16th–end of month)."
      toolbar={toolbar}
      footerHint="Close the period when every employee shows ✓ All days. Closing locks the DTR and triggers payslip computation."
    >
      <form method="get" action="/dtr" className="page-toolbar" style={{ alignItems: 'center' }}>
        {/* Preserve the rows-per-page preference across period changes. */}
        <input type="hidden" name="size" value={String(pageSize)} />
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
          · {totalDays} days · {totalGuards} active {totalGuards === 1 ? 'employee' : 'employees'}
        </div>
      </form>

      {totalGuards === 0 ? (
        <div className="empty-state">
          <h3>No employees to record for this period</h3>
          <p>
            Time records are only created for employees with an active assignment.
            Assign at least one employee to a detachment first, then come back
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
                period as a worked day (7am–3pm) for{' '}
                <strong>all {totalGuards} active {totalGuards === 1 ? 'employee' : 'employees'}</strong>{' '}
                (not just this page). You can override individual days later
                (coming soon — for now, use the database directly for exceptions).
              </div>
              <FillAllButton employeeIds={allEmployeeIds} start={safePeriod.start} end={safePeriod.end} />
            </div>
          ) : null}

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
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

          <Pagination
            total={totalGuards}
            page={page}
            pageSize={pageSize}
            searchParams={params}
            basePath="/dtr"
            unitLabel="employee"
          />

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
    </PageShell>
  );
}
