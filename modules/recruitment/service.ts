/**
 * Recruitment service — applicant pipeline, document checklist, blacklist, and
 * the hire handoff to HR. Every mutation records an audit row and publishes an
 * event, mirroring modules/hr and modules/assignments.
 */

import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { getDb } from '@/core/db';
import { audit } from '@/modules/audit';
import { events } from '@/modules/events';
import { hr } from '@/modules/hr';
import { employees } from '@/modules/hr/schema';
import {
  applicants,
  applicantDocuments,
  blacklist,
  type Applicant,
  type ApplicantDocument,
  type BlacklistEntry,
} from './schema';
import { ALLOWED_TRANSITIONS, requiredDocsFor, type DocType, type DocStatus, type Stage } from './labels';

// ─── createApplicant ───────────────────────────────────────────────────────────

export type CreateApplicantInput = {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  dateOfBirth?: string | null;
  sssNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  source: Applicant['source'];
  positionAppliedFor?: Applicant['positionAppliedFor'];
  isArmedPost?: boolean;
  appliedOn: string;
  notes?: string | null;
  actorUserId?: string | null;
};

export async function createApplicant(input: CreateApplicantInput): Promise<Applicant> {
  const db = getDb();
  const [created] = await db
    .insert(applicants)
    .values({
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      middleName: input.middleName ?? null,
      dateOfBirth: input.dateOfBirth ?? null,
      sssNumber: input.sssNumber ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      city: input.city ?? null,
      province: input.province ?? null,
      source: input.source,
      positionAppliedFor: input.positionAppliedFor ?? 'GUARD',
      isArmedPost: input.isArmedPost ?? false,
      appliedOn: input.appliedOn,
      notes: input.notes ?? null,
    })
    .returning();
  if (!created) throw new Error('[recruitment/createApplicant] insert returned no row');

  // Seed the required-doc checklist (all pending).
  const docs = requiredDocsFor(created.isArmedPost).map((docType) => ({ applicantId: created.id, docType }));
  await db.insert(applicantDocuments).values(docs);

  await audit.record({
    actor: input.actorUserId ?? null,
    action: 'recruitment.applicant.created',
    target: { kind: 'recruitment_applicant', id: created.id },
    payload: { name: `${created.firstName} ${created.lastName}` },
  });
  await events.publish('recruitment.applicant.created', { id: created.id });
  return created;
}

// ─── getApplicant ───────────────────────────────────────────────────────────────

export async function getApplicant(
  id: string,
): Promise<{ applicant: Applicant; documents: ApplicantDocument[] } | null> {
  const db = getDb();
  const [a] = await db.select().from(applicants).where(eq(applicants.id, id));
  if (!a) return null;
  const documents = await db.select().from(applicantDocuments).where(eq(applicantDocuments.applicantId, id));
  return { applicant: a, documents };
}

// ─── listApplicantsPage ───────────────────────────────────────────────────────

export async function listApplicantsPage(opts: {
  query?: string;
  stage?: Stage;
  limit: number;
  offset: number;
}): Promise<{ rows: Applicant[]; total: number }> {
  const db = getDb();
  const filters = [];
  if (opts.query?.trim()) {
    const q = `%${opts.query.trim()}%`;
    filters.push(or(ilike(applicants.firstName, q), ilike(applicants.lastName, q), ilike(applicants.sssNumber, q)));
  }
  if (opts.stage) filters.push(eq(applicants.pipelineStage, opts.stage));
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select()
    .from(applicants)
    .where(where)
    .orderBy(desc(applicants.appliedOn))
    .limit(opts.limit)
    .offset(opts.offset);
  const countRows = await db.select({ count: sql<number>`count(*)::int` }).from(applicants).where(where);
  return { rows, total: countRows[0]?.count ?? 0 };
}

// ─── advanceStage ───────────────────────────────────────────────────────────────

