import Link from 'next/link';
import { notFound } from 'next/navigation';
import { billing } from '@/modules/billing';
import { clients } from '@/modules/clients';
import { formatPeso } from '../../payroll/peso';
import { formatPhDate, formatPhInstant, dueDate } from '../_format';
import { InvoiceActions } from './invoice-actions';

const DEFAULT_PAYMENT_TERMS_DAYS = 15;

/** ⚑ placeholder marker — VAT/EWT are not yet confirmed with CGoC (contract §7.9). */
function ConfirmFlag() {
  return (
    <span style={{ color: 'var(--ochre)', fontSize: '0.8125rem', marginLeft: '0.375rem' }}>
      ⚑ confirm w/ CGoC
    </span>
  );
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;

  const invoice = await billing.getInvoiceWithLines(invoiceId);
  if (!invoice) notFound();

  const [client, config] = await Promise.all([
    clients.getClient(invoice.clientId),
    billing.getClientBillingConfig(invoice.clientId),
  ]);

  const termsDays = config?.paymentTermsDays ?? DEFAULT_PAYMENT_TERMS_DAYS;
  const clientLabel = client?.name ?? '—';

  return (
    <>
      <header className="page-header no-print">
        <div className="breadcrumb">
          <Link href="/billing" style={{ textDecoration: 'none' }}>Statements of Account</Link>{' '}
          · {invoice.soaNumber ?? 'Draft'}
        </div>
        <h1 className="page-title">Statement of Account</h1>
        <p className="page-sub">
          {invoice.status === 'draft'
            ? 'This is a draft — review the lines below, then finalize to assign the official SOA number.'
            : invoice.status === 'finalized'
              ? 'Finalized and numbered. Mark it paid once the client settles.'
              : 'This statement has been settled.'}
        </p>
      </header>

      {/* Action bar (hidden on print) */}
      <InvoiceActions invoiceId={invoice.id} status={invoice.status} />

      {/* Paid banner */}
      {invoice.status === 'paid' && (
        <div
          className="no-print"
          style={{
            marginBottom: '1.5rem',
            padding: '0.75rem 1rem',
            border: '1px solid var(--success)',
            borderRadius: 'var(--radius)',
            color: 'var(--success)',
            background: 'rgba(46, 93, 59, 0.06)',
            fontSize: '0.9375rem',
          }}
          role="status"
        >
          Paid{invoice.paidAt ? ` on ${formatPhInstant(invoice.paidAt)}` : ''}.
        </div>
      )}

      {/* ── SOA document card ─────────────────────────────────────────────── */}
      <div className="card soa-document" style={{ padding: '2rem' }}>
        {/* Issuer header — Commander Group's own document, NOT SistemaHub */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1.5rem',
            flexWrap: 'wrap',
            borderBottom: '2px solid var(--navy)',
            paddingBottom: '1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--ff-display)',
                fontSize: '1.5rem',
                fontWeight: 500,
                color: 'var(--navy)',
                letterSpacing: '-0.01em',
              }}
            >
              COMMANDER GROUP OF COMPANIES
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
              Security Services
            </div>
            <div
              style={{
                fontFamily: 'var(--ff-display)',
                fontSize: '1.125rem',
                color: 'var(--ink)',
                marginTop: '0.75rem',
              }}
            >
              Statement of Account
            </div>
          </div>

          {/* Right meta block */}
          <div style={{ textAlign: 'right', fontSize: '0.875rem' }}>
            <div className="field-label">SOA No.</div>
            <div style={{ fontFamily: 'var(--ff-mono)', marginBottom: '0.625rem' }}>
              {invoice.soaNumber ?? (
                <span style={{ color: 'var(--muted)' }}>DRAFT — not yet numbered</span>
              )}
            </div>
            <div className="field-label">Period</div>
            <div style={{ marginBottom: '0.625rem' }}>
              {formatPhDate(invoice.periodStart)} – {formatPhDate(invoice.periodEnd)}
            </div>
            <div className="field-label">Due</div>
            <div>{dueDate(invoice.periodEnd, termsDays)}</div>
          </div>
        </div>

        {/* Bill-To */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div className="field-label">Bill to</div>
          <div style={{ fontSize: '1.0625rem', fontWeight: 500, color: 'var(--ink)', marginTop: '0.25rem' }}>
            {clientLabel}
          </div>
        </div>

        {/* Lines */}
        <div className="table-wrap" style={{ marginBottom: '1.5rem' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Guard</th>
                <th>Post</th>
                <th style={{ textAlign: 'right' }}>Days</th>
                <th style={{ textAlign: 'right' }}>Rate</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--muted)', textAlign: 'center', padding: '1rem' }}>
                    No billable guard-days in this period.
                  </td>
                </tr>
              ) : (
                invoice.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <div style={{ fontFamily: 'var(--ff-mono)', fontSize: '0.8125rem', color: 'var(--muted)' }}>
                        {line.employeeCodeSnapshot}
                      </div>
                      <div>{line.employeeNameSnapshot}</div>
                    </td>
                    <td>{line.detachmentNameSnapshot}</td>
                    <td className="cell-num numeric" style={{ textAlign: 'right' }}>{line.daysWorked}</td>
                    <td className="cell-num numeric" style={{ textAlign: 'right' }}>{formatPeso(line.ratePerManday)}</td>
                    <td className="cell-num numeric" style={{ textAlign: 'right' }}>{formatPeso(line.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div style={{ maxWidth: '24rem', marginLeft: 'auto' }}>
          <TotalLine label="Subtotal" value={formatPeso(invoice.subtotal)} />
          <TotalLine
            label={<>VAT 12% <ConfirmFlag /></>}
            value={formatPeso(invoice.vatAmount)}
          />
          <TotalLine
            label={<>Less 2% EWT <ConfirmFlag /></>}
            value={`− ${formatPeso(invoice.ewtAmount)}`}
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              borderTop: '2px solid var(--navy)',
              marginTop: '0.5rem',
              paddingTop: '0.75rem',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--ff-display)',
                fontSize: '1.0625rem',
                fontWeight: 500,
                color: 'var(--navy)',
              }}
            >
              TOTAL DUE
            </div>
            <div
              className="numeric"
              style={{
                fontFamily: 'var(--ff-display)',
                fontSize: '1.75rem',
                fontWeight: 500,
                color: 'var(--navy)',
                letterSpacing: '-0.015em',
              }}
            >
              {formatPeso(invoice.totalDue)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function TotalLine({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        padding: '0.375rem 0',
        fontSize: '0.9375rem',
      }}
    >
      <div>{label}</div>
      <div className="numeric">{value}</div>
    </div>
  );
}
