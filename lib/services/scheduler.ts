import 'server-only';
import { db } from '@/lib/db';
import { spanText } from '@/lib/deadline';
import { cut } from '@/lib/input';
import { prettyDue } from '@/lib/time';
import { approveItems, loadCurrentTerm, termText, type CurrentTerm } from '@/lib/services/clearance';
import { notifyOffice } from '@/lib/services/notifications';
import { deliverReminder } from '@/lib/services/reminders';
import { autoClearCount, autoClearableWhere, sendOfficeDigests } from '@/lib/services/officeAutomation';
import { AUTO_CLEAR_WARN_HOURS, autoClearWarning, deadlinePassedNotice } from '@/lib/officeAutomation';
import type { Tx } from '@/lib/db';
import type { NotificationTone, OfficeDeadline } from '@/generated/prisma/client';

// The once-a-minute tick (HANDOFF §8.9, legacy runScheduler without the backup step).
// Every step is idempotent, so two ticks running at the same time are harmless.

export type TickResult = {
  /** Scheduled reminders delivered in this run. */
  reminders: number;
  /** Notifications those reminders created. */
  reminderRecipients: number;
  /** Offices warned that their deadline clears students automatically. */
  autoClearWarnings: number;
  /** Office deadlines whose "deadline passed" notice went out. */
  deadlinesPassed: number;
  /** Students cleared automatically at those deadlines. */
  autoCleared: number;
  /** Automatic 3-day, 1-day and overdue alerts sent to students. */
  alerts: number;
  /** Office morning emails sent (once a day, from 8:00 AM Manila). */
  digests: number;
  /** Steps that failed (logged on the server); the next tick retries them. */
  failed: number;
  /** The current term, or null when no current academic year is set (steps 3 to 6 are skipped). */
  term: string | null;
};

const MAX_REMINDERS_PER_RUN = 50;
const DAY_MS = 86_400_000;

type DeadlineRow = OfficeDeadline & { office: { name: string; autoClear: boolean; isActive: boolean } };
const deadlineOffice = { office: { select: { name: true, autoClear: true, isActive: true } } } as const;

/**
 * Warns an office with auto-clear on that its deadline will clear students (once per due date). Returns false when
 * another tick claimed it first or the deadline changed in the meantime.
 */
export async function warnAutoClear(tx: Tx, d: DeadlineRow, ct: CurrentTerm): Promise<boolean> {
  const claim = await tx.officeDeadline.updateMany({
    where: { id: d.id, autoClearWarnedAt: null, dueAt: d.dueAt },
    data: { autoClearWarnedAt: new Date(), updatedAt: d.updatedAt },
  });
  if (claim.count !== 1) return false;
  const students = await autoClearCount(tx, d.officeId, ct);
  if (students) {
    await notifyOffice(tx, d.officeId, true, { tone: 'pending', ...autoClearWarning(d.office.name, students, d.dueAt), link: '/office-status' });
  }
  return true;
}

/**
 * Closes a passed office deadline (once per due date): clears the students auto-clear may clear when the office
 * has it on and was warned before the deadline, then tells the office and the admins who is left.
 * Returns null when another tick claimed it first, else how many students were cleared.
 */
export async function closeDeadline(tx: Tx, d: DeadlineRow, ct: CurrentTerm): Promise<number | null> {
  // Claim it; a deadline changed in the meantime (new due_at) is left for its own notice.
  const claim = await tx.officeDeadline.updateMany({
    where: { id: d.id, passedNotifiedAt: null, dueAt: d.dueAt },
    data: { passedNotifiedAt: new Date(), updatedAt: d.updatedAt },
  });
  if (claim.count !== 1) return null;

  // Never retroactive: only a deadline the office was warned about before it passed clears anyone.
  let cleared = 0;
  if (d.office.autoClear && d.office.isActive && d.autoClearWarnedAt && d.autoClearWarnedAt.getTime() <= d.dueAt.getTime()) {
    cleared = (await approveItems(tx, { where: autoClearableWhere(d.officeId, ct), how: 'auto', actor: null })).approved;
  }

  const left = await tx.clearanceItem.count({
    where: {
      officeId: d.officeId,
      status: { not: 'approved' },
      dueAt: null,
      clearance: { academicYearId: ct.academicYearId, term: ct.term },
    },
  });
  const notice = deadlinePassedNotice(d.office.name, left, cleared);
  await notifyOffice(tx, d.officeId, true, { ...notice, link: cleared ? '/office-status' : '/deadlines' });
  return cleared;
}

