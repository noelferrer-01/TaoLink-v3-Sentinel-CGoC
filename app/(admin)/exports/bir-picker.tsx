'use client';

import { useState } from 'react';

export type EmployeeOption = { id: string; label: string };

export function BirPicker({
  employees,
  defaultYear,
}: {
  employees: EmployeeOption[];
  defaultYear: number;
}) {
  const [employeeId, setEmployeeId] = useState<string>(employees[0]?.id ?? '');
  const [year, setYear] = useState<number>(defaultYear);

  if (employees.length === 0) {
    return (
      <p style={{ color: 'var(--muted)' }}>
        No guards yet. Import or add at least one guard.
      </p>
    );
  }

  return (
    <div className="form-stack">
      <label className="field">
        <span className="field-label">Guard</span>
        <select
          className="input"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
        >
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Year</span>
        <input
          className="input"
          type="number"
          min={2020}
          max={2099}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          style={{ maxWidth: 140 }}
        />
      </label>
      <a
        className="btn"
        href={`/api/exports/bir-2316/${employeeId}/${year}`}
        download={`2316-${year}.pdf`}
        style={{ justifySelf: 'start' }}
      >
        Download BIR 2316 (PDF) →
      </a>
      <p className="field-hint" style={{ marginTop: '0.25rem' }}>
        Downloads the BIR Form 2316 as a filled PDF. If the employee is
        missing RDO code, date of birth, or address, those fields will be
        blank — edit the employee record to complete them before filing.
      </p>
    </div>
  );
}
