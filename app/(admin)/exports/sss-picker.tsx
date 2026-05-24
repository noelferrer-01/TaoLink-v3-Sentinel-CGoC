'use client';

import { useState } from 'react';

export type RunOption = {
  id: string;
  label: string;
  status: string;
};

export function SssPicker({ runs }: { runs: RunOption[] }) {
  const [selected, setSelected] = useState<string>(runs[0]?.id ?? '');
  if (runs.length === 0) {
    return (
      <p style={{ color: 'var(--muted)' }}>
        No pay runs yet. Close a DTR period to create one.
      </p>
    );
  }

  return (
    <div className="form-stack">
      <label className="field">
        <span className="field-label">Pay run</span>
        <select
          className="input"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label} ({r.status})
            </option>
          ))}
        </select>
      </label>
      <a
        className="btn"
        href={`/api/exports/sss-r3/${selected}`}
        download
        style={{ justifySelf: 'start' }}
      >
        Download SSS R-3 CSV →
      </a>
    </div>
  );
}
