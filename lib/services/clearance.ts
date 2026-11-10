import 'server-only';
import { cache } from 'react';
import { db, type Db, type Tx } from '@/lib/db';
import { ApiError } from '@/lib/result';
import { TERM_LABEL } from '@/lib/constants';
import { cut } from '@/lib/input';
import { approvalText, type ApprovalHow } from '@/lib/officeAutomation';
import type { ItemStatus, Prisma, Role, Term } from '@/generated/prisma/client';

/* ---------- §5.4 current term ---------- */

export type CurrentTerm = { academicYearId: number; label: string; term: Term; termLabel: string };

/** The current academic year and its newest opened term (1st Semester when none is open). Null without a current year. */
export async function loadCurrentTerm(tx: Db = db): Promise<CurrentTerm | null> {
  const year = await tx.academicYear.findFirst({ where: { isCurrent: true } });
  if (!year) return null;
  const newest = await tx.clearance.findFirst({ where: { academicYearId: year.id }, orderBy: { term: 'desc' }, select: { term: true } });
  const term = newest?.term ?? 'first_semester';
  return { academicYearId: year.id, label: year.label, term, termLabel: TERM_LABEL[term] };
}

/** Per-request cached version for pages and actions outside a transaction. */
export const currentTerm = cache(() => loadCurrentTerm());

export const termText = (t: CurrentTerm) => `${t.termLabel}, A.Y ${t.label}`;

/* ---------- §5.2 opening a clearance ---------- */

/** The headline of an item no one at the office has looked at yet. */
export const DEFAULT_TASK = 'Awaiting office review';

/** The four default strings for a new pending item (also used when an office is added to open clearances). */
export function defaultItem(officeName: string) {
  return {
    status: 'pending' as const,
    task: DEFAULT_TASK,
    remarks: 'Awaiting review',
    description: `${officeName} has not reviewed your account yet.`,
    nextStep: `Wait for ${officeName} to review your account, or visit the office.`,
  };
}

/** Idempotent: returns the existing clearance for (student, year, term) if there is one. */
export async function openClearance(tx: Tx, studentId: number, academicYearId: number, term: Term) {
  const existing = await tx.clearance.findUnique({ where: { studentId_academicYearId_term: { studentId, academicYearId, term } } });
  if (existing) return { id: existing.id, created: false };
  const offices = await tx.office.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  const c = await tx.clearance.create({ data: { studentId, academicYearId, term } });
  if (offices.length) {
    await tx.clearanceItem.createMany({ data: offices.map((o) => ({ clearanceId: c.id, officeId: o.id, ...defaultItem(o.name) })) });
  }
  return { id: c.id, created: true };
}

/* ---------- §5.1 the only way to change an item's status ---------- */

export type Actor = { id: number; role: Role; officeId: number | null };

export async function updateClearanceItem(
  tx: Tx,
  input: {
    itemId: number;
    status: ItemStatus;
    task?: string | null; // null/undefined = keep current
    remarks?: string | null;
    description?: string | null;
    nextStep: string | null; // always written; null clears it
    note?: string | null; // clearance_item_logs.note
    actor: Actor;
    skipOfficeCheck?: boolean; // only the student evidence-upload path
  },
) {
  const item = await tx.clearanceItem.findUnique({
    where: { id: input.itemId },
    include: { office: true, clearance: { include: { student: true } } },
  });
  if (!item) throw new ApiError(404, 'update_rejected', 'Clearance item not found.');
  if (!input.skipOfficeCheck) {
    const a = input.actor;
    if (a.role === 'student' || (a.role === 'staff' && a.officeId !== item.officeId)) {
      throw new ApiError(403, 'update_rejected', "You can't update another office's requirements.");
    }
  }

  const becameApproved = input.status === 'approved' && item.status !== 'approved';
  const updated = await tx.clearanceItem.update({
    where: { id: item.id },
    data: {
      status: input.status,
      task: input.task || item.task,
      remarks: input.remarks || item.remarks,
      description: input.description || item.description,
      // Entering approved clears next_step and stamps approved_at; any other status clears approved_at.
      nextStep: becameApproved ? null : input.nextStep,
      approvedAt: becameApproved ? new Date() : input.status === 'approved' ? item.approvedAt : null,
      updatedById: input.actor.id,
    },
  });

  // Log and tell the student only when the status actually changed.
  if (item.status !== input.status) {
    await tx.clearanceItemLog.create({
      data: { itemId: item.id, oldStatus: item.status, newStatus: input.status, note: input.note ?? null, changedById: input.actor.id },
    });
    const office = item.office.name;
    await tx.notification.create({
      data: {
        userId: item.clearance.student.userId,
        itemId: item.id,
        tone: input.status,
        title: cut(input.status === 'approved'
          ? `${office} cleared you`
          : input.status === 'needs_action'
            ? `${office} needs action`
            : `${office} is reviewing`
        , 120),
        body: cut(input.status === 'pending' ? updated.task : updated.description, 255),
      },
    });
  }
  return updated;
}

