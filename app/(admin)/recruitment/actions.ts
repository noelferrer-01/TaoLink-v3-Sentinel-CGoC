'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { recruitment } from '@/modules/recruitment';
import type { DocStatus, DocType, Stage, MatchKind } from '@/modules/recruitment';
import { findPersonByAnyId, findPossibleDuplicates, updatePerson, ANCHOR_ID_LABELS, type AnchorIdType } from '@/modules/persons';
import { getSessionFromCookie } from '@/modules/auth';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const blank = (v: FormDataEntryValue | null): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

function isRedirect(e: unknown): boolean {
  return (
    !!e &&
    typeof e === 'object' &&
    'digest' in e &&
    typeof (e as { digest: unknown }).digest === 'string' &&
    (e as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}

// ─── Create applicant ───────────────────────────────────────────────────────

export type FormState = { kind: 'idle' } | { kind: 'error'; message: string };

const SOURCES = ['walk_in', 'referral', 'agency', 'job_board', 'social_media', 'provincial', 'training_school', 'other'] as const;
const POSITIONS = ['GUARD', 'OFFICE_STAFF', 'SUPERVISOR', 'DRIVER', 'JANITOR', 'OTHER'] as const;
const ID_TYPES = ['philsys', 'sss', 'tin', 'passport', 'umid', 'drivers_license'] as const;

// Maps the intake form's chosen ID type to the matching createApplicant field.
const ID_FIELD = {
  philsys:         'philsysNumber',
  sss:             'sssNumber',
  tin:             'tinNumber',
  passport:        'passportNumber',
  umid:            'umidNumber',
  drivers_license: 'driversLicenseNumber',
} as const satisfies Record<(typeof ID_TYPES)[number], string>;

const createSchema = z.object({
  firstName: z.string().trim().min(1, 'Please enter the first name.'),
  lastName: z.string().trim().min(1, 'Please enter the last name.'),
  middleName: z.string().trim().optional().or(z.literal('')),
  source: z.enum(SOURCES),
  positionAppliedFor: z.enum(POSITIONS).default('GUARD'),
  isArmedPost: z.boolean().default(false),
  appliedOn: z.string().trim().regex(DATE_RE, 'Date applied must be in YYYY-MM-DD format.'),
  // DOB is required at intake — it powers duplicate + blacklist matching. The
  // government ID stays optional (provisional intake; required only at hire).
  dateOfBirth: z.string().trim().regex(DATE_RE, 'Please enter the date of birth (YYYY-MM-DD) — it powers duplicate and blacklist matching.'),
  idType: z.enum(ID_TYPES).optional().or(z.literal('')),
  idValue: z.string().trim().optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email('That email looks wrong.').optional().or(z.literal('')),
  city: z.string().trim().optional().or(z.literal('')),
  province: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
});

export async function createApplicantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSessionFromCookie();
  if (!session) return { kind: 'error', message: 'Your session expired. Please sign in again.' };

  const parsed = createSchema.safeParse({
    firstName: formData.get('firstName') ?? '',
    lastName: formData.get('lastName') ?? '',
    middleName: formData.get('middleName') ?? '',
    source: formData.get('source') ?? 'walk_in',
    positionAppliedFor: formData.get('positionAppliedFor') ?? 'GUARD',
    isArmedPost: formData.get('isArmedPost') === 'on',
    appliedOn: formData.get('appliedOn') ?? '',
    dateOfBirth: formData.get('dateOfBirth') ?? '',
    idType: formData.get('idType') ?? '',
    idValue: formData.get('idValue') ?? '',
    phone: formData.get('phone') ?? '',
    email: formData.get('email') ?? '',
    city: formData.get('city') ?? '',
    province: formData.get('province') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return { kind: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const d = parsed.data;

  // Map the (optional) chosen ID to the matching createApplicant field. A value
  // without a type is a user slip we can catch plainly; a type without a value
  // is just provisional intake (no anchor yet).
  const idValue = blank(d.idValue ?? null);
  const idType = (d.idType ?? '') as '' | (typeof ID_TYPES)[number];
  if (idValue && !idType) {
    return { kind: 'error', message: 'Pick which kind of ID you entered (PhilSys, SSS, TIN, …) — or clear the ID field.' };
  }
  const idPatch: Partial<Record<(typeof ID_FIELD)[keyof typeof ID_FIELD], string | null>> = {};
  if (idValue && idType) idPatch[ID_FIELD[idType]] = idValue;

  let createdId: string;
  try {
    const created = await recruitment.createApplicant({
      firstName: d.firstName,
      lastName: d.lastName,
      middleName: blank(d.middleName ?? null),
      source: d.source,
      positionAppliedFor: d.positionAppliedFor,
      isArmedPost: d.isArmedPost,
      appliedOn: d.appliedOn,
      dateOfBirth: blank(d.dateOfBirth ?? null),
      ...idPatch,
      phone: blank(d.phone ?? null),
      email: blank(d.email ?? null),
      city: blank(d.city ?? null),
      province: blank(d.province ?? null),
      notes: blank(d.notes ?? null),
      actorUserId: session.user.id,
    });
    createdId = created.id;
  } catch (e) {
    return { kind: 'error', message: `Couldn't add the applicant: ${e instanceof Error ? e.message : String(e)}` };
  }
  revalidatePath('/recruitment');
  redirect(`/recruitment/${createdId}`);
}

// ─── Identity lookup (intake "Look up" button) ───────────────────────────────

export type LookupResult = {
  /** A person already on file with the entered government ID. */
  knownPerson: { id: string; name: string; anchorLabel: string } | null;
  /** Persons sharing the entered name + DOB (normalized) — possible duplicates. */
  possibleDuplicates: Array<{ id: string; name: string; dateOfBirth: string | null }>;
  /** Blacklist / active-employee / concurrent-applicant flags for this identity. */
  matches: Array<{ kind: MatchKind; confidence: 'exact' | 'possible'; label: string }>;
};

/**
 * Identity-first intake lookup. Given whatever the recruiter has typed so far
 * (name, DOB, and optionally a government ID), surfaces:
 *   - a known person on file by that ID,
 *   - possible duplicate persons by name+DOB,
 *   - any blacklist / employee / in-flight-applicant matches.
 * Read-only — never writes. Returns empty on an expired session.
 */
export async function lookupPersonAction(input: {
  idType?: string;
  idValue?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
}): Promise<LookupResult> {
  const empty: LookupResult = { knownPerson: null, possibleDuplicates: [], matches: [] };
  const session = await getSessionFromCookie();
  if (!session) return empty;

  const idType = (input.idType ?? '').trim();
  const idValue = (input.idValue ?? '').trim();
  const firstName = (input.firstName ?? '').trim();
  const lastName = (input.lastName ?? '').trim();
  const dob = (input.dateOfBirth ?? '').trim() || null;
  const isIdType = (t: string): t is AnchorIdType => (ID_TYPES as readonly string[]).includes(t);

  // Known person by the entered government ID (also surfaces quarantined values).
  let knownPerson: LookupResult['knownPerson'] = null;
  if (idValue && isIdType(idType)) {
    const p = await findPersonByAnyId(idType, idValue);
    if (p) knownPerson = { id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), anchorLabel: ANCHOR_ID_LABELS[p.anchorIdType] };
  }

  // Possible duplicates by normalized name + DOB.
  let possibleDuplicates: LookupResult['possibleDuplicates'] = [];
  if (firstName && lastName && dob) {
    const dups = await findPossibleDuplicates({ firstName, lastName, dateOfBirth: dob });
    possibleDuplicates = dups.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), dateOfBirth: p.dateOfBirth }));
  }

  // Cross-checks (blacklist / active employee / concurrent applicant).
  let matches: LookupResult['matches'] = [];
  if (firstName && lastName) {
    const govId = (t: string) => (idType === t ? idValue || null : null);
    const ms = await recruitment.checkMatches({
      personId: null,
      firstName,
      lastName,
      dateOfBirth: dob,
      sssNumber: govId('sss'),
      philsysNumber: govId('philsys'),
      tinNumber: govId('tin'),
    });
    matches = ms.map((m) => ({ kind: m.kind, confidence: m.confidence, label: m.label }));
  }

  return { knownPerson, possibleDuplicates, matches };
}

