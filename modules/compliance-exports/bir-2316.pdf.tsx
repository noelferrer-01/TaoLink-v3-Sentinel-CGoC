/**
 * bir-2316.pdf.tsx — React-PDF template for BIR Form 2316
 * (Certificate of Compensation Payment / Tax Withheld, Sep 2021 ENCS).
 *
 * Layout reference: BIR_2316_FORMAT.md + standard BIR 2316 form structure.
 *
 * Usage:
 *   import { renderBir2316Pdf } from './bir-2316.pdf';
 *   const buf: Buffer = await renderBir2316Pdf(employee, ytd, year);
 *
 * Missing fields (RDO, DOB, address):
 *   - Rendered as empty field box.
 *   - In dev mode (NODE_ENV !== 'production'), a red "[MISSING]" marker
 *     appears next to the label so QA can spot gaps.
 *
 * Note: this file intentionally stays under ~300 lines. Complex sub-sections
 * are broken into small helper components defined in this file.
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { EmployeeWithIdentity } from '@/modules/hr/service';
import type { YtdAggregate } from './ytd';

// ────────────────────────────────────────────────────────────────
// Employer constants (Commander Group of Companies)
// Override via env vars in production.
// ────────────────────────────────────────────────────────────────
function employerDefaults() {
  return {
    tin:     process.env['EMPLOYER_TIN']     ?? '000-000-000-000',
    name:    process.env['EMPLOYER_NAME']    ?? 'Commander Group of Companies, Inc.',
    address: process.env['EMPLOYER_ADDRESS'] ?? 'Commander Group Bldg., Philippines',
    zipCode: process.env['EMPLOYER_ZIP']     ?? '1000',
    rdoCode: process.env['EMPLOYER_RDO']     ?? '044',
  };
}

// ────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontSize: 7,
    fontFamily: 'Helvetica',
    paddingTop: 18,
    paddingBottom: 18,
    paddingHorizontal: 22,
    color: '#000',
  },
  // Page title block
  titleBlock: { textAlign: 'center', marginBottom: 4 },
  titleMain: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  titleSub: { fontSize: 8 },
  // Section header bar
  sectionHeader: {
    backgroundColor: '#2c3e50',
    color: '#fff',
    padding: '2 4',
    marginTop: 5,
    marginBottom: 2,
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
  },
  // Generic row / field layouts
  row: { flexDirection: 'row', marginBottom: 2 },
  col1: { flex: 1 },
  col2: { flex: 2 },
  col3: { flex: 3 },
  // Field box
  fieldLabel: {
    fontSize: 6,
    color: '#555',
    marginBottom: 1,
  },
  fieldValue: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    minHeight: 10,
    paddingBottom: 1,
    fontSize: 7,
  },
  // Numeric / amount fields — right-aligned
  amountValue: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    minHeight: 10,
    paddingBottom: 1,
    fontSize: 7,
    textAlign: 'right',
  },
  // Missing-field marker (dev mode)
  missing: {
    color: '#c0392b',
    fontSize: 6,
    fontFamily: 'Helvetica-Bold',
  },
  // Summary table
  summaryRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.3,
    borderBottomColor: '#ccc',
    paddingVertical: 2,
    alignItems: 'center',
  },
  summaryItemNo: { width: 18, fontSize: 6, color: '#555' },
  summaryLabel: { flex: 1, fontSize: 7 },
  summaryAmount: { width: 70, textAlign: 'right', fontSize: 7 },
  // Footer
  footer: {
    marginTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#999',
    paddingTop: 4,
    fontSize: 6,
    color: '#555',
    textAlign: 'center',
  },
});

// ────────────────────────────────────────────────────────────────
// Helper: show [MISSING] in dev mode
// ────────────────────────────────────────────────────────────────
const DEV = process.env['NODE_ENV'] !== 'production';

function MissingMarker({ show }: { show: boolean }) {
  if (!show || !DEV) return null;
  return <Text style={s.missing}> [MISSING]</Text>;
}

// ────────────────────────────────────────────────────────────────
// Helper: labeled field with underline
// ────────────────────────────────────────────────────────────────
// React-PDF style type via ReturnType pattern (avoids importing @react-pdf/types directly).
type PdfStyle = ReturnType<typeof StyleSheet.create>[string];

interface FieldProps {
  label: string;
  value?: string | null;
  style?: PdfStyle;
  amount?: boolean;
}

function Field({ label, value, style, amount }: FieldProps) {
  const isEmpty = !value;
  return (
    <View style={style ?? {}}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={s.fieldLabel}>{label}</Text>
        <MissingMarker show={isEmpty} />
      </View>
      <Text style={amount ? s.amountValue : s.fieldValue}>{value ?? ''}</Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
// Helper: format decimals for display
// ────────────────────────────────────────────────────────────────
function fmt(val: string | number): string {
  const n = Number(val);
  if (isNaN(n)) return '0.00';
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ────────────────────────────────────────────────────────────────
// Helper: format date from ISO to MM/DD/YYYY
// ────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  // Accept YYYY-MM-DD
  const parts = iso.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${m}/${d}/${y}`;
  }
  return iso;
}

// ────────────────────────────────────────────────────────────────
// Summary row helper
// ────────────────────────────────────────────────────────────────
function SummaryLine({ no, label, amount }: { no: string; label: string; amount: string }) {
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryItemNo}>{no}</Text>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={s.summaryAmount}>{amount}</Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
// Part I — Employee Information
// ────────────────────────────────────────────────────────────────
function PartI({ emp, year }: { emp: EmployeeWithIdentity; year: number }) {
  const fullName = `${emp.lastName}, ${emp.firstName}${emp.middleName ? `, ${emp.middleName}` : ''}`;
  const addressFull = [emp.addressLine1, emp.addressLine2, emp.city, emp.province]
    .filter(Boolean).join(', ');

  return (
    <>
      <Text style={s.sectionHeader}>PART I — EMPLOYEE INFORMATION</Text>
      <View style={s.row}>
        <Field label="1. For the Year" value={String(year)} style={{ width: 50, marginRight: 6 }} />
        <Field label="2. For the Period" value={`01/01/${year} – 12/31/${year}`} style={{ flex: 1, marginRight: 6 }} />
        <Field label="3. TIN" value={emp.tinNumber ?? undefined} style={{ flex: 1 }} />
      </View>
      <View style={s.row}>
        <Field label="4. Employee's Name (Last, First, Middle)" value={fullName} style={{ flex: 3, marginRight: 6 }} />
        <Field label="5. RDO Code" value={emp.rdoCode ?? undefined} style={{ width: 50 }} />
      </View>
      <View style={s.row}>
        <Field
          label="6. Registered Address"
          value={addressFull || undefined}
          style={{ flex: 3, marginRight: 6 }}
        />
        <Field
          label="6A. ZIP Code"
          value={emp.postalCode ?? undefined}
          style={{ width: 50 }}
        />
      </View>
      <View style={s.row}>
        <Field
          label="7. Date of Birth (MM/DD/YYYY)"
          value={fmtDate(emp.dateOfBirth) || undefined}
          style={{ flex: 1, marginRight: 6 }}
        />
        <Field
          label="8. Contact Number"
          value={emp.phone ?? undefined}
          style={{ flex: 1 }}
        />
      </View>
    </>
  );
}

// ────────────────────────────────────────────────────────────────
// Part II — Employer Information (Present)
// ────────────────────────────────────────────────────────────────
function PartII() {
  const emp = employerDefaults();
  return (
    <>
      <Text style={s.sectionHeader}>PART II — EMPLOYER INFORMATION (PRESENT)</Text>
      <View style={s.row}>
        <Field label="12. Employer TIN" value={emp.tin} style={{ flex: 1, marginRight: 6 }} />
        <Field label="13. Employer's Name" value={emp.name} style={{ flex: 3 }} />
      </View>
      <View style={s.row}>
        <Field label="14. Registered Address" value={emp.address} style={{ flex: 3, marginRight: 6 }} />
        <Field label="14A. ZIP Code" value={emp.zipCode} style={{ width: 50 }} />
        <Field label="15. RDO Code" value={emp.rdoCode} style={{ width: 40, marginLeft: 6 }} />
      </View>
      <View style={s.row}>
        <Text style={s.fieldLabel}>Type of Employer: </Text>
        <Text style={s.fieldValue}>Main  ☑    Secondary  ☐</Text>
      </View>
    </>
  );
}

// ────────────────────────────────────────────────────────────────
// Part III — Previous Employer (placeholder, Slice 2 deferred)
// ────────────────────────────────────────────────────────────────
function PartIII() {
  return (
    <>
      <Text style={s.sectionHeader}>PART III — EMPLOYER INFORMATION (PREVIOUS — if applicable)</Text>
      <View style={s.row}>
        <Field label="16. TIN" value={undefined} style={{ flex: 1, marginRight: 6 }} />
        <Field label="17. Employer's Name" value={undefined} style={{ flex: 3 }} />
      </View>
      <View style={s.row}>
        <Field label="18. Registered Address" value={undefined} style={{ flex: 3, marginRight: 6 }} />
        <Field label="18A. ZIP Code" value={undefined} style={{ width: 50 }} />
      </View>
    </>
  );
}

// ────────────────────────────────────────────────────────────────
// Part IVA — Summary of Tax Withheld
// ────────────────────────────────────────────────────────────────
interface PartIVAProps { ytd: YtdAggregate }

function PartIVA({ ytd }: PartIVAProps) {
  const gross        = Number(ytd.gross);
  const nonTaxable   = Number(ytd.sssEe) + Number(ytd.philhealthEe) + Number(ytd.pagibigEe);
  const taxablePresent = Math.max(0, gross - nonTaxable);
  const grossTaxable = taxablePresent; // no prior-employer income in Slice 2
  const withheld     = Number(ytd.wtax);

  return (
    <>
      <Text style={s.sectionHeader}>PART IVA — SUMMARY OF COMPENSATION INCOME AND TAX WITHHELD</Text>
      <SummaryLine no="19" label="Gross Compensation Income from Present Employer" amount={fmt(gross)} />
      <SummaryLine no="20" label="Less: Total Non-Taxable / Exempt Compensation (SSS + PhilHealth + Pag-IBIG)" amount={fmt(nonTaxable)} />
      <SummaryLine no="21" label="Taxable Compensation from Present Employer (19 – 20)" amount={fmt(taxablePresent)} />
      <SummaryLine no="22" label="Add: Taxable Compensation from Previous Employer" amount={fmt(0)} />
      <SummaryLine no="23" label="Gross Taxable Compensation Income (21 + 22)" amount={fmt(grossTaxable)} />
      <SummaryLine no="25A" label="Amount of Taxes Withheld — Present Employer" amount={fmt(withheld)} />
      <SummaryLine no="25B" label="Amount of Taxes Withheld — Previous Employer" amount={fmt(0)} />
      <SummaryLine no="26" label="Total Amount of Taxes Withheld as Adjusted" amount={fmt(withheld)} />
    </>
  );
}

// ────────────────────────────────────────────────────────────────
// Part IVB — Itemized Breakdown (using YTD aggregator)
// ────────────────────────────────────────────────────────────────
function PartIVB({ ytd }: { ytd: YtdAggregate }) {
  return (
    <>
      <Text style={s.sectionHeader}>PART IVB — ITEMIZED COMPENSATION AND TAX WITHHELD</Text>
      <SummaryLine no="32"  label="SSS Employee Share (Non-Taxable)"          amount={fmt(ytd.sssEe)} />
      <SummaryLine no="33"  label="PhilHealth Employee Share (Non-Taxable)"   amount={fmt(ytd.philhealthEe)} />
      <SummaryLine no="34"  label="Pag-IBIG Employee Share (Non-Taxable)"     amount={fmt(ytd.pagibigEe)} />
      <SummaryLine no="36"  label="Basic Salary (Taxable Compensation)"       amount={fmt(ytd.gross)} />
      <SummaryLine no="52"  label="Gross Compensation (Taxable — subtotal)"   amount={fmt(ytd.gross)} />
      <SummaryLine no="net" label="Net Pay (for reference)"                   amount={fmt(ytd.net)} />
    </>
  );
}

// ────────────────────────────────────────────────────────────────
// Main document component
// ────────────────────────────────────────────────────────────────
interface Bir2316Props {
  employee: EmployeeWithIdentity;
  ytd: YtdAggregate;
  year: number;
}

function Bir2316Document({ employee, ytd, year }: Bir2316Props) {
  return (
    <Document
      title={`BIR Form 2316 — ${employee.lastName}, ${employee.firstName} — ${year}`}
      author={employerDefaults().name}
      subject="Certificate of Compensation Payment / Tax Withheld"
      creator="Sentinel HRIS"
    >
      <Page size="A4" style={s.page}>
        {/* ── Header ── */}
        <View style={s.titleBlock}>
          <Text style={s.titleMain}>BIR FORM 2316</Text>
          <Text style={s.titleSub}>Certificate of Compensation Payment / Tax Withheld</Text>
          <Text style={s.titleSub}>Republic of the Philippines — Bureau of Internal Revenue (Sep 2021 ENCS)</Text>
          <Text style={s.titleSub}>For the Year Ended December 31, {year}</Text>
        </View>

        <PartI emp={employee} year={year} />
        <PartII />
        <PartIII />
        <PartIVA ytd={ytd} />
        <PartIVB ytd={ytd} />

        {/* ── Certification note ── */}
        <View style={s.footer}>
          <Text>
            I/We declare, under the penalties of perjury, that this certificate has been made in
            good faith, verified by me, and to the best of my knowledge and belief, is true and
            correct pursuant to the provisions of the National Internal Revenue Code, as amended,
            and the regulations issued under authority thereof.
          </Text>
          <Text style={{ marginTop: 4 }}>Generated by Sentinel HRIS — {new Date().toISOString().split('T')[0]}</Text>
        </View>
      </Page>
    </Document>
  );
}

// ────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────
export async function renderBir2316Pdf(
  employee: EmployeeWithIdentity,
  ytd: YtdAggregate,
  year: number,
): Promise<Buffer> {
  return renderToBuffer(<Bir2316Document employee={employee} ytd={ytd} year={year} />);
}

export { Bir2316Document };