type AlertRow = {
  item_id: number;
  user_id: number;
  office_name: string;
  task: string;
  due: Date;
  stage: 'three_days' | 'one_day' | 'overdue';
};

export async function runTick(): Promise<TickResult> {
  const result: TickResult = {
    reminders: 0,
    reminderRecipients: 0,
    autoClearWarnings: 0,
    deadlinesPassed: 0,
    autoCleared: 0,
    alerts: 0,
    digests: 0,
    failed: 0,
    term: null,
  };

  // 1. Scheduled reminders that are due, oldest first, telling each author.
  const due = await db.reminder.findMany({
    where: { sentAt: null, cancelledAt: null, sendAt: { lte: new Date() } },
    orderBy: [{ sendAt: 'asc' }, { id: 'asc' }],
    take: MAX_REMINDERS_PER_RUN,
    select: { id: true },
  });
  for (const { id } of due) {
    try {
      const n = await deliverReminder(id, true);
      result.reminders += 1;
      result.reminderRecipients += n;
    } catch (e) {
      result.failed += 1;
      console.error(`ClearGate scheduler: reminder ${id} could not be delivered:`, e);
    }
  }

  // 2. Nothing else to do without a current term.
  const ct = await loadCurrentTerm();
  if (!ct) return result;
  result.term = termText(ct);

  // 3. Auto-clear warnings, once per office deadline, when the deadline is AUTO_CLEAR_WARN_HOURS away or less.
  const now = new Date();
  const soon = await db.officeDeadline.findMany({
    where: {
      academicYearId: ct.academicYearId,
      term: ct.term,
      autoClearWarnedAt: null,
      dueAt: { gt: now, lte: new Date(now.getTime() + AUTO_CLEAR_WARN_HOURS * 3_600_000) },
      office: { autoClear: true, isActive: true },
    },
    orderBy: { dueAt: 'asc' },
    include: deadlineOffice,
  });
  for (const d of soon) {
    try {
      if (await db.$transaction((tx) => warnAutoClear(tx, d, ct))) result.autoClearWarnings += 1;
    } catch (e) {
      result.failed += 1;
      console.error(`ClearGate scheduler: auto-clear warning for deadline ${d.id} failed:`, e);
    }
  }

  // 4. "Deadline passed" notices, once per office deadline, within 7 days of the deadline. Offices with
  //    auto-clear on have their students cleared first, so the notice says who is really left.
  const passed = await db.officeDeadline.findMany({
    where: {
      academicYearId: ct.academicYearId,
      term: ct.term,
      passedNotifiedAt: null,
      dueAt: { lt: now, gt: new Date(now.getTime() - 7 * DAY_MS) },
    },
    orderBy: { dueAt: 'asc' },
    include: deadlineOffice,
  });
  for (const d of passed) {
    try {
      const cleared = await db.$transaction((tx) => closeDeadline(tx, d, ct));
      if (cleared !== null) {
        result.deadlinesPassed += 1;
        result.autoCleared += cleared;
      }
    } catch (e) {
      result.failed += 1;
      console.error(`ClearGate scheduler: deadline-passed notice for deadline ${d.id} failed:`, e);
    }
  }

  // 5. Automatic student alerts: 3 days left, within a day, overdue. The deadline_alerts primary key
  //    (item, stage, due_at) makes each one go out once per due date; only newly inserted rows are notified.
  try {
    result.alerts = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<AlertRow[]>`
        WITH candidates AS (
          SELECT ci.item_id, u.user_id, o.name AS office_name, ci.task,
                 COALESCE(ci.due_at, od.due_at) AS due
            FROM clearance_items ci
            JOIN clearances c ON c.clearance_id = ci.clearance_id
            JOIN students s   ON s.student_id = c.student_id
            JOIN users u      ON u.user_id = s.user_id AND u.is_active
            JOIN offices o    ON o.office_id = ci.office_id AND o.is_active
            LEFT JOIN office_deadlines od
                   ON od.office_id = ci.office_id AND od.academic_year_id = c.academic_year_id AND od.term = c.term
           WHERE c.academic_year_id = ${ct.academicYearId}
             AND c.term = ${ct.term}::"Term"
             AND ci.status <> 'approved'
             AND COALESCE(ci.due_at, od.due_at) BETWEEN now() - interval '7 days' AND now() + interval '3 days'
        ),
        staged AS (
          SELECT candidates.*,
                 (CASE WHEN m.mins < 0 THEN 'overdue'
                       WHEN m.mins <= 1440 THEN 'one_day'
                       ELSE 'three_days' END)::"AlertStage" AS stage
            FROM candidates
           CROSS JOIN LATERAL (SELECT trunc(extract(epoch FROM (candidates.due - now())) / 60) AS mins) m
        ),
        inserted AS (
          INSERT INTO deadline_alerts (item_id, stage, due_at)
          SELECT item_id, stage, due FROM staged
          ON CONFLICT DO NOTHING
          RETURNING item_id, stage, due_at
        )
        SELECT s.item_id, s.user_id, s.office_name, s.task, s.due, s.stage::text AS stage
          FROM inserted i
          JOIN staged s ON s.item_id = i.item_id AND s.stage = i.stage AND s.due = i.due_at`;

      if (!rows.length) return 0;
      const now = Date.now();
      await tx.notification.createMany({
        data: rows.map((r) => {
          const when = prettyDue(r.due);
          const tone: NotificationTone = r.stage === 'three_days' ? 'pending' : 'needs_action';
          // The first alert says the real time left (legacy always said "3 days", even for a deadline set
          // 2 days out; HANDOFF §17 item 4).
          const title =
            r.stage === 'overdue'
              ? `Overdue: ${r.office_name}`
              : r.stage === 'one_day'
                ? `Due within a day: ${r.office_name}`
                : `Due in ${spanText(new Date(r.due).getTime() - now)}: ${r.office_name}`;
          const body =
            r.stage === 'overdue'
              ? `The deadline was ${when}. You can still finish "${r.task}", so do it as soon as you can.`
              : `Finish "${r.task}" by ${when}.`;
          return { userId: r.user_id, itemId: r.item_id, tone, title: cut(title, 120), body: cut(body, 255) };
        }),
      });
      return rows.length;
    });
  } catch (e) {
    result.failed += 1;
    console.error('ClearGate scheduler: automatic deadline alerts failed:', e);
  }

  // 6. The office morning emails, once a day from 8:00 AM Manila.
  try {
    result.digests = await sendOfficeDigests(ct, now);
  } catch (e) {
    result.failed += 1;
    console.error('ClearGate scheduler: office morning emails failed:', e);
  }

  return result;
}

/**
 * The lazy fallback for plans without a per-minute cron (§8.9): runs the tick when the shared
 * job_state('tick') row is more than 60 s old. The claim is one conditional upsert, so only one caller
 * per minute wins. Returns whether this call ran the tick.
 */
export async function maybeTick(): Promise<boolean> {
  const claimed = await db.$executeRaw`
    INSERT INTO job_state (name, last_run_at) VALUES ('tick', now())
    ON CONFLICT (name) DO UPDATE SET last_run_at = EXCLUDED.last_run_at
     WHERE job_state.last_run_at < now() - interval '60 seconds'`;
  if (claimed !== 1) return false;
  await runTick();
  return true;
}

/** Records a tick that ran through the cron route, so the lazy fallback waits a full minute after it. */
export async function stampTick(): Promise<void> {
  await db.$executeRaw`
    INSERT INTO job_state (name, last_run_at) VALUES ('tick', now())
    ON CONFLICT (name) DO UPDATE SET last_run_at = EXCLUDED.last_run_at`;
}
