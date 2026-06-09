'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { recruitment } from '@/modules/recruitment';
import type { DocStatus, DocType, Stage } from '@/modules/recruitment';
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

const createSchema = z.object({
  firstName: z.string().trim().min(1, 'Please enter the first name.'),
  lastName: z.string().trim().min(1, 'Please enter the last name.'),
  middleName: z.string().trim().optional().or(z.literal('')),
  source: z.enum(SOURCES),
  positionAppliedFor: z.enum(POSITIONS).default('GUARD'),
  isArmedPost: z.boolean().default(false),
  appliedOn: z.string().trim().regex(DATE_RE, 'Date applied must be in YYYY-MM-DD format.'),
  dateOfBirth: z.string().trim().optional().or(z.literal('')).refine((v) => !v || DATE_RE.test(v), 'Date of birth must be YYYY-MM-DD.'),
  sssNumber: z.string().trim().optional().or(z.literal('')),
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
    sssNumber: formData.get('sssNumber') ?? '',
    phone: formData.get('phone') ?? '',
    email: formData.get('email') ?? '',
    city: formData.get('city') ?? '',
    province: formData.get('province') ?? '',
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) return { kind: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const d = parsed.data;

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
      sssNumber: blank(d.sssNumber ?? null),
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
});

export async function hireAction(_prev: HireState, formData: FormData): Promise<HireState> {
  const session = await getSessionFromCookie();
  if (!session) return { kind: 'error', message: 'Your session expired. Please sign in again.' };

  const parsed = hireSchema.safeParse({
    applicantId: formData.get('applicantId') ?? '',
    employeeCode: formData.get('employeeCode') ?? '',
    basicSalary: formData.get('basicSalary') ?? '',
    hiredOn: formData.get('hiredOn') ?? '',
  });
  if (!parsed.success) return { kind: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const d = parsed.data;

  try {
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
      : `Couldn't hire: ${raw}`;
    return { kind: 'error', message };
  }
}