export async function advanceStage(
  id: string,
  next: Stage,
  opts: { actorUserId?: string | null } = {},
): Promise<Applicant> {
  const db = getDb();
  const [current] = await db.select().from(applicants).where(eq(applicants.id, id));
  if (!current) throw new Error('Applicant not found.');
  if (!ALLOWED_TRANSITIONS[current.pipelineStage].includes(next)) {
    throw new Error(`Cannot move an applicant from ${current.pipelineStage} to ${next}.`);
  }
  const [updated] = await db
    .update(applicants)
    .set({ pipelineStage: next, updatedAt: new Date() })
    .where(eq(applicants.id, id))
    .returning();
  await audit.record({
    actor: opts.actorUserId ?? null,
    action: 'recruitment.applicant.stage_changed',
    target: { kind: 'recruitment_applicant', id },
    payload: { from: current.pipelineStage, to: next },
  });
  await events.publish('recruitment.applicant.stage_changed', { id, from: current.pipelineStage, to: next });
  return updated!;
}

// ─── setDocument ───────────────────────────────────────────────────────────────

export async function setDocument(
  applicantId: string,
  docType: DocType,
  patch: { status: DocStatus; expiresOn?: string | null; notes?: string | null; verifiedByUserId?: string | null },
): Promise<void> {
  const db = getDb();
  await db
    .update(applicantDocuments)
    .set({
      status: patch.status,
      expiresOn: patch.expiresOn ?? null,
      notes: patch.notes ?? null,
      verifiedByUserId: patch.verifiedByUserId ?? null,
      verifiedOn: patch.status === 'verified' ? new Date().toISOString().slice(0, 10) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(applicantDocuments.applicantId, applicantId), eq(applicantDocuments.docType, docType)));
}

// ─── reject / withdraw (terminal) ───────────────────────────────────────────────

async function endApplicant(
  id: string,
  stage: 'rejected' | 'withdrawn',
  reason: string,
  actorUserId?: string | null,
): Promise<Applicant> {
  const db = getDb();
  const [current] = await db.select().from(applicants).where(eq(applicants.id, id));
  if (!current) throw new Error('Applicant not found.');
  if (!ALLOWED_TRANSITIONS[current.pipelineStage].includes(stage)) {
    throw new Error(`Cannot ${stage} an applicant who is already ${current.pipelineStage}.`);
  }
  const [updated] = await db
    .update(applicants)
    .set({ pipelineStage: stage, outcomeReason: reason, updatedAt: new Date() })
    .where(eq(applicants.id, id))
    .returning();
  await audit.record({
    actor: actorUserId ?? null,
    action: `recruitment.applicant.${stage}`,
    target: { kind: 'recruitment_applicant', id },
    payload: { reason },
  });
  await events.publish(`recruitment.applicant.${stage}`, { id, reason });
  return updated!;
}

export const rejectApplicant = (id: string, reason: string, opts: { actorUserId?: string | null } = {}) =>
  endApplicant(id, 'rejected', reason, opts.actorUserId);
export const withdrawApplicant = (id: string, reason: string, opts: { actorUserId?: string | null } = {}) =>
  endApplicant(id, 'withdrawn', reason, opts.actorUserId);

// ─── checkMatches (blacklist + terminated auto-flag) ────────────────────────────

export type MatchKind = 'terminated_employee' | 'blacklist';
export type Match = { kind: MatchKind; confidence: 'exact' | 'possible'; label: string; refId: string };

export async function checkMatches(input: {
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  sssNumber?: string | null;
}): Promise<Match[]> {
  const db = getDb();
  const matches: Match[] = [];
  const sameName = (last: string) => last.trim().toLowerCase() === input.lastName.trim().toLowerCase();

  const terminated = await db.select().from(employees).where(eq(employees.status, 'terminated'));
  for (const e of terminated) {
    if (input.sssNumber && e.sssNumber && e.sssNumber === input.sssNumber) {
      matches.push({ kind: 'terminated_employee', confidence: 'exact',
        label: `${e.lastName}, ${e.firstName} (${e.employeeCode}) — terminated`, refId: e.id });
    } else if (input.dateOfBirth && e.dateOfBirth === input.dateOfBirth && sameName(e.lastName)) {
      matches.push({ kind: 'terminated_employee', confidence: 'possible',
        label: `${e.lastName}, ${e.firstName} (${e.employeeCode}) — terminated`, refId: e.id });
    }
  }

  const bl = await db.select().from(blacklist).where(eq(blacklist.active, true));
  for (const b of bl) {
    if (input.sssNumber && b.sssNumber && b.sssNumber === input.sssNumber) {
      matches.push({ kind: 'blacklist', confidence: 'exact', label: `${b.lastName}, ${b.firstName} — ${b.reason}`, refId: b.id });
    } else if (input.dateOfBirth && b.dateOfBirth === input.dateOfBirth && sameName(b.lastName)) {
      matches.push({ kind: 'blacklist', confidence: 'possible', label: `${b.lastName}, ${b.firstName} — ${b.reason}`, refId: b.id });
    }
  }
  return matches;
}

