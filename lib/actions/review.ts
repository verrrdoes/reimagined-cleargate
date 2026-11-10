'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { fail, runAction, type Result } from '@/lib/result';
import { actorOf, requireStaff } from '@/lib/auth/guards';
import { updateClearanceItem } from '@/lib/services/clearance';
import { loadSubmission, submissionPayload } from '@/lib/services/review';
import { cut, oneOf, posInt, str } from '@/lib/input';
import type { ReviewOutcome } from '@/components/staff/types';

const DECISIONS = ['approve', 'return'] as const;

/** Ticked checklist lines: strings, trimmed, at most 120 characters each, empty ones dropped. */
function readChecklist(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((c) => (typeof c === 'string' ? cut(c.trim(), 120) : '')).filter((c) => c !== '');
}

/**
 * §8.5 review decision: approve or return a submitted file. The item update and the submission update
 * run in one transaction; the response is the updated submission, the item's previous status and the
 * notification the student received.
 */
export async function reviewSubmission(input: {
  submissionId: number;
  decision: 'approve' | 'return';
  checklist: string[];
  returnCategory?: string;
  reason?: string;
}): Promise<Result<ReviewOutcome>> {
  return runAction(async () => {
    const user = await requireStaff();
    const i = (input ?? {}) as Record<string, unknown>;

    const id = posInt(i.submissionId);
    const decision = oneOf(i.decision, DECISIONS);
    if (!id || !decision) fail(400, 'invalid_request', 'Send a submission_id and a decision of approve or return.');

    const sub = await loadSubmission(db, id, user);
    if (sub.status !== 'submitted') fail(409, 'already_reviewed', `This submission has already been ${sub.status}.`);

    const checklist = readChecklist(i.checklist);
    let category: string | null = null;
    let reason: string | null = null;
    if (decision === 'return') {
      category = str(i.returnCategory, 80);
      reason = str(i.reason, 500);
      if (category === '' || Array.from(reason).length < 10) {
        fail(400, 'reason_required', 'Choose a reason category and explain what the student needs to fix (at least 10 characters).');
      }
    }

    const office = sub.item.office.name;
    const reference = sub.reference ?? `#${sub.id}`;
    const previousItemStatus = sub.item.status;

    const notification = await db.$transaction(async (tx) => {
      // Claim the submission first so two reviewers can't both decide it.
      const claimed = await tx.submission.updateMany({
        where: { id, status: 'submitted' },
        data: {
          status: decision === 'approve' ? 'approved' : 'returned',
          reviewedById: user.id,
          reviewedAt: new Date(),
          returnCategory: category,
          reviewNote: reason,
          checklist,
        },
      });
      if (claimed.count === 0) {
        const now = await tx.submission.findUnique({ where: { id }, select: { status: true } });
        fail(409, 'already_reviewed', `This submission has already been ${now?.status ?? 'reviewed'}.`);
      }

      if (decision === 'approve') {
        await updateClearanceItem(tx, {
          itemId: sub.itemId,
          status: 'approved',
          remarks: 'Evidence verified',
          description: `${office} has cleared your account.`,
          nextStep: null,
          note: `Approved submission ${reference}`,
          actor: actorOf(user),
        });
      } else {
        await updateClearanceItem(tx, {
          itemId: sub.itemId,
          status: 'needs_action',
          remarks: cut(`Returned: ${category}`, 120),
          description: cut(reason ?? '', 255),
          nextStep: 'Fix the issue, then upload a corrected file from your clearance page.',
          note: cut(`Returned submission ${reference}: ${category}`, 255),
          actor: actorOf(user),
        });
      }

      return tx.notification.findFirst({
        where: { itemId: sub.itemId },
        orderBy: { id: 'desc' },
        select: { title: true, body: true, createdAt: true },
      });
    });

    const payload = await submissionPayload(db, await loadSubmission(db, id, user));

    revalidatePath('/staff');
    revalidatePath(`/review/${id}`);
    revalidatePath('/history');

    return {
      ...payload,
      previousItemStatus,
      notification: notification
        ? { title: notification.title, body: notification.body, createdAt: notification.createdAt.toISOString() }
        : null,
    };
  });
}
