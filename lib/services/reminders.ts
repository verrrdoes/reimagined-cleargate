import 'server-only';
import { db, type Tx } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { cut } from '@/lib/input';
import { plural } from '@/lib/services/adminLog';
import { notifyUser } from '@/lib/services/notifications';

/**
 * Delivers one reminder (HANDOFF §8.8, legacy deliverReminder): writes a bell notification for every
 * student it reaches and returns how many. Shared by "send now" and the scheduler.
 *
 * 1. Claim it with a conditional update (sent_at IS NULL AND cancelled_at IS NULL); if nothing changed, return 0.
 * 2. Recipients: not-approved items of the reminder's year and term, with an active student and an active
 *    office, narrowed by the reminder's office, by effective due < now (`overdue`), or to one item (`student`).
 * 3. Office reminders: one notification per item (with item_id). Every-office reminders: one per student.
 * 4. Store the count in `recipients`; when the scheduler sent it, tell the author.
 *
 * Runs in its own transaction (a failure releases the claim, so the next tick retries). Pass `tx` to run
 * inside the caller's transaction instead, e.g. right after inserting the reminder in that transaction.
 */
export async function deliverReminder(id: number, tellAuthor = false, tx?: Tx): Promise<number> {
  if (tx) return deliver(tx, id, tellAuthor);
  return db.$transaction((t) => deliver(t, id, tellAuthor));
}

async function deliver(tx: Tx, id: number, tellAuthor: boolean): Promise<number> {
  const claimed = await tx.reminder.updateMany({
    where: { id, sentAt: null, cancelledAt: null },
    data: { sentAt: new Date() },
  });
  if (claimed.count !== 1) return 0;

  const r = await tx.reminder.findUnique({ where: { id }, include: { office: { select: { name: true } } } });
  if (!r) return 0;

  const conditions: Prisma.Sql[] = [
    Prisma.sql`c.academic_year_id = ${r.academicYearId}`,
    Prisma.sql`c.term = ${r.term}::"Term"`,
    Prisma.sql`ci.status <> 'approved'`,
    Prisma.sql`u.is_active`,
    Prisma.sql`o.is_active`,
  ];
  if (r.officeId !== null) conditions.push(Prisma.sql`ci.office_id = ${r.officeId}`);
  if (r.audience === 'overdue') conditions.push(Prisma.sql`COALESCE(ci.due_at, od.due_at) < now()`);
  if (r.audience === 'student') conditions.push(Prisma.sql`ci.item_id = ${r.itemId ?? 0}`);

  const from = Prisma.sql`
    FROM clearance_items ci
    JOIN clearances c ON c.clearance_id = ci.clearance_id
    JOIN students s ON s.student_id = c.student_id
    JOIN users u ON u.user_id = s.user_id
    JOIN offices o ON o.office_id = ci.office_id
    LEFT JOIN office_deadlines od
           ON od.office_id = ci.office_id AND od.academic_year_id = c.academic_year_id AND od.term = c.term
   WHERE ${Prisma.join(conditions, ' AND ')}`;

  const title = cut(`Reminder from ${r.office?.name || 'the Administrator'}`, 120);
  const body = cut(r.message, 255);
  const tone = r.audience === 'overdue' ? 'needs_action' : 'info';

  const sent =
    r.officeId !== null
      ? // One notification per requirement, linked to it.
        await tx.$executeRaw`
          INSERT INTO notifications (user_id, item_id, tone, title, body)
          SELECT u.user_id, ci.item_id, ${tone}::"NotificationTone", ${title}::varchar, ${body}::varchar
          ${from}`
      : // From the admin to every office's outstanding students: one per student.
        await tx.$executeRaw`
          INSERT INTO notifications (user_id, item_id, tone, title, body)
          SELECT x.user_id, NULL, ${tone}::"NotificationTone", ${title}::varchar, ${body}::varchar
            FROM (SELECT DISTINCT u.user_id ${from}) x`;

  await tx.reminder.update({ where: { id }, data: { recipients: sent } });

  if (tellAuthor && r.createdById) {
    await notifyUser(tx, r.createdById, {
      tone: 'approved',
      title: 'Scheduled reminder sent',
      body: `Sent to ${plural(sent, 'student')}: ${r.message}`,
      link: '/deadlines',
    });
  }
  return sent;
}