// ─── blacklist writers ──────────────────────────────────────────────────────────

export async function addToBlacklist(input: {
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  sssNumber?: string | null;
  reason: string;
  sourceEmployeeId?: string | null;
  addedByUserId?: string | null;
}): Promise<BlacklistEntry> {
  const db = getDb();
  const [created] = await db
    .insert(blacklist)
    .values({
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      dateOfBirth: input.dateOfBirth ?? null,
      sssNumber: input.sssNumber ?? null,
      reason: input.reason,
      sourceEmployeeId: input.sourceEmployeeId ?? null,
      addedByUserId: input.addedByUserId ?? null,
    })
    .returning();
  if (!created) throw new Error('[recruitment/addToBlacklist] insert returned no row');
  await audit.record({
    actor: input.addedByUserId ?? null,
    action: 'recruitment.blacklist.added',
    target: { kind: 'recruitment_blacklist', id: created.id },
    payload: { reason: input.reason },
  });
  await events.publish('recruitment.blacklist.added', { id: created.id });
  return created;
}

export async function listBlacklist(): Promise<BlacklistEntry[]> {
  return getDb().select().from(blacklist).where(eq(blacklist.active, true)).orderBy(desc(blacklist.createdAt));
}

export async function removeFromBlacklist(id: string, opts: { actorUserId?: string | null } = {}): Promise<void> {
  const db = getDb();
  await db.update(blacklist).set({ active: false, updatedAt: new Date() }).where(eq(blacklist.id, id));
  await audit.record({
    actor: opts.actorUserId ?? null,
    action: 'recruitment.blacklist.removed',
    target: { kind: 'recruitment_blacklist', id },
    payload: {},
  });
}

// ─── hireApplicant (ADR 0009 handoff) ───────────────────────────────────────────

export type HireMeta = {
  basicSalary: number | string;
  hiredOn: string;
  employeeCode?: string;
  actorUserId?: string | null;
};

export async function hireApplicant(applicantId: string, meta: HireMeta) {
  const db = getDb();
  const [a] = await db.select().from(applicants).where(eq(applicants.id, applicantId));
  if (!a) throw new Error('Applicant not found.');
  if (a.pipelineStage !== 'documents') {
    throw new Error('Only applicants with completed documents can be hired.');
  }

  const employeeCode = meta.employeeCode ?? (await hr.generateNextEmployeeCode('CG-'));

  // Handoff per ADR 0009: Recruitment.hireApplicant → HR.createEmployee.
  const employee = await hr.createEmployee({
    employeeCode,
    firstName: a.firstName,
    middleName: a.middleName,
    lastName: a.lastName,
    basicSalary: meta.basicSalary,
    hiredOn: meta.hiredOn,
    employmentType: a.positionAppliedFor,
    email: a.email,
    phone: a.phone,
    dateOfBirth: a.dateOfBirth,
    addressLine1: a.addressLine1,
    addressLine2: a.addressLine2,
    city: a.city,
    province: a.province,
    sssNumber: a.sssNumber,
    actorUserId: meta.actorUserId ?? null,
  });

  // Back-link + mark hired (terminal).
  await db
    .update(applicants)
    .set({ pipelineStage: 'hired', hiredEmployeeId: employee.id, updatedAt: new Date() })
    .where(eq(applicants.id, applicantId));

  await audit.record({
    actor: meta.actorUserId ?? null,
    action: 'recruitment.applicant.hired',
    target: { kind: 'recruitment_applicant', id: applicantId },
    payload: { employeeId: employee.id, employeeCode },
  });
  await events.publish('recruitment.applicant.hired', { id: applicantId, employeeId: employee.id });
  return employee;
}