// ─── Detail-page actions (form-action style; revalidate + re-render) ─────────

export async function advanceStageAction(formData: FormData): Promise<void> {
  const session = await getSessionFromCookie();
  if (!session) return;
  const id = String(formData.get('id') ?? '');
  const next = String(formData.get('next') ?? '') as Stage;
  await recruitment.advanceStage(id, next, { actorUserId: session.user.id });
  revalidatePath(`/recruitment/${id}`);
  revalidatePath('/recruitment');
}

export async function setDocumentAction(formData: FormData): Promise<void> {
  const session = await getSessionFromCookie();
  if (!session) return;
  const id = String(formData.get('id') ?? '');
  const docType = String(formData.get('docType') ?? '') as DocType;
  const status = String(formData.get('status') ?? '') as DocStatus;
  const expiresOn = blank(formData.get('expiresOn'));
  await recruitment.setDocument(id, docType, { status, expiresOn, verifiedByUserId: session.user.id });
  revalidatePath(`/recruitment/${id}`);
}

export async function rejectApplicantAction(formData: FormData): Promise<void> {
  const session = await getSessionFromCookie();
  if (!session) return;
  const id = String(formData.get('id') ?? '');
  const reason = String(formData.get('reason') ?? '').trim() || 'No reason given';
  await recruitment.rejectApplicant(id, reason, { actorUserId: session.user.id });
  revalidatePath(`/recruitment/${id}`);
  revalidatePath('/recruitment');
}

