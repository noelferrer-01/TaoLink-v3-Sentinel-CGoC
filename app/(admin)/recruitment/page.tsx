import Link from 'next/link';
import { recruitment, STAGE_LABELS, SOURCE_LABELS, type Stage } from '@/modules/recruitment';
import { EMPLOYMENT_TYPE_LABELS } from '@/modules/hr';
import { PageShell } from '@/components/page-shell';
import { Pagination, clampPageSize } from '@/components/pagination';

const STAGES = ['applied', 'contacted', 'documents', 'hired', 'rejected', 'withdrawn'] as const;

function isStage(v: string | undefined): v is Stage {
  return v != null && (STAGES as readonly string[]).includes(v);
}

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

const STAGE_TONE: Record<Stage, string> = {
  applied: 'var(--muted)',
  contacted: 'var(--navy-soft)',
  documents: 'var(--ochre)',
  hired: 'var(--success)',
  rejected: 'var(--danger)',
  withdrawn: 'var(--muted)',
};

export default async function RecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const stage = isStage(params.stage) ? params.stage : undefined;
  const page = parsePage(params.page);
  const pageSize = clampPageSize(params.size);

  const { rows, total } = await recruitment.listApplicantsPage({
    query: q,
    stage,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const toolbar = (
    <Link href="/recruitment/new" className="btn">
      + New applicant
    </Link>
  );

  return (
    <PageShell
      title="Applicants"
      description="Everyone who has applied — guards and office staff. Move them through screening; Hire creates their employee record. Past applicants stay here permanently."
      toolbar={toolbar}
      footerHint="Click a row to open it: tick clearance documents, advance the stage, and hire. Any blacklist or terminated-guard match shows on the applicant's page."
    >
      {/* Filter bar — plain GET form, works without client JS */}
      <form method="get" className="card" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div className="field" style={{ flex: '1 1 16rem' }}>
          <label className="field-label" htmlFor="q">Search name or SSS</label>
          <input id="q" name="q" className="input" defaultValue={q} placeholder="e.g. dela cruz" autoComplete="off" />
        </div>
        <div className="field" style={{ flex: '0 1 12rem' }}>
          <label className="field-label" htmlFor="stage">Stage</label>
          <select id="stage" name="stage" className="input" defaultValue={stage ?? ''}>
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>{STAGE_LABELS[s]}</option>
            ))}
          </select>
        </div>
        {pageSize !== 50 && <input type="hidden" name="size" value={pageSize} />}
        <button type="submit" className="btn btn--ghost">Filter</button>
      </form>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>No applicants {q || stage ? 'match your filter' : 'yet'}.</p>
          <div className="empty-state-actions">
            <Link href="/recruitment/new" className="btn">+ New applicant</Link>
          </div>
        </div>
      ) : (
        <div className="table-wrap"><table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Position</th>
              <th>Stage</th>
              <th>Source</th>
              <th>Applied</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link href={`/recruitment/${a.id}`} style={{ fontWeight: 600 }}>
                    {a.lastName}, {a.firstName}
                  </Link>
                </td>
                <td>{EMPLOYMENT_TYPE_LABELS[a.positionAppliedFor]}</td>
                <td>
                  <span style={{ color: STAGE_TONE[a.pipelineStage], fontWeight: 600 }}>
                    {STAGE_LABELS[a.pipelineStage]}
                  </span>
                </td>
                <td style={{ color: 'var(--muted)' }}>{SOURCE_LABELS[a.source]}</td>
                <td style={{ color: 'var(--muted)' }}>{a.appliedOn}</td>
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
        basePath="/recruitment"
        unitLabel="applicant"
      />
    </PageShell>
  );
}
