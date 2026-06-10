'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { hr } from '@/modules/hr';
import { getSessionFromCookie } from '@/modules/auth';

/**
 * Form state shape — mirrors the `createClientAction` pattern. The success path
 * never returns; it throws NEXT_REDIRECT which Next.js handles. Errors come back
 * to the form with a plain-language message.
 */
export type FormState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string };

const EMPLOYMENT_TYPES = ['GUARD', 'OFFICE_STAFF', 'SUPERVISOR', 'DRIVER', 'JANITOR', 'OTHER'] as const;
const PAY_FREQUENCIES = ['MONTHLY', 'SEMI_MONTHLY'] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
  employeeCode: z.string().trim().min(1, 'Please enter an employee code.'),
  firstName: z.string().trim().min(1, 'Please enter the first name.'),
  lastName: z.string().trim().min(1, 'Please enter the last name.'),
  email: z
    .string()
    .trim()
    .email('That email address looks wrong — check for typos.')
    .optional()
    .or(z.literal('')),
  employmentType: z.enum(EMPLOYMENT_TYPES).default('GUARD'),
  basicSalary: z
    .string()
    .trim()
    .min(1, 'Please enter the monthly basic salary.')
    .refine((v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0;
    }, 'Monthly basic salary must be a positive number.'),
  payFrequency: z.enum(PAY_FREQUENCIES).default('SEMI_MONTHLY'),
  hiredOn: z
    .string()
    .trim()
    .min(1, 'Please enter the date hired.')
    .regex(DATE_RE, 'Date hired must be in YYYY-MM-DD format.'),
  rdoCode: z.string().trim().max(3, 'RDO code is at most 3 characters.').optional().or(z.literal('')),
  dateOfBirth: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || DATE_RE.test(v), 'Date of birth must be in YYYY-MM-DD format.'),
  addressLine1: z.string().trim().optional().or(z.literal('')),
  addressLine2: z.string().trim().optional().or(z.literal('')),
  city: z.string().trim().optional().or(z.literal('')),
  province: z.string().trim().optional().or(z.literal('')),
  postalCode: z.string().trim().max(4, 'Postal code is at most 4 characters.').optional().or(z.literal('')),
});

const blank = (v: string | undefined): string | null =>
  v && v.trim() !== '' ? v.trim() : null;

export async function createEmployeeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSessionFromCookie();
  if (!session) {
    return { kind: 'error', message: 'Your session expired. Please sign in again.' };
  }

  const parsed = schema.safeParse({
    employeeCode: formData.get('employeeCode') ?? '',
    firstName: formData.get('firstName') ?? '',
    lastName: formData.get('lastName') ?? '',
    email: formData.get('email') ?? '',
    employmentType: formData.get('employmentType') ?? 'GUARD',
    basicSalary: formData.get('basicSalary') ?? '',
    payFrequency: formData.get('payFrequency') ?? 'SEMI_MONTHLY',
    hiredOn: formData.get('hiredOn') ?? '',
    rdoCode: formData.get('rdoCode') ?? '',
    dateOfBirth: formData.get('dateOfBirth') ?? '',
    addressLine1: formData.get('addressLine1') ?? '',
    addressLine2: formData.get('addressLine2') ?? '',
    city: formData.get('city') ?? '',
    province: formData.get('province') ?? '',
    postalCode: formData.get('postalCode') ?? '',
  });

  if (!parsed.success) {
    return {
      kind: 'error',
      message: parsed.error.issues[0]?.message ?? 'Please check the form.',
    };
  }

  const d = parsed.data;

  try {
    const created = await hr.createEmployee({
      employeeCode: d.employeeCode.trim(),
      firstName: d.firstName.trim(),
      lastName: d.lastName.trim(),
      email: blank(d.email),
      employmentType: d.employmentType,
      basicSalary: d.basicSalary.trim(),
      payFrequency: d.payFrequency,
      hiredOn: d.hiredOn.trim(),
      rdoCode: blank(d.rdoCode),
      dateOfBirth: blank(d.dateOfBirth),
      addressLine1: blank(d.addressLine1),
      addressLine2: blank(d.addressLine2),
      city: blank(d.city),
      province: blank(d.province),
      postalCode: blank(d.postalCode),
      actorUserId: session.user.id,
    });
    revalidatePath('/employees');
    redirect(`/employees/${created.id}`);
  } catch (e) {
    // Next.js redirect() throws a special error we must let pass through.
    if (
      e &&
      typeof e === 'object' &&
      'digest' in e &&
      typeof (e as { digest: unknown }).digest === 'string' &&
      (e as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw e;
    }
    const raw = e instanceof Error ? e.message : String(e);
    // (No email branch: email uniqueness was retired at T12 — persons.email is
    // non-unique by design, so createEmployee no longer throws on shared emails.)
    let message: string;
    if (raw.includes('hr_employees_code_uq')) {
      message =
        'That employee code is already used. Pick a different one — codes must be unique.';
    } else {
      message = `Couldn't add the employee: ${raw}`;
    }
    return { kind: 'error', message };
  }
}