export async function withdrawApplicantAction(formData: FormData): Promise<void> {
  const session = await getSessionFromCookie();
  if (!session) return;
  const id = String(formData.get('id') ?? '');
  const reason = String(formData.get('reason') ?? '').trim() || 'No reason given';
  await recruitment.withdrawApplicant(id, reason, { actorUserId: session.user.id });
  revalidatePath(`/recruitment/${id}`);
  revalidatePath('/recruitment');
}

// ─── Hire (useActionState; returns the new employee link) ────────────────────

export type HireState =
  | { kind: 'idle' }
  | { kind: 'ok'; employeeId: string; employeeCode: string }
  | { kind: 'error'; message: string };

const hireSchema = z.object({
  applicantId: z.string().min(1),
  employeeCode: z.string().trim().min(1, 'Employee code is required.'),
  basicSalary: z.string().trim().refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, 'Monthly basic salary must be a positive number.'),
  hiredOn: z.string().trim().regex(DATE_RE, 'Date hired must be in YYYY-MM-DD format.'),
  // Optional government ID — the modal shows these fields only when the Person
  // is unanchored; anchors the Person right before the hire gate.
  idType: z.enum(ID_TYPES).optional().or(z.literal('')),
  idValue: z.string().trim().optional().or(z.literal('')),
});

export async function hireAction(_prev: HireState, formData: FormData): Promise<HireState> {
  const session = await getSessionFromCookie();
  if (!session) return { kind: 'error', message: 'Your session expired. Please sign in again.' };

  const parsed = hireSchema.safeParse({
    applicantId: formData.get('applicantId') ?? '',
    employeeCode: formData.get('employeeCode') ?? '',
    basicSalary: formData.get('basicSalary') ?? '',
    hiredOn: formData.get('hiredOn') ?? '',
    idType: formData.get('idType') ?? '',
    idValue: formData.get('idValue') ?? '',
  });
  if (!parsed.success) return { kind: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const d = parsed.data;

  const idValue = blank(d.idValue ?? null);
  const idType = (d.idType ?? '') as '' | (typeof ID_TYPES)[number];
  if (idValue && !idType) {
    return { kind: 'error', message: 'Pick which kind of ID you entered (PhilSys, SSS, TIN, …) — or clear the ID field.' };
  }

  try {
    // Anchor the Person first so the hire gate (assertAnchored) passes.
    // anchorIdType + the ID value must go TOGETHER — updatePerson never infers
    // the anchor from a bare ID value (done-sweep §5).
    if (idType && idValue) {
      const got = await recruitment.getApplicant(d.applicantId);
      if (!got) return { kind: 'error', message: 'This applicant no longer exists.' };
      await updatePerson(
        got.applicant.personId,
        { anchorIdType: idType, [ID_FIELD[idType]]: idValue },
        session.user.id,
      );
    }

    const emp = await recruitment.hireApplicant(d.applicantId, {
      employeeCode: d.employeeCode,
      basicSalary: d.basicSalary,
      hiredOn: d.hiredOn,
      actorUserId: session.user.id,
    });
    revalidatePath(`/recruitment/${d.applicantId}`);
    revalidatePath('/recruitment');
    revalidatePath('/employees');
    return { kind: 'ok', employeeId: emp.id, employeeCode: emp.employeeCode };
  } catch (e) {
    if (isRedirect(e)) throw e;
    const raw = e instanceof Error ? e.message : String(e);
    const message = raw.includes('hr_employees_code') || raw.includes('employee_code')
      ? 'That employee code is already used — pick a different one.'
      : raw.includes('already on file for another person')
      ? `${raw} Use Look up on the intake page to find the existing record before hiring.`
      : raw.includes('government ID is required')
      ? 'A government ID is required before hiring. Enter it in the ID fields above, then confirm again.'
      : `Couldn't hire: ${raw}`;
    return { kind: 'error', message };
  }
}
