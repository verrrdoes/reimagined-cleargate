import 'server-only';
import { db, type Db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { SessionUser } from '@/lib/auth/guards';
import { fail } from '@/lib/result';
import { cut } from '@/lib/input';
import { LIMITS } from '@/lib/constants';
import { prettyDue } from '@/lib/time';
import { currentTerm, termText, type CurrentTerm } from '@/lib/services/clearance';
import type {
  DeadlineItem,
  DeadlineOffice,
  DeadlinesView,
  ReminderAudienceName,
  ReminderRow,
} from '@/components/deadlines/types';

/*
 * Deadlines and reminders (HANDOFF §8.7, legacy routeDeadlines): office deadlines for the current term with
 * how each office's students stand, the requirements staff can give their own deadline or remind about,
 * and the reminder history. Staff see their own office only; admins see every active office.
 */

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** "Maria Santos" for the person who set a deadline or wrote a reminder (legacy COALESCE order). */
function personName(u: { email: string; role: string; fullName: string | null; staffProfile: { fullName: string } | null } | null) {
  if (!u) return null;
  return u.staffProfile?.fullName || u.fullName || (u.role === 'admin' ? 'System Administrator' : u.email);
}

type OfficeCounts = { officeId: number; students: number; outstanding: number; overdue: number; ownDeadlines: number };

/** Per-office counts for the term's active students, in one query. */
async function officeCounts(term: CurrentTerm, ownOfficeId: number | null): Promise<Map<number, OfficeCounts>> {
  const scope = ownOfficeId !== null ? Prisma.sql`AND ci.office_id = ${ownOfficeId}` : Prisma.empty;
  const rows = await db.$queryRaw<OfficeCounts[]>`
    SELECT ci.office_id AS "officeId",
           COUNT(*)::int AS students,
           COUNT(*) FILTER (WHERE ci.status <> 'approved')::int AS outstanding,
           COUNT(*) FILTER (WHERE ci.status <> 'approved' AND COALESCE(ci.due_at, od.due_at) < now())::int AS overdue,
           COUNT(*) FILTER (WHERE ci.due_at IS NOT NULL)::int AS "ownDeadlines"
      FROM clearance_items ci
      JOIN clearances c ON c.clearance_id = ci.clearance_id
      JOIN students s   ON s.student_id = c.student_id
      JOIN users u      ON u.user_id = s.user_id AND u.is_active
      LEFT JOIN office_deadlines od
             ON od.office_id = ci.office_id AND od.academic_year_id = c.academic_year_id AND od.term = c.term
     WHERE c.academic_year_id = ${term.academicYearId}
       AND c.term = ${term.term}::"Term"
       ${scope}
     GROUP BY ci.office_id`;
  return new Map(rows.map((r) => [Number(r.officeId), r]));
}

type ReminderSql = {
  id: number;
  officeCode: string | null;
  officeName: string | null;
  audience: string;
  message: string;
  sendAt: Date;
  sentAt: Date | null;
  cancelledAt: Date | null;
  recipients: number | null;
  createdByName: string | null;
  studentName: string | null;
  studentNumber: string | null;
};

/** Scheduled reminders first, then newest first (by sent time, else send time); at most LIMITS.remindersList. */
async function reminderList(ownOfficeId: number | null): Promise<ReminderRow[]> {
  const scope = ownOfficeId !== null ? Prisma.sql`WHERE (r.office_id = ${ownOfficeId} OR r.office_id IS NULL)` : Prisma.empty;
  const rows = await db.$queryRaw<ReminderSql[]>`
    SELECT r.reminder_id AS id,
           o.code AS "officeCode",
           o.name AS "officeName",
           r.audience::text AS audience,
           r.message,
           r.send_at AS "sendAt",
           r.sent_at AS "sentAt",
           r.cancelled_at AS "cancelledAt",
           r.recipients,
           COALESCE(st.full_name, u.full_name, CASE WHEN u.role = 'admin' THEN 'System Administrator' END, u.email) AS "createdByName",
           CASE WHEN s.student_id IS NULL THEN NULL ELSE s.first_name || ' ' || s.last_name END AS "studentName",
           s.student_number AS "studentNumber"
      FROM reminders r
      LEFT JOIN offices o         ON o.office_id = r.office_id
      LEFT JOIN users u           ON u.user_id = r.created_by
      LEFT JOIN office_staff st   ON st.user_id = r.created_by
      LEFT JOIN clearance_items ci ON ci.item_id = r.item_id
      LEFT JOIN clearances c      ON c.clearance_id = ci.clearance_id
      LEFT JOIN students s        ON s.student_id = c.student_id
      ${scope}
     ORDER BY (r.sent_at IS NULL AND r.cancelled_at IS NULL) DESC,
              COALESCE(r.sent_at, r.send_at) DESC,
              r.reminder_id DESC
     LIMIT ${LIMITS.remindersList}::int`;
  return rows.map((r) => ({
    id: Number(r.id),
    officeCode: r.officeCode,
    officeName: r.officeName,
    audience: (['outstanding', 'overdue', 'student'].includes(r.audience) ? r.audience : 'outstanding') as ReminderAudienceName,
    message: r.message,
    sendAt: r.sendAt.toISOString(),
    sentAt: iso(r.sentAt),
    cancelledAt: iso(r.cancelledAt),
    recipients: r.recipients === null ? null : Number(r.recipients),
    createdByName: r.createdByName,
    studentName: r.studentName,
    studentNumber: r.studentNumber,
  }));
}

/** Everything the Deadlines and reminders page shows. Staff without an office get `noOffice` and empty lists. */
export async function getDeadlinesView(user: SessionUser): Promise<DeadlinesView> {
  const serverNow = new Date().toISOString();
  const isAdmin = user.role === 'admin';
  const ownOfficeId = isAdmin ? null : (user.staffProfile?.officeId ?? null);
  const ownOfficeCode = isAdmin ? null : (user.staffProfile?.office.code ?? null);
  const term = await currentTerm();
  const base: DeadlinesView = {
    term: term ? { text: termText(term), label: term.label, termLabel: term.termLabel } : null,
    noOffice: !isAdmin && ownOfficeId === null,
    isAdmin,
    ownOfficeCode,
    offices: [],
    items: [],
    reminders: [],
    serverNow,
  };
  if (!term || base.noOffice) return base;

  const [officeRows, counts, itemRows, reminders] = await Promise.all([
    db.office.findMany({
      where: ownOfficeId !== null ? { id: ownOfficeId } : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        icon: true,
        autoClear: true,
        deadlines: {
          where: { academicYearId: term.academicYearId, term: term.term },
          select: {
            dueAt: true,
            note: true,
            updatedAt: true,
            setBy: { select: { email: true, role: true, fullName: true, staffProfile: { select: { fullName: true } } } },
          },
        },
      },
    }),
    officeCounts(term, ownOfficeId),
    db.clearanceItem.findMany({
      where: {
        clearance: { academicYearId: term.academicYearId, term: term.term, student: { user: { isActive: true } } },
        ...(ownOfficeId !== null ? { officeId: ownOfficeId } : { office: { isActive: true } }),
      },
      orderBy: [
        { clearance: { student: { lastName: 'asc' } } },
        { clearance: { student: { firstName: 'asc' } } },
        { office: { sortOrder: 'asc' } },
        { id: 'asc' },
      ],
      select: {
        id: true,
        officeId: true,
        status: true,
        task: true,
        dueAt: true,
        office: { select: { code: true, name: true } },
        clearance: { select: { student: { select: { studentNumber: true, firstName: true, lastName: true } } } },
      },
    }),
    reminderList(ownOfficeId),
  ]);

  const offices: DeadlineOffice[] = officeRows.map((o) => {
    const d = o.deadlines[0] ?? null;
    const c = counts.get(o.id);
    return {
      id: o.id,
      code: o.code,
      name: o.name,
      icon: o.icon,
      autoClear: o.autoClear,
      dueAt: iso(d?.dueAt),
      note: d?.note ?? null,
      setBy: d ? personName(d.setBy) : null,
      updatedAt: iso(d?.updatedAt),
      students: c?.students ?? 0,
      outstanding: c?.outstanding ?? 0,
      overdue: c?.overdue ?? 0,
      ownDeadlines: c?.ownDeadlines ?? 0,
    };
  });

  const officeDue = new Map(officeRows.map((o) => [o.id, iso(o.deadlines[0]?.dueAt)]));
  const items: DeadlineItem[] = itemRows.map((i) => ({
    id: i.id,
    studentName: `${i.clearance.student.firstName} ${i.clearance.student.lastName}`,
    studentNumber: i.clearance.student.studentNumber,
    officeCode: i.office.code,
    officeName: i.office.name,
    status: i.status,
    task: i.task,
    ownDueAt: iso(i.dueAt),
    officeDueAt: officeDue.get(i.officeId) ?? null,
  }));

  return { ...base, offices, items, reminders };
}

