import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  recruitment,
  STAGE_LABELS,
  SOURCE_LABELS,
  DOC_TYPE_LABELS,
  DOC_STATUS_LABELS,
  requiredDocsFor,
  MATCH_KIND_LABELS,
  type Stage,
  type DocStatus,
} from '@/modules/recruitment';
import { hr, EMPLOYMENT_TYPE_LABELS } from '@/modules/hr';
import { ANCHOR_ID_LABELS } from '@/modules/persons';
import { PageShell } from '@/components/page-shell';
import { Field, TwoCol, Muted } from '@/components/form';
import { advanceStageAction, setDocumentAction, rejectApplicantAction, withdrawApplicantAction } from '../actions';
import { HireModal } from './hire-modal';

const DOC_STATUSES: DocStatus[] = ['pending', 'submitted', 'verified', 'expired'];
const TERMINAL: Stage[] = ['hired', 'rejected', 'withdrawn'];

export default async function ApplicantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const got = await recruitment.getApplicant(id);
  if (!got) notFound();
  // Identity is sourced from the linked Person — the applicant row is a role
  // record only (legacy identity columns retired at 0024).
  const { applicant: a, identity: ident, documents } = got;

  const matches = await recruitment.checkMatches({
    personId: a.personId,
    excludeApplicantId: a.id,
    firstName: ident.firstName,
    lastName: ident.lastName,
    dateOfBirth: ident.dateOfBirth,
    sssNumber: ident.sssNumber,
  });

  // The anchor ID can be any unique type, not just SSS — show whichever is on file.
  const anchorValue =
    ident.anchorIdType === 'sss' ? ident.sssNumber
    : ident.anchorIdType === 'philsys' ? ident.philsysNumber
    : ident.anchorIdType === 'tin' ? ident.tinNumber
    : null;

  const isActive = !TERMINAL.includes(a.pipelineStage);
  const requiredSet = new Set(requiredDocsFor(a.isArmedPost));
  const allVerified = documents
    .filter((d) => requiredSet.has(d.docType))
    .every((d) => d.status === 'verified');

  // Forward (non-terminal, non-hire) stage the recruiter can advance to.
  // 'documents' → 'hired' is the Hire modal, not a plain stage advance.
  const forwardStages: Stage[] =
    a.pipelineStage === 'applied' ? ['contacted']
    : a.pipelineStage === 'contacted' ? ['documents']
    : [];

  const defaultCode = a.pipelineStage === 'documents' ? await hr.generateNextEmployeeCode('CG-') : 'CG-10001';

  return (
    <PageShell
      breadcrumb={<><Link href="/recruitment">Applicants</Link> · {ident.lastName}, {ident.firstName}</>}
      title={`${ident.firstName} ${ident.lastName}`}
      description={`${EMPLOYMENT_TYPE_LABELS[a.positionAppliedFor]}${a.isArmedPost ? ' · armed post' : ''} · ${STAGE_LABELS[a.pipelineStage]}`}
      footerHint={isActive ? 'Tick clearance documents, advance the stage, then Hire to create the employee record.' : undefined}
    >
      {/* Blacklist / terminated match banner */}
      {matches.length > 0 && (
        <div role="alert" style={{
          border: '1px solid var(--danger)', background: 'rgba(139, 46, 31, 0.06)',
          borderRadius: 'var(--radius)', padding: '0.875rem 1rem', marginBottom: '1rem',
        }}>
          <div style={{ fontFamily: 'var(--ff-mono)', letterSpacing: '0.08em', textTransform: 'uppercase',
            fontSize: '0.6875rem', color: 'var(--danger)', marginBottom: '0.5rem' }}>
            ⚠ Possible match — review before hiring
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.125rem', color: 'var(--ink-soft)', fontSize: '0.875rem' }}>
            {matches.map((m) => (
              <li key={`${m.kind}-${m.refId}`} style={{ marginBottom: '0.25rem' }}>
                {MATCH_KIND_LABELS[m.kind]}
                {' '}({m.confidence === 'exact' ? 'exact match' : 'possible match'}): {m.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* "ID still needed" nudge — provisional applicants can move through the
          pipeline, but a government ID is required before hiring. Never blocks.
          Derived from the live Person anchor so it can never go stale. */}
      {isActive && ident.anchorIdType === 'none' && (
        <div style={{
          border: '1px solid var(--ochre)', background: 'rgba(184, 134, 47, 0.10)',
          borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1rem',
          color: 'var(--ochre)', fontSize: '0.875rem',
        }}>
          <strong>Government ID still needed.</strong>{' '}
          You can keep screening this applicant, but a PhilSys, SSS, or TIN number must be on file before they can be hired.
          {' '}You&apos;ll be asked to enter it at the <strong>Hire</strong> step.
        </div>
      )}

      {/* Profile */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <dl style={{ margin: 0 }}>
          <TwoCol>
            <Field label="Position applied for">{EMPLOYMENT_TYPE_LABELS[a.positionAppliedFor]}</Field>
            <Field label="Source">{SOURCE_LABELS[a.source]}</Field>
            <Field label="Date applied">{a.appliedOn}</Field>
            <Field label="Date of birth">{ident.dateOfBirth ?? <Muted>Not set</Muted>}</Field>
            <Field label="Government ID">
              {ident.anchorIdType !== 'none' && anchorValue
                ? `${ANCHOR_ID_LABELS[ident.anchorIdType]}: ${anchorValue}`
                : <Muted>Not set — provisional</Muted>}
            </Field>
            <Field label="Phone">{ident.phone ?? <Muted>Not set</Muted>}</Field>
            <Field label="Email">{ident.email ?? <Muted>Not set</Muted>}</Field>
            <Field label="Location">{[ident.city, ident.province].filter(Boolean).join(', ') || <Muted>Not set</Muted>}</Field>
          </TwoCol>
          {a.notes && <div style={{ marginTop: '1rem' }}><Field label="Notes">{a.notes}</Field></div>}
          {a.pipelineStage === 'hired' && a.hiredEmployeeId && (
            <div style={{ marginTop: '1rem' }}>
              <Field label="Hired">
                <Link href={`/employees/${a.hiredEmployeeId}`}>View employee record →</Link>
              </Field>
            </div>
          )}
          {(a.pipelineStage === 'rejected' || a.pipelineStage === 'withdrawn') && (
            <div style={{ marginTop: '1rem' }}>
              <Field label={STAGE_LABELS[a.pipelineStage]}>{a.outcomeReason ?? <Muted>No reason recorded</Muted>}</Field>
            </div>
          )}
        </dl>
      </div>

      {isActive && (
        <>
          {/* Clearance documents */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: '1.25rem', color: 'var(--navy)', margin: '0 0 0.75rem' }}>
              Clearance documents
            </h2>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Document</th><th>Status</th><th>Expires</th><th></th></tr></thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td>{DOC_TYPE_LABELS[d.docType]}{requiredSet.has(d.docType) && <span aria-hidden style={{ color: 'var(--ochre)' }}> *</span>}</td>
                    <td colSpan={3}>
                      <form action={setDocumentAction} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="docType" value={d.docType} />
                        <select name="status" className="input" defaultValue={d.status} style={{ maxWidth: '9rem' }}>
                          {DOC_STATUSES.map((s) => <option key={s} value={s}>{DOC_STATUS_LABELS[s]}</option>)}
                        </select>
                        <input type="date" name="expiresOn" className="input" defaultValue={d.expiresOn ?? ''} style={{ maxWidth: '11rem' }} />
                        <button type="submit" className="btn btn--ghost btn--sm">Save</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <p className="field-hint" style={{ marginTop: '0.5rem' }}>
              <span aria-hidden style={{ color: 'var(--ochre)' }}>*</span> required before hiring.{' '}
              {allVerified ? '✓ All required documents verified — ready to hire.' : 'Verify all required documents to be ready to hire.'}
            </p>
          </div>

          {/* Actions */}
          <div className="card" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {forwardStages.map((s) => (
              <form key={s} action={advanceStageAction}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="next" value={s} />
                <button type="submit" className="btn">Advance to {STAGE_LABELS[s]} →</button>
              </form>
            ))}

            {a.pipelineStage === 'documents' && (
              <HireModal applicantId={a.id} defaultCode={defaultCode} today={a.appliedOn} readyToHire={allVerified} needsId={ident.anchorIdType === 'none'} />
            )}

            <details style={{ marginLeft: 'auto' }}>
              <summary className="btn btn--ghost" style={{ listStyle: 'none', cursor: 'pointer' }}>Reject / Withdraw</summary>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                <form action={rejectApplicantAction} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input type="hidden" name="id" value={a.id} />
                  <input name="reason" className="input" placeholder="Reason for rejection" style={{ maxWidth: '16rem' }} />
                  <button type="submit" className="btn btn--ghost">Reject</button>
                </form>
                <form action={withdrawApplicantAction} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input type="hidden" name="id" value={a.id} />
                  <input name="reason" className="input" placeholder="Reason they withdrew" style={{ maxWidth: '16rem' }} />
                  <button type="submit" className="btn btn--ghost">Withdraw</button>
                </form>
              </div>
            </details>
          </div>
        </>
      )}
    </PageShell>
  );
}