/* ---------- Approving many items at once (Approve selected, auto-clear) ---------- */

/**
 * Approves every item matching `where` that isn't approved yet and has no upload waiting for review, the way
 * updateClearanceItem() approves one: stamps approved_at, clears next_step, logs the change and tells the student.
 * The caller scopes `where` to what the actor may change; `actor` is null for the scheduler. A few queries in all,
 * however many items there are. Returns how many were approved, per office name.
 */
export async function approveItems(
  tx: Tx,
  input: { where: Prisma.ClearanceItemWhereInput; how: ApprovalHow; actor: Actor | null },
): Promise<{ approved: number; offices: Map<string, number> }> {
  const where: Prisma.ClearanceItemWhereInput = {
    AND: [input.where, { status: { not: 'approved' } }, { submissions: { none: { status: 'submitted' } } }],
  };
  const items = await tx.clearanceItem.findMany({
    where,
    select: {
      id: true,
      status: true,
      officeId: true,
      office: { select: { name: true } },
      clearance: { select: { student: { select: { userId: true } } } },
    },
  });

  // One update per office and old status, so each log row records the status it came from. The update repeats
  // the checks, so an item that changed in the meantime is left as it is.
  const groups = new Map<string, typeof items>();
  for (const i of items) {
    const key = `${i.officeId}:${i.status}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  const now = new Date();
  const changed: typeof items = [];
  for (const group of groups.values()) {
    const text = approvalText(group[0].office.name, input.how);
    const rows = await tx.clearanceItem.updateManyAndReturn({
      where: { AND: [where, { id: { in: group.map((i) => i.id) } }, { status: group[0].status }] },
      data: {
        status: 'approved',
        remarks: text.remarks,
        description: text.description,
        nextStep: null,
        approvedAt: now,
        updatedById: input.actor?.id ?? null,
        updatedAt: now,
      },
      select: { id: true },
    });
    const ok = new Set(rows.map((r) => r.id));
    changed.push(...group.filter((i) => ok.has(i.id)));
  }
  if (!changed.length) return { approved: 0, offices: new Map() };

  // An item that never had a requirement shouldn't keep saying it's awaiting review.
  await tx.clearanceItem.updateMany({
    where: { id: { in: changed.map((i) => i.id) }, task: DEFAULT_TASK },
    data: { task: approvalText('', input.how).clearedTask, updatedAt: now },
  });

  await tx.clearanceItemLog.createMany({
    data: changed.map((i) => ({
      itemId: i.id,
      oldStatus: i.status,
      newStatus: 'approved' as const,
      note: approvalText(i.office.name, input.how).note,
      changedById: input.actor?.id ?? null,
    })),
  });
  await tx.notification.createMany({
    data: changed.map((i) => ({
      userId: i.clearance.student.userId,
      itemId: i.id,
      tone: 'approved' as const,
      title: cut(`${i.office.name} cleared you`, 120),
      body: cut(approvalText(i.office.name, input.how).description, 255),
    })),
  });

  const offices = new Map<string, number>();
  for (const i of changed) offices.set(i.office.name, (offices.get(i.office.name) ?? 0) + 1);
  return { approved: changed.length, offices };
}

/* ---------- §5.3 summaries and effective deadlines ---------- */

export function summarize(items: { status: ItemStatus }[]) {
  const total = items.length;
  const approved = items.filter((i) => i.status === 'approved').length;
  const pending = items.filter((i) => i.status === 'pending').length;
  const needsAction = items.filter((i) => i.status === 'needs_action').length;
  return {
    totalOffices: total,
    approvedCount: approved,
    pendingCount: pending,
    needsActionCount: needsAction,
    percentComplete: total ? Math.round((100 * approved) / total) : 0,
    isEligible: total > 0 && approved === total,
  };
}

export type ClearanceSummary = ReturnType<typeof summarize>;

/** Office deadlines for one term, keyed by office id. */
export async function deadlineMap(academicYearId: number, term: Term, tx: Db = db) {
  const rows = await tx.officeDeadline.findMany({ where: { academicYearId, term } });
  return new Map(rows.map((d) => [d.officeId, d]));
}

/** A student's own deadline wins over the office deadline. */
export function effectiveDue(item: { dueAt: Date | null; officeId: number }, map: Map<number, { dueAt: Date; note: string | null }>) {
  const office = map.get(item.officeId);
  return { dueAt: item.dueAt ?? office?.dueAt ?? null, ownDueAt: item.dueAt, officeDueAt: office?.dueAt ?? null, dueNote: office?.note ?? null };
}