/* ---------- Helpers for the deadline actions ---------- */

export type TargetOffice = { id: number; code: string; name: string };

/**
 * The offices a deadline or reminder applies to (legacy deadlineOffices). Staff: their own office (another
 * office's code is 403). Admins: `all` → every active office, otherwise the office with that code.
 */
export async function targetOffices(tx: Db, user: SessionUser, code: string): Promise<TargetOffice[]> {
  if (user.role !== 'admin') {
    const own = user.staffProfile;
    if (!own) fail(403, 'no_office', 'Your staff account is not linked to an office.');
    if (code !== '' && code !== own.office.code) fail(403, 'forbidden', 'You can only manage deadlines for your own office.');
    return [{ id: own.officeId, code: own.office.code, name: own.office.name }];
  }
  if (code === 'all') {
    return tx.office.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, name: true },
    });
  }
  const office = code ? await tx.office.findUnique({ where: { code }, select: { id: true, code: true, name: true } }) : null;
  if (!office) fail(400, 'invalid_office', 'Choose an office.');
  return [office];
}

/**
 * Tells the office's students who are not cleared yet, and who follow the office deadline (no own date),
 * about a new deadline: one bell notification per requirement. Returns how many were written.
 */
export async function notifyNewOfficeDeadline(
  tx: Db,
  office: TargetOffice,
  term: CurrentTerm,
  due: Date,
  note: string | null,
): Promise<number> {
  const title = cut(`New deadline: ${office.name}`, 120);
  const after = `" by ${prettyDue(due)}.${note ? ` ${note}` : ''}`;
  return tx.$executeRaw`
    INSERT INTO notifications (user_id, item_id, tone, title, body)
    SELECT u.user_id, ci.item_id, 'info'::"NotificationTone", ${title}::varchar,
           LEFT(${'Finish "'}::text || ci.task || ${after}::text, 255)
      FROM clearance_items ci
      JOIN clearances c ON c.clearance_id = ci.clearance_id
      JOIN students s   ON s.student_id = c.student_id
      JOIN users u      ON u.user_id = s.user_id AND u.is_active
     WHERE ci.office_id = ${office.id}
       AND c.academic_year_id = ${term.academicYearId}
       AND c.term = ${term.term}::"Term"
       AND ci.status <> 'approved'
       AND ci.due_at IS NULL`;
}
