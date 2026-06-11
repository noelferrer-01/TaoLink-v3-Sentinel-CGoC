import {
  CRED_TYPE_LABELS,
  CRED_STATUS_LABELS,
  deriveCredState,
  READINESS_CRED_SET,
  CRED_WINDOW_DAYS,
  type CredType,
  type CredState,
  type PersonCredential,
} from '@/modules/persons';
import { addCredentialAction, updateCredentialAction } from './actions';

const CRED_STATE_LABELS: Record<CredState, string> = {
  valid:    'Valid',
  expiring: 'Expiring',
  expired:  'Expired',
  revoked:  'Revoked',
  pending:  'Pending',
};

// Stored statuses the clerk can pick (the derived display state adds "expiring").
const EDITABLE_STATUSES: Array<[string, string]> = Object.entries(CRED_STATUS_LABELS);

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function CredChip({ state }: { state: CredState }) {
  return <span className={`status-pill is-cred-${state}`}>{CRED_STATE_LABELS[state]}</span>;
}

const ochreStar = <span aria-hidden style={{ color: 'var(--ochre)' }}> *</span>;
const ltopfNote = (
  <div className="field-hint" style={{ marginTop: '0.125rem' }}>firearm link unverified</div>
);

interface Props {
  employeeId: string;
  isArmedPost: boolean;
  credentials: PersonCredential[];
  /** Manila "today", passed from the page so state derivation is request-stable. */
  today: string;
}

/**
 * Employee "Licences & clearances" panel (Slice 3b, design §3b-i). Lists the
 * Person's credential wallet with a derived Valid/Expiring/Expired/Revoked/
 * Pending chip per row, plus a MISSING (required) row for each required
 * credential the guard lacks. LTOPF always carries the "firearm link
 * unverified" caveat (ADR 0018 — never a clean all-clear). Server-rendered with
 * inline form actions, mirroring the recruitment document checklist.
 */
export function LicencesPanel({ employeeId, isArmedPost, credentials, today }: Props) {
  const requiredSet = new Set(READINESS_CRED_SET(isArmedPost));
  const heldTypes = new Set(credentials.map((c) => c.credType));
  const missing = [...requiredSet].filter((t) => !heldTypes.has(t));
  const credTypeOptions = Object.entries(CRED_TYPE_LABELS) as Array<[CredType, string]>;

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: '1.25rem', color: 'var(--navy)', margin: '0 0 0.25rem' }}>
        Licences &amp; clearances
      </h2>
      <p className="field-hint" style={{ margin: '0 0 0.75rem' }}>
        The guard&rsquo;s licence wallet. <span aria-hidden style={{ color: 'var(--ochre)' }}>*</span> marks a
        credential {isArmedPost ? 'an armed-post' : 'this'} guard is required to keep current.
      </p>

      <div className="table-wrap"><table className="table">
        <thead>
          <tr><th>Type</th><th>State</th><th>Number</th><th>Expires</th><th></th></tr>
        </thead>
        <tbody>
          {credentials.map((c) => {
            const window = CRED_WINDOW_DAYS[c.credType] ?? 60;
            const state = deriveCredState(c.expiresOn, c.status, today, window);
            const isLtopf = c.credType === 'ltopf_license';
            return (
              <tr key={c.id}>
                <td>
                  {CRED_TYPE_LABELS[c.credType]}{requiredSet.has(c.credType) && ochreStar}
                  {isLtopf && ltopfNote}
                </td>
                <td><CredChip state={state} /></td>
                <td colSpan={3}>
                  <form action={updateCredentialAction} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input type="hidden" name="employeeId" value={employeeId} />
                    <input type="hidden" name="credId" value={c.id} />
                    <input name="credNumber" className="input" defaultValue={c.credNumber ?? ''} placeholder="Number" style={{ maxWidth: '10rem' }} />
                    <input name="expiresOn" type="date" className="input" defaultValue={c.expiresOn ?? ''} style={{ maxWidth: '11rem' }} />
                    <select name="status" className="input" defaultValue={c.status} style={{ maxWidth: '8rem' }}>
                      {EDITABLE_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <button type="submit" className="btn btn--ghost btn--sm">Save</button>
                  </form>
                </td>
              </tr>
            );
          })}

          {missing.map((t) => (
            <tr key={`missing-${t}`}>
              <td>
                {CRED_TYPE_LABELS[t]}{ochreStar}
                {t === 'ltopf_license' && ltopfNote}
              </td>
              <td><span className="status-pill is-cred-missing">Missing (required)</span></td>
              <td colSpan={3}>
                <form action={addCredentialAction} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="hidden" name="employeeId" value={employeeId} />
                  <input type="hidden" name="credType" value={t} />
                  <input type="hidden" name="status" value="valid" />
                  <input name="credNumber" className="input" placeholder="Number" style={{ maxWidth: '10rem' }} />
                  <input name="expiresOn" type="date" className="input" style={{ maxWidth: '11rem' }} />
                  <button type="submit" className="btn btn--ghost btn--sm">Add</button>
                </form>
              </td>
            </tr>
          ))}

          {credentials.length === 0 && missing.length === 0 && (
            <tr><td colSpan={5}><span className="field-hint">No credentials on file yet.</span></td></tr>
          )}
        </tbody>
      </table></div>

      <p className="field-hint" style={{ marginTop: '0.5rem' }}>
        Hire copies an applicant&rsquo;s verified clearances here automatically. Use the form below to add others.
      </p>

      {/* Add any credential (incl. a renewed licence or a non-required one). */}
      <details style={{ marginTop: '0.75rem' }}>
        <summary style={{ cursor: 'pointer', color: 'var(--navy)', fontWeight: 500 }}>Add a licence or clearance</summary>
        <form action={addCredentialAction} className="form-stack" style={{ marginTop: '0.75rem', gap: '0.75rem' }}>
          <input type="hidden" name="employeeId" value={employeeId} />
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: '1 1 12rem' }}>
              <span className="field-label">Type</span>
              <select name="credType" className="input" defaultValue="nbi_clearance">
                {credTypeOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="field" style={{ flex: '1 1 8rem' }}>
              <span className="field-label">Status</span>
              <select name="status" className="input" defaultValue="valid">
                {EDITABLE_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: '1 1 10rem' }}>
              <span className="field-label">Number</span>
              <input name="credNumber" className="input" />
            </label>
            <label className="field" style={{ flex: '1 1 10rem' }}>
              <span className="field-label">Issuing body</span>
              <input name="issuingBody" className="input" />
            </label>
            <label className="field" style={{ flex: '1 1 9rem' }}>
              <span className="field-label">Issued on</span>
              <input name="issuedOn" type="date" className="input" />
            </label>
            <label className="field" style={{ flex: '1 1 9rem' }}>
              <span className="field-label">Expires on</span>
              <input name="expiresOn" type="date" className="input" />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Notes</span>
            <input name="notes" className="input" placeholder="Optional — e.g. assigned firearm, renewal reference." />
          </label>
          <div><button type="submit" className="btn">Add credential</button></div>
        </form>
      </details>
    </div>
  );
}
