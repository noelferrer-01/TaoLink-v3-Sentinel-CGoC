/**
 * Shared intro paragraph for the BIR 2316 fields section. Used by both the
 * employee detail edit form and the Add Employee form so the wording —
 * including the RDO acronym expansion — stays in lockstep.
 */
export function BirSectionIntro() {
  return (
    <p style={{ color: 'var(--ink-soft)', margin: 0, fontSize: '0.875rem' }}>
      The fields below are needed for the year-end BIR 2316 form. They can be
      left blank for now and filled in later. <strong>RDO</strong> = Revenue
      District Office, the 3-character BIR district code (e.g. 044).
    </p>
  );
}
