'use server';

import { refresh } from 'next/cache';
import { db } from '@/lib/db';
import { requireStaff, staffOfficeId } from '@/lib/auth/guards';
import { fail, runAction, type Result } from '@/lib/result';
import { bool, oneOf, optStr, posInt, str } from '@/lib/input';
import { parseLocalDateTime, prettyDue } from '@/lib/time';
import { loadCurrentTerm, termText } from '@/lib/services/clearance';
import { logAdmin, plural } from '@/lib/services/adminLog';
import { notifyUser } from '@/lib/services/notifications';
import { deliverReminder } from '@/lib/services/reminders';
import { notifyNewOfficeDeadline, targetOffices } from '@/lib/services/deadlines';

/*
 * Deadline and reminder actions (HANDOFF §8.7, legacy saveDeadline, itemDeadline, sendReminder, cancelReminder).
 * Dates come in as datetime-local values ("2026-10-26T17:00"), read as Manila time.
 * Each action refreshes the current route on success, so the page and the shell show the new state.
 */

const AUDIENCES = ['outstanding', 'overdue', 'student'] as const;

async function requireTerm() {
  const term = await loadCurrentTerm();
  if (!term) fail(400, 'no_term', 'No current academic year is set.');
  return term;
}

function futureDeadline(value: unknown): Date {
  const due = parseLocalDateTime(str(value, 25));
  if (!due) fail(400, 'invalid_date', 'Choose a date and time for the deadline.');
  if (due.getTime() <= Date.now()) fail(400, 'past_date', 'The deadline must be in the future.');
  return due;
}

/**
 * Sets the current term's deadline for one office (`office` = its code; staff may leave it empty for their own)
 * or, for admins, every active office (`office: 'all'`). Students with their own deadline keep it. With `notify`,
 * students who follow the office deadline and are not cleared get a bell notification.
 */
export async function saveOfficeDeadline(input: {
  office: string;
  due: string;
  note?: string | null;
  notify?: boolean;
}): Promise<Result<{ dueAt: string; notified: number }>> {
  return runAction(async () => {
    const user = await requireStaff();
    const term = await requireTerm();
    const offices = await targetOffices(db, user, str(input?.office, 20));
    const due = futureDeadline(input?.due);
    const note = optStr(input?.note, 255);
    const notify = bool(input?.notify);
    const names = offices.length === 1 ? offices[0].name : 'every office';

    const notified = await db.$transaction(async (tx) => {
      let total = 0;
      for (const office of offices) {
        const key = { officeId: office.id, academicYearId: term.academicYearId, term: term.term };
        await tx.officeDeadline.upsert({
          where: { officeId_academicYearId_term: key },
          create: { ...key, dueAt: due, note, setById: user.id },
          // A new date gets its own passed notice and, with auto-clear on, its own warning.
          update: { dueAt: due, note, setById: user.id, passedNotifiedAt: null, autoClearWarnedAt: null },
        });
        if (notify) total += await notifyNewOfficeDeadline(tx, office, term, due, note);
      }
      await logAdmin(
        tx,
        user.id,
        'deadline.set',
        `Set the ${names} deadline to ${prettyDue(due)} (${termText(term)})${total ? `, notified ${plural(total, 'student')}` : ''}`,
      );
      return total;
    });

    refresh();
    return { dueAt: due.toISOString(), notified };
  });
}

/** Removes the current term's deadline for one office, or every office (`'all'`, admins). Own deadlines stay. */
export async function clearOfficeDeadline(input: { office: string }): Promise<Result<null>> {
  return runAction(async () => {
    const user = await requireStaff();
    const term = await requireTerm();
    const offices = await targetOffices(db, user, str(input?.office, 20));
    const names = offices.length === 1 ? offices[0].name : 'every office';

    await db.$transaction(async (tx) => {
      await tx.officeDeadline.deleteMany({
        where: { officeId: { in: offices.map((o) => o.id) }, academicYearId: term.academicYearId, term: term.term },
      });
      await logAdmin(tx, user.id, 'deadline.clear', `Removed the ${names} deadline (${termText(term)})`);
    });

    refresh();
    return null;
  });
}

/**
 * Gives one student their own deadline on a requirement, or removes it when `due` is empty (they follow the
 * office deadline again). The requirement's "last updated" time is left alone. With `notify`, a student who
 * is not cleared yet gets a bell notification about the new date.
 */
