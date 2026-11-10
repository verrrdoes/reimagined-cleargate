import 'server-only';
import { db } from '@/lib/db';
import { currentTerm, termText } from '@/lib/services/clearance';
import { reviewerName } from '@/lib/services/review';
import { bucketOf, countBuckets, recentActivity, type ActivityEvent, type ActivityLine, type BucketCounts } from '@/lib/officeOverview';
import type { Prisma } from '@/generated/prisma/client';

// The staff Dashboard (/overview) for one office in the current term. The rules are in lib/officeOverview.ts.

export type OverviewStudent = { itemId: number; name: string; number: string };
export type OverviewUpload = OverviewStudent & { submissionId: number; file: string; submittedAt: string; resubmitted: boolean };
export type OverviewOwed = OverviewStudent & { remarks: string; since: string };
export type OverviewThread = OverviewStudent & { unread: number; lastAt: string };

export type OfficeOverview = {
  office: { id: number; code: string; name: string; autoClear: boolean; dailyDigest: boolean };
  termLabel: string;
  /** Same items as Clearance status: every student with a clearance this term. */
  counts: BucketCounts;
  /** Uploads waiting for review this term, oldest first. */
  uploads: OverviewUpload[];
  /** Marked Needs action with nothing uploaded since, longest waiting first. */
  owed: OverviewOwed[];
  /** Pending with no upload: the first few names, A to Z. */
  unreviewedNames: string[];
  /** Conversations with unread student messages (any term, like the Messages badge), newest first. */
  threads: OverviewThread[];
  unreadMessages: number;
  deadline: { dueAt: string; note: string | null } | null;
  lastReminder: { sentAt: string; recipients: number | null } | null;
  nextReminder: { sendAt: string } | null;
  activity: ActivityLine[];
  staff: { name: string; position: string | null; active: boolean; lastLoginAt: string | null }[];
};

const studentSelect = {
  select: { student: { select: { firstName: true, lastName: true, studentNumber: true } } },
} satisfies Prisma.ClearanceDefaultArgs;

type StudentRow = { student: { firstName: string; lastName: string; studentNumber: string } };
const nameOf = (c: StudentRow) => `${c.student.firstName} ${c.student.lastName}`;

const actorSelect = {
  select: { role: true, email: true, fullName: true, staffProfile: { select: { fullName: true } } },
} satisfies Prisma.UserDefaultArgs;

const ACTIVITY_LIMIT = 5;
const UNREVIEWED_NAMES = 3;

