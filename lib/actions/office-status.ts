'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { fail, runAction, type Result } from '@/lib/result';
import { actorOf, itemOfficeWhere, requireStaff } from '@/lib/auth/guards';
import { approveItems, loadCurrentTerm, termText, updateClearanceItem } from '@/lib/services/clearance';
import { logAdmin, plural } from '@/lib/services/adminLog';
import { ITEM_STATUSES } from '@/lib/constants';
import { oneOf, optStr, posInt } from '@/lib/input';
import type { BulkApproveResult, ItemUpdateResult } from '@/components/staff/types';

/** The most sign-offs Approve selected takes in one go. */
const MAX_BULK_APPROVE = 1000;

/**
 * Clearance Status editor (§8.5): staff change one item of their office (admins: any office).
 * Text fields are trimmed and cut to their column length; empty ones keep the current text.
 * The next step is dropped when the status is approved. The student is notified when the status changes.
 */
export async function updateItem(input: {
  itemId: number;
  status: string;
  task?: string;
  remarks?: string;
  description?: string;
  nextStep?: string | null;
  note?: string | null;
}): Promise<Result<ItemUpdateResult>> {
  return runAction(async () => {
    const user = await requireStaff();
    const i = (input ?? {}) as Record<string, unknown>;

    const itemId = posInt(i.itemId);
    if (!itemId) fail(400, 'invalid_item', 'item_id must be a positive number.');
    const status = oneOf(i.status, ITEM_STATUSES);
    if (!status) fail(400, 'invalid_status', 'status must be needs_action, pending or approved.');

    const item = await db.$transaction(async (tx) => {
      await updateClearanceItem(tx, {
        itemId,
        status,
        task: optStr(i.task, 160),
        remarks: optStr(i.remarks, 120),
        description: optStr(i.description, 255),
        nextStep: status === 'approved' ? null : optStr(i.nextStep, 255),
        note: optStr(i.note, 255),
        actor: actorOf(user),
      });
      return tx.clearanceItem.findUniqueOrThrow({
        where: { id: itemId },
        select: {
          id: true,
          status: true,
          task: true,
          remarks: true,
          nextStep: true,
          updatedAt: true,
          approvedAt: true,
          office: { select: { code: true } },
          clearance: { select: { student: { select: { firstName: true, lastName: true } } } },
        },
      });
    });

    revalidatePath('/office-status');

    const student = item.clearance.student;
    return {
      itemId: item.id,
      officeCode: item.office.code,
      studentName: `${student.firstName} ${student.lastName}`,
      status: item.status,
      task: item.task,
      remarks: item.remarks,
      nextStep: item.nextStep,
      updatedAt: item.updatedAt.toISOString(),
      approvedAt: item.approvedAt ? item.approvedAt.toISOString() : null,
    };
  });
}

/**
 * Approve selected on Clearance status: approves the chosen sign-offs of the current term in one go. Staff can only
 * approve their own office's (admins: any office). Sign-offs already approved, or with an upload waiting for review,
 * are skipped and counted. Each student is notified, each item's history says it was approved this way, and the
 * audit log gets one entry.
 */
export async function approveSelected(input: { itemIds: number[] }): Promise<Result<BulkApproveResult>> {
  return runAction(async () => {
    const user = await requireStaff();
    const raw: unknown = (input as { itemIds?: unknown } | null)?.itemIds;
    const ids = [...new Set((Array.isArray(raw) ? raw : []).map(posInt).filter((n): n is number => n !== null))];
    if (!ids.length) fail(400, 'nothing_selected', 'Select at least one student to approve.');
    if (ids.length > MAX_BULK_APPROVE) fail(400, 'too_many', `Approve at most ${MAX_BULK_APPROVE} sign-offs at a time.`);
    const term = await loadCurrentTerm();
    if (!term) fail(400, 'no_term', 'No current academic year is set.');

    const approved = await db.$transaction(async (tx) => {
      const r = await approveItems(tx, {
        where: {
          id: { in: ids },
          ...itemOfficeWhere(user),
          clearance: { academicYearId: term.academicYearId, term: term.term },
        },
        how: 'bulk',
        actor: actorOf(user),
      });
      if (r.approved) {
        const offices = [...r.offices].map(([name, n]) => `${name} ${n}`).join(', ');
        await logAdmin(
          tx,
          user.id,
          'clearance.bulk_approve',
          `Approved ${plural(r.approved, 'sign-off')} at once with Approve selected (${termText(term)}): ${offices}`,
        );
      }
      return r.approved;
    });

    revalidatePath('/office-status');
    return { approved, skipped: ids.length - approved };
  });
}