export async function saveStudentDeadline(input: {
  itemId: number;
  due: string | null;
  notify?: boolean;
}): Promise<Result<{ dueAt: string | null }>> {
  return runAction(async () => {
    const user = await requireStaff();
    const id = posInt(input?.itemId);
    const item = id
      ? await db.clearanceItem.findUnique({
          where: { id },
          select: {
            id: true,
            officeId: true,
            status: true,
            task: true,
            office: { select: { name: true } },
            clearance: { select: { student: { select: { userId: true, firstName: true, lastName: true, studentNumber: true } } } },
          },
        })
      : null;
    if (!item) fail(404, 'not_found', 'Requirement not found.');
    const own = staffOfficeId(user);
    if (own !== null && item.officeId !== own) fail(403, 'forbidden', 'You can only set deadlines for your own office.');

    const student = item.clearance.student;
    const who = `${student.firstName} ${student.lastName} (${student.studentNumber})`;

    if (str(input?.due, 25) === '') {
      await db.$transaction(async (tx) => {
        // Raw update so the requirement's updated_at (shown to students as "last updated") stays as it was.
        await tx.$executeRaw`UPDATE clearance_items SET due_at = NULL WHERE item_id = ${item.id}`;
        await logAdmin(tx, user.id, 'deadline.student_clear', `Removed the own ${item.office.name} deadline of ${who}`);
      });
      refresh();
      return { dueAt: null };
    }

    const due = futureDeadline(input?.due);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE clearance_items SET due_at = ${due} WHERE item_id = ${item.id}`;
      if (bool(input?.notify) && item.status !== 'approved') {
        await notifyUser(tx, student.userId, {
          itemId: item.id,
          tone: 'info',
          title: `New deadline: ${item.office.name}`,
          body: `Finish "${item.task}" by ${prettyDue(due)}.`,
        });
      }
      await logAdmin(tx, user.id, 'deadline.student', `Gave ${who} a ${item.office.name} deadline of ${prettyDue(due)}`);
    });

    refresh();
    return { dueAt: due.toISOString() };
  });
}

/**
 * Sends a reminder now or schedules it (`sendAt` empty = now). Audiences: `outstanding` (not cleared yet),
 * `overdue` (past their deadline) or `student` (one requirement, `itemId`). `office` is the office code;
 * admins may pass `all` for every office. Returns how many students it reached when sent now (else null).
 */
export async function sendReminder(input: {
  audience: string;
  office?: string;
  itemId?: number | null;
  message: string;
  sendAt?: string | null;
}): Promise<Result<{ reminderId: number; sentTo: number | null; sendAt: string }>> {
  return runAction(async () => {
    const user = await requireStaff();
    const term = await requireTerm();
    const audience = oneOf(input?.audience, AUDIENCES);
    if (!audience) fail(400, 'invalid_audience', 'Choose who gets the reminder.');
    const message = str(input?.message, 255);
    if (message === '') fail(400, 'missing_fields', 'Write the reminder message.');

    let officeId: number | null = null;
    let officeName = 'every office';
    let itemId: number | null = null;
    let who: string;

    if (audience === 'student') {
      const id = posInt(input?.itemId);
      const item = id
        ? await db.clearanceItem.findUnique({
            where: { id },
            select: {
              id: true,
              officeId: true,
              office: { select: { name: true } },
              clearance: { select: { academicYearId: true, term: true, student: { select: { firstName: true, lastName: true } } } },
            },
          })
        : null;
      if (!item || item.clearance.academicYearId !== term.academicYearId || item.clearance.term !== term.term) {
        fail(400, 'invalid_student', 'Choose the student to remind.');
      }
      const own = staffOfficeId(user);
      if (own !== null && item.officeId !== own) fail(403, 'forbidden', 'You can only remind students about your own office.');
      officeId = item.officeId;
      officeName = item.office.name;
      itemId = item.id;
      who = `${item.clearance.student.firstName} ${item.clearance.student.lastName}`;
    } else {
      const code = str(input?.office, 20);
      const offices = await targetOffices(db, user, code);
      if (!(code === 'all' && user.role === 'admin')) {
        officeId = offices[0].id;
        officeName = offices[0].name;
      }
      who = audience === 'overdue' ? 'overdue students' : 'students not yet cleared';
    }

    const rawAt = str(input?.sendAt, 25);
    const sendAt = rawAt === '' ? new Date() : parseLocalDateTime(rawAt);
    if (!sendAt) fail(400, 'invalid_date', 'Choose a valid date and time.');
    if (sendAt.getTime() < Date.now() - 60_000) fail(400, 'past_date', 'Pick a time in the future, or send it now.');
    const now = sendAt.getTime() <= Date.now();

    const result = await db.$transaction(async (tx) => {
      const reminder = await tx.reminder.create({
        data: {
          officeId,
          itemId,
          academicYearId: term.academicYearId,
          term: term.term,
          audience,
          message,
          sendAt,
          createdById: user.id,
        },
        select: { id: true },
      });
      if (now) {
        const sent = await deliverReminder(reminder.id, false, tx);
        await logAdmin(tx, user.id, 'reminder.send', `Sent a reminder from ${officeName} to ${who} (${plural(sent, 'student')}): ${message}`);
        return { reminderId: reminder.id, sentTo: sent as number | null };
      }
      await logAdmin(tx, user.id, 'reminder.schedule', `Scheduled a reminder from ${officeName} to ${who} for ${prettyDue(sendAt)}: ${message}`);
      return { reminderId: reminder.id, sentTo: null };
    });

    refresh();
    return { ...result, sendAt: sendAt.toISOString() };
  });
}

/** Cancels a scheduled reminder. Staff can cancel their own office's reminders only. */
export async function cancelReminder(input: { reminderId: number }): Promise<Result<null>> {
  return runAction(async () => {
    const user = await requireStaff();
    const id = posInt(input?.reminderId);
    const reminder = id
      ? await db.reminder.findUnique({
          where: { id },
          select: { id: true, officeId: true, message: true, sendAt: true, office: { select: { name: true } } },
        })
      : null;
    if (!reminder) fail(404, 'not_found', 'Reminder not found.');
    const own = staffOfficeId(user);
    if (own !== null && reminder.officeId !== own) fail(403, 'forbidden', "You can only cancel your own office's reminders.");

    await db.$transaction(async (tx) => {
      const done = await tx.reminder.updateMany({
        where: { id: reminder.id, sentAt: null, cancelledAt: null },
        data: { cancelledAt: new Date() },
      });
      if (done.count !== 1) fail(409, 'already_sent', 'That reminder has already gone out or was cancelled.');
      await logAdmin(
        tx,
        user.id,
        'reminder.cancel',
        `Cancelled the ${reminder.office?.name ?? 'every-office'} reminder set for ${prettyDue(reminder.sendAt)}: ${reminder.message}`,
      );
    });

    refresh();
    return null;
  });
}