export async function officeOverview(which: { id: number } | { code: string }, now = new Date()): Promise<OfficeOverview | null> {
  const [term, officeId] = await Promise.all([
    currentTerm(),
    'id' in which ? which.id : db.office.findUnique({ where: { code: which.code }, select: { id: true } }).then((o) => o?.id ?? null),
  ]);
  if (!term || officeId === null) return null;
  const termWhere = { academicYearId: term.academicYearId, term: term.term };
  const itemWhere: Prisma.ClearanceItemWhereInput = { officeId, clearance: termWhere };

  const [office, items, unread, lastReminder, nextReminder, uploads, logs] = await Promise.all([
    db.office.findUnique({
      where: { id: officeId },
      select: {
        id: true,
        code: true,
        name: true,
        autoClear: true,
        dailyDigest: true,
        staff: {
          orderBy: { fullName: 'asc' },
          select: { fullName: true, position: true, user: { select: { isActive: true, lastLoginAt: true } } },
        },
        deadlines: { where: termWhere, select: { dueAt: true, note: true } },
      },
    }),
    db.clearanceItem.findMany({
      where: itemWhere,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        status: true,
        remarks: true,
        updatedAt: true,
        clearance: studentSelect,
        submissions: {
          where: { status: 'submitted' },
          orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
          take: 1,
          select: { id: true, originalName: true, submittedAt: true },
        },
        _count: { select: { submissions: { where: { status: 'returned' } } } },
      },
    }),
    // Same filter as the Messages badge in the staff shell.
    db.officeMessage.findMany({
      where: { readAt: null, senderRole: 'student', item: { officeId } },
      orderBy: { createdAt: 'desc' },
      select: { itemId: true, createdAt: true, item: { select: { clearance: studentSelect } } },
    }),
    db.reminder.findFirst({
      where: { officeId, ...termWhere, sentAt: { not: null } },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true, recipients: true },
    }),
    db.reminder.findFirst({
      where: { officeId, ...termWhere, sentAt: null, cancelledAt: null },
      orderBy: { sendAt: 'asc' },
      select: { sendAt: true },
    }),
    db.submission.findMany({
      where: { item: itemWhere },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      take: ACTIVITY_LIMIT,
      select: { submittedAt: true, originalName: true, item: { select: { clearance: studentSelect } } },
    }),
    db.clearanceItemLog.findMany({
      where: { item: itemWhere, OR: [{ changedById: null }, { changedBy: { role: { not: 'student' } } }] },
      orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
      take: ACTIVITY_LIMIT,
      select: { changedAt: true, newStatus: true, note: true, changedBy: actorSelect, item: { select: { clearance: studentSelect } } },
    }),
  ]);
  if (!office) return null;

  const rows = items.map((i) => {
    const upload = i.submissions[0] ?? null;
    return { ...i, upload, bucket: bucketOf({ status: i.status, hasUpload: upload !== null }), name: nameOf(i.clearance) };
  });
  const student = (r: (typeof rows)[number]): OverviewStudent => ({ itemId: r.id, name: r.name, number: r.clearance.student.studentNumber });

  const threads = new Map<number, OverviewThread>();
  for (const m of unread) {
    const t = threads.get(m.itemId);
    if (t) t.unread += 1;
    else {
      threads.set(m.itemId, {
        itemId: m.itemId,
        name: nameOf(m.item.clearance),
        number: m.item.clearance.student.studentNumber,
        unread: 1,
        lastAt: m.createdAt.toISOString(),
      });
    }
  }

  const events: ActivityEvent[] = [
    ...uploads.map((s): ActivityEvent => ({ kind: 'upload', at: s.submittedAt, student: nameOf(s.item.clearance), file: s.originalName })),
    ...logs.map(
      (l): ActivityEvent => ({
        kind: 'status',
        at: l.changedAt,
        student: nameOf(l.item.clearance),
        actor: l.changedBy ? reviewerName(l.changedBy.staffProfile?.fullName ?? l.changedBy.fullName, l.changedBy.role, l.changedBy.email) : null,
        actorRole: l.changedBy?.role ?? null,
        to: l.newStatus,
        note: l.note,
      }),
    ),
  ];

  const deadline = office.deadlines[0] ?? null;
  return {
    office: { id: office.id, code: office.code, name: office.name, autoClear: office.autoClear, dailyDigest: office.dailyDigest },
    termLabel: termText(term),
    counts: countBuckets(rows.map((r) => ({ status: r.status, hasUpload: r.upload !== null }))),
    uploads: rows
      .filter((r) => r.bucket === 'waiting' && r.upload)
      .sort((a, b) => a.upload!.submittedAt.getTime() - b.upload!.submittedAt.getTime() || a.id - b.id)
      .map((r) => ({
        ...student(r),
        submissionId: r.upload!.id,
        file: r.upload!.originalName,
        submittedAt: r.upload!.submittedAt.toISOString(),
        resubmitted: r._count.submissions > 0,
      })),
    owed: rows
      .filter((r) => r.bucket === 'student')
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || a.id - b.id)
      .map((r) => ({ ...student(r), remarks: r.remarks, since: r.updatedAt.toISOString() })),
    unreviewedNames: rows
      .filter((r) => r.bucket === 'unreviewed')
      .map((r) => r.name)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, UNREVIEWED_NAMES),
    threads: [...threads.values()],
    unreadMessages: unread.length,
    deadline: deadline ? { dueAt: deadline.dueAt.toISOString(), note: deadline.note } : null,
    lastReminder: lastReminder?.sentAt ? { sentAt: lastReminder.sentAt.toISOString(), recipients: lastReminder.recipients } : null,
    nextReminder: nextReminder ? { sendAt: nextReminder.sendAt.toISOString() } : null,
    activity: recentActivity(events, ACTIVITY_LIMIT),
    staff: office.staff.map((s) => ({
      name: s.fullName,
      position: s.position,
      active: s.user.isActive,
      lastLoginAt: s.user.lastLoginAt?.toISOString() ?? null,
    })),
  };
}
