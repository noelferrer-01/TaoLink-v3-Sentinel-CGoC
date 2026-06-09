import { recruitment } from '@/modules/recruitment';
import { PageShell } from '@/components/page-shell';
import { Muted } from '@/components/form';
import { BlacklistForm } from './blacklist-form';
import { removeFromBlacklistAction } from './actions';

export default async function BlacklistPage() {
  const entries = await recruitment.listBlacklist();

  return (
    <PageShell
      breadcrumb="Sentinel · Recruitment · Blacklist"
      title="Blacklist"
      description="Guards who must not be re-hired. Anyone matching these names (or SSS numbers) is flagged with a red warning on their applicant page and on the hire screen."
      footerHint="Matching uses SSS number when available (exact), otherwise name + date of birth (a prompt to check, not proof)."
    >
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: '1.25rem', color: 'var(--navy)', margin: '0 0 0.75rem' }}>
          Add someone to the blacklist
        </h2>
        <BlacklistForm />
      </div>

      {entries.length === 0 ? (
        <div className="empty-state"><p>No one is blacklisted.</p></div>
      ) : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Name</th><th>Date of birth</th><th>SSS</th><th>Reason</th><th></th></tr></thead>
          <tbody>
            {entries.map((b) => (
              <tr key={b.id}>
                <td style={{ fontWeight: 600 }}>{b.lastName}, {b.firstName}</td>
                <td>{b.dateOfBirth ?? <Muted>—</Muted>}</td>
                <td>{b.sssNumber ?? <Muted>—</Muted>}</td>
                <td>{b.reason}</td>
                <td>
                  <form action={removeFromBlacklistAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <button type="submit" className="btn btn--ghost btn--sm">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </PageShell>
  );
}
