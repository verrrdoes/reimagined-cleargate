'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { actorOf, requireUser } from '@/lib/auth/guards';
import { fail, runAction, type Result } from '@/lib/result';
import { verifyTicket } from '@/lib/files/ticket';
import { inspectUpload, removeQuietly } from '@/lib/files/storage';
import { safeFileName } from '@/lib/files/sniff';
import { submissionReference } from '@/lib/ids';
import { manilaYear } from '@/lib/time';
import { updateClearanceItem } from '@/lib/services/clearance';
import { notifyOffice } from '@/lib/services/notifications';

export type EvidenceReceipt = { submissionId: number; reference: string; officeName: string };

const NOTE_MAX = 255;
const STUDENT_PAGES = ['/dashboard', '/requirements', '/clearance-status'] as const;

const expiredUpload = (): never => fail(400, 'invalid_upload', 'The upload expired. Choose the file again.');

/**
 * Finalizes a student's evidence upload (HANDOFF §8.4, §11). The browser has already PUT the file to
 * storage with a presigned URL; `ticket` proves which object, item, type and size the server allowed.
 *
 * Checks the item again, the stored object's size and real type (magic bytes), then in one transaction:
 * earlier `submitted` files become `replaced`, the new submission is stored with its reference, the item
 * moves to pending (or only its remarks and next step change when it already is), and the office's
 * active staff are told. Any failure deletes the uploaded object.
 */
export async function finalizeEvidence(input: { ticket: string; note?: string | null; fileName: string }): Promise<Result<EvidenceReceipt>> {
  return runAction(async () => {
    const user = await requireUser(['student']);
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;

    const ticket = verifyTicket(raw.ticket, { kind: 'evidence', userId: user.id });
    const itemId = ticket.itemId;
    if (!itemId) return expiredUpload();

    // The same ticket sent twice (a double click, a retried request): answer with the first result
    // and leave the stored file alone, because a submission already points at it.
    const done = await db.submission.findFirst({
      where: { storageKey: ticket.key },
      select: { id: true, itemId: true, reference: true, submittedById: true, item: { select: { office: { select: { name: true } } } } },
    });
    if (done) {
      if (done.itemId !== itemId || done.submittedById !== user.id || !done.reference) return expiredUpload();
      return { submissionId: done.id, reference: done.reference, officeName: done.item.office.name };
    }

    let committed = false;
    try {
      const note = typeof raw.note === 'string' ? raw.note.trim() : '';
      if (Array.from(note).length > NOTE_MAX) fail(400, 'invalid_field', 'Your note is too long (max 255 characters).');
      const declaredName = typeof raw.fileName === 'string' ? Array.from(raw.fileName).slice(0, 1000).join('') : '';

      const item = await db.clearanceItem.findFirst({
        where: { id: itemId, clearance: { student: { userId: user.id } } },
        select: {
          id: true,
          status: true,
          task: true,
          officeId: true,
          office: { select: { code: true, name: true } },
          clearance: { select: { student: { select: { firstName: true, lastName: true } } } },
        },
      });
      if (!item) fail(404, 'item_not_found', 'That clearance item was not found on your account.');
      if (item.status === 'approved') fail(409, 'already_approved', `${item.office.name} has already cleared you. No upload needed.`);

      // Size (≤ 5 MB and no larger than the ticket allowed) and the real type from the first 16 bytes.
      // inspectUpload deletes the object itself when either check fails. The browser's declared type is
      // not compared: the type comes from the magic bytes only (§8.4), so a PNG named .jpg is still a PNG.
      const file = await inspectUpload(ticket);

      const officeName = item.office.name;
      const originalName = safeFileName(declaredName, file.ext);
      const studentName = `${item.clearance.student.firstName} ${item.clearance.student.lastName}`;
      const nextStep = `Wait for ${officeName} to review your submission.`;

      const receipt = await db.$transaction(async (tx) => {
        // Re-read inside the transaction: an office may have cleared the item since the check above.
        const current = await tx.clearanceItem.findUnique({ where: { id: item.id }, select: { status: true } });
        if (!current) fail(404, 'item_not_found', 'That clearance item was not found on your account.');
        if (current.status === 'approved') fail(409, 'already_approved', `${officeName} has already cleared you. No upload needed.`);

        const earlier = await tx.submission.count({ where: { itemId: item.id } });
        await tx.submission.updateMany({ where: { itemId: item.id, status: 'submitted' }, data: { status: 'replaced' } });

        const created = await tx.submission.create({
          data: {
            itemId: item.id,
            storageKey: ticket.key,
            originalName,
            mimeType: file.mime,
            fileSize: file.size,
            studentNote: note === '' ? null : note,
            submittedById: user.id,
          },
          select: { id: true },
        });
        const reference = submissionReference(item.office.code, created.id, manilaYear());
        await tx.submission.update({ where: { id: created.id }, data: { reference } });

        if (current.status !== 'pending') {
          // Logs the change and tells the student "{Office} is reviewing".
          await updateClearanceItem(tx, {
            itemId: item.id,
            status: 'pending',
            remarks: 'Evidence submitted',
            nextStep,
            note: 'Student uploaded evidence',
            actor: actorOf(user),
            skipOfficeCheck: true,
          });
        } else {
          // Already pending: no status change, so no log entry and no notification.
          await tx.clearanceItem.update({ where: { id: item.id }, data: { remarks: 'Evidence submitted', nextStep } });
        }

        await notifyOffice(tx, item.officeId, false, {
          itemId: item.id,
          tone: 'pending',
          title: `${studentName} ${earlier > 0 ? 'resubmitted evidence' : 'uploaded evidence'}`,
          body: `${reference} · ${originalName} for "${item.task}"`,
          link: `/review/${created.id}`,
        });

        return { submissionId: created.id, reference, officeName };
      });
      committed = true;

      for (const path of STUDENT_PAGES) revalidatePath(path);
      return receipt;
    } catch (e) {
      // Nothing points at the object unless the transaction committed: delete it.
      if (!committed) await removeQuietly(ticket.key);
      throw e;
    }
  });
}
