import 'server-only';
import { db, type Db } from '@/lib/db';
import { fail } from '@/lib/result';
import { itemOfficeWhere, type SessionUser } from '@/lib/auth/guards';
import { currentTerm, deadlineMap, effectiveDue, termText } from '@/lib/services/clearance';
import { LIMITS, TERM_LABEL } from '@/lib/constants';
import { manilaDayStart, manilaYmd } from '@/lib/time';
import type { Prisma, Role } from '@/generated/prisma/client';
import type { OfficeRef } from '@/lib/types';
import type {
  HistoryRow,
  PendingData,
  PendingRow,
  QueueData,
  SlipOffice,
  SubmissionDetail,
  SubmissionHistoryEntry,
} from '@/components/staff/types';

/* ---------- shared helpers ---------- */

/** Legacy reviewerName(): the person's full name, "System Administrator" for an admin without one, else the email. */
export function reviewerName(fullName: string | null | undefined, role: Role | null | undefined, email: string | null | undefined): string | null {
  if (fullName) return fullName;
  if (role === 'admin') return 'System Administrator';
  return email ?? null;
}

const reviewerSelect = {
  select: { email: true, role: true, fullName: true, staffProfile: { select: { fullName: true } } },
} satisfies Prisma.UserDefaultArgs;

type ReviewerRow = { email: string; role: Role; fullName: string | null; staffProfile: { fullName: string } | null } | null;

const nameOfReviewer = (u: ReviewerRow) => (u ? reviewerName(u.staffProfile?.fullName ?? u.fullName, u.role, u.email) : null);

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** A submission's reference; older rows may not have one yet. */
const refOf = (s: { id: number; reference: string | null }) => s.reference ?? `#${s.id}`;

const checklistOf = (v: Prisma.JsonValue | null): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Admins pick an office with ?office=; staff get null (their own office always applies). */
export async function officeChoices(user: SessionUser): Promise<OfficeRef[] | null> {
  if (user.role !== 'admin') return null;
  return db.office.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { code: true, name: true } });
}

/** The admin's ?office= value when it names a real office; anything else means every office. */
export function pickOffice(choices: OfficeRef[] | null, raw: string | null | undefined): string | null {
  if (!choices || !raw) return null;
  return choices.some((o) => o.code === raw) ? raw : null;
}

/* ---------- §8.5 pending list ---------- */

const slipItems = {
  select: { status: true, approvedAt: true, office: { select: { code: true, name: true, icon: true } } },
  orderBy: [{ office: { sortOrder: 'asc' } }, { officeId: 'asc' }],
} satisfies Prisma.Clearance$itemsArgs;

function toSlip(items: { status: SlipOffice['status']; approvedAt: Date | null; office: { code: string; name: string; icon: string } }[]): SlipOffice[] {
  return items.map((i) => ({
    officeCode: i.office.code,
    officeName: i.office.name,
    icon: i.office.icon,
    status: i.status,
    approvedAt: iso(i.approvedAt),
  }));
}

/**
 * Submissions waiting for review in the current academic year (not filtered by term, §17 item 2),
 * newest first, with today's counts (Manila day, all years) and the current term label.
 */
export async function pendingList(user: SessionUser, officeCode: string | null): Promise<PendingData> {
  const officeWhere = itemOfficeWhere(user, officeCode);
  const today = manilaDayStart(manilaYmd());

  const [subs, submittedToday, approvedToday, returnedToday, term] = await Promise.all([
    db.submission.findMany({
      where: { status: 'submitted', item: { ...officeWhere, clearance: { academicYear: { isCurrent: true } } } },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        itemId: true,
        reference: true,
        originalName: true,
        mimeType: true,
        submittedAt: true,
        item: {
          select: {
            task: true,
            office: { select: { code: true, name: true } },
            clearance: {
              select: {
                student: {
                  select: { firstName: true, lastName: true, studentNumber: true, yearLevel: true, program: { select: { code: true } } },
                },
                items: slipItems,
              },
            },
          },
        },
      },
    }),
    db.submission.count({ where: { submittedAt: { gte: today }, item: officeWhere } }),
    db.submission.count({ where: { status: 'approved', reviewedAt: { gte: today }, item: officeWhere } }),
    db.submission.count({ where: { status: 'returned', reviewedAt: { gte: today }, item: officeWhere } }),
    currentTerm(),
  ]);

  // Resubmitted = an earlier submission for the same item was returned.
  const itemIds = [...new Set(subs.map((s) => s.itemId))];
  const returned = itemIds.length
    ? await db.submission.findMany({ where: { itemId: { in: itemIds }, status: 'returned' }, select: { itemId: true, submittedAt: true } })
    : [];
  const earliestReturn = new Map<number, number>();
  for (const r of returned) {
    const t = r.submittedAt.getTime();
    const seen = earliestReturn.get(r.itemId);
    if (seen === undefined || t < seen) earliestReturn.set(r.itemId, t);
  }

  const rows: PendingRow[] = subs.map((s) => {
    const student = s.item.clearance.student;
    return {
      id: s.id,
      reference: refOf(s),
      fileName: s.originalName,
      mimeType: s.mimeType,
      submittedAt: s.submittedAt.toISOString(),
      resubmitted: (earliestReturn.get(s.itemId) ?? Infinity) < s.submittedAt.getTime(),
      studentName: `${student.firstName} ${student.lastName}`,
      studentNumber: student.studentNumber,
      program: student.program.code,
      yearLevel: student.yearLevel,
      officeCode: s.item.office.code,
      officeName: s.item.office.name,
      task: s.item.task,
      slip: toSlip(s.item.clearance.items),
    };
  });

  return { rows, submittedToday, approvedToday, returnedToday, termLabel: term ? termText(term) : null };
}

/* ---------- §8.5 submission detail ---------- */

const detailInclude = {
  item: {
    include: {
      office: { select: { id: true, code: true, name: true, contactEmail: true } },
      clearance: {
        select: {
          term: true,
          academicYear: { select: { label: true } },
          student: {
            select: {
              userId: true,
              firstName: true,
              lastName: true,
              studentNumber: true,
              yearLevel: true,
              program: { select: { code: true, name: true } },
              user: { select: { email: true } },
            },
          },
        },
      },
    },
  },
  reviewedBy: reviewerSelect,
} satisfies Prisma.SubmissionInclude;

export type LoadedSubmission = Prisma.SubmissionGetPayload<{ include: typeof detailInclude }>;

/**
 * Loads a submission after the §8.5 access check: admins, staff of the item's office, and (only when
 * `allowStudent`, i.e. the file route) the student who owns it. 404 not_found / 403 forbidden.
 */
export async function loadSubmission(tx: Db, id: number, user: SessionUser, allowStudent = false): Promise<LoadedSubmission> {
  const s = await tx.submission.findUnique({ where: { id }, include: detailInclude });
  if (!s) fail(404, 'not_found', 'That submission was not found.');
  const allowed =
    user.role === 'admin' ||
    (user.role === 'staff' && user.staffProfile?.officeId === s.item.officeId) ||
    (allowStudent && user.role === 'student' && s.item.clearance.student.userId === user.id);
  if (!allowed) fail(403, 'forbidden', 'You cannot open this submission.');
  return s;
}

/** The §8.5 submission payload, with the other submissions for the same item (newest first). */
export async function submissionPayload(tx: Db, s: LoadedSubmission): Promise<SubmissionDetail> {
  const others = await tx.submission.findMany({
    where: { itemId: s.itemId, id: { not: s.id } },
    orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
    include: { reviewedBy: reviewerSelect },
  });
  const history: SubmissionHistoryEntry[] = others.map((h) => ({
    id: h.id,
    reference: refOf(h),
    status: h.status,
    fileName: h.originalName,
    submittedAt: h.submittedAt.toISOString(),
    reviewedAt: iso(h.reviewedAt),
    returnCategory: h.returnCategory,
    reviewNote: h.reviewNote,
    reviewer: nameOfReviewer(h.reviewedBy),
  }));
  const student = s.item.clearance.student;

  return {
    id: s.id,
    reference: refOf(s),
    status: s.status,
    resubmitted: others.some((h) => h.status === 'returned' && h.submittedAt < s.submittedAt),
    fileName: s.originalName,
    mimeType: s.mimeType,
    fileSize: s.fileSize,
    note: s.studentNote,
    submittedAt: s.submittedAt.toISOString(),
    reviewedAt: iso(s.reviewedAt),
    reviewer: nameOfReviewer(s.reviewedBy),
    returnCategory: s.returnCategory,
    reviewNote: s.reviewNote,
    checklist: checklistOf(s.checklist),
    student: {
      name: `${student.firstName} ${student.lastName}`,
      firstName: student.firstName,
      number: student.studentNumber,
      program: student.program.code,
      programName: student.program.name,
      yearLevel: student.yearLevel,
      email: student.user.email,
    },
    item: {
      id: s.item.id,
      status: s.item.status,
      task: s.item.task,
      remarks: s.item.remarks,
      description: s.item.description,
      nextStep: s.item.nextStep,
      updatedAt: s.item.updatedAt.toISOString(),
    },
    office: { code: s.item.office.code, name: s.item.office.name, email: s.item.office.contactEmail },
    academicYear: s.item.clearance.academicYear.label,
    term: TERM_LABEL[s.item.clearance.term],
    history,
  };
}

/** Staff/admin view of one submission (students only reach the file route). */
export async function submissionDetail(user: SessionUser, id: number): Promise<SubmissionDetail> {
  return submissionPayload(db, await loadSubmission(db, id, user));
}

/* ---------- §8.5 review history ---------- */

/** Approved and returned submissions, office-filtered, newest review first, at most 300. */
export async function reviewHistory(user: SessionUser, officeCode: string | null, decision: 'approved' | 'returned' | null = null): Promise<HistoryRow[]> {
  const rows = await db.submission.findMany({
    where: { status: decision ?? { in: ['approved', 'returned'] }, item: itemOfficeWhere(user, officeCode) },
    orderBy: [{ reviewedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    take: LIMITS.historyList,
    select: {
      id: true,
      reference: true,
      status: true,
      originalName: true,
      submittedAt: true,
      reviewedAt: true,
      returnCategory: true,
      reviewNote: true,
      reviewedBy: reviewerSelect,
      item: {
        select: {
          office: { select: { code: true, name: true } },
          clearance: {
            select: {
              student: { select: { firstName: true, lastName: true, studentNumber: true, yearLevel: true, program: { select: { code: true } } } },
            },
          },
        },
      },
    },
  });

  return rows.map((r) => {
    const student = r.item.clearance.student;
    return {
      id: r.id,
      reference: refOf(r),
      status: r.status === 'approved' ? 'approved' : 'returned',
      fileName: r.originalName,
      submittedAt: r.submittedAt.toISOString(),
      reviewedAt: iso(r.reviewedAt),
      returnCategory: r.returnCategory,
      reviewNote: r.reviewNote,
      studentName: `${student.firstName} ${student.lastName}`,
      studentNumber: student.studentNumber,
      program: student.program.code,
      yearLevel: student.yearLevel,
      officeCode: r.item.office.code,
      officeName: r.item.office.name,
      reviewer: nameOfReviewer(r.reviewedBy),
    };
  });
}

/* ---------- §8.5 Clearance Status queue ---------- */

/**
 * Every item of the current year and term, office-filtered, ordered by status (needs action, pending,
 * approved) then student name, with the effective, own and office deadlines.
 */
export async function officeQueue(user: SessionUser, officeCode: string | null): Promise<QueueData> {
  const term = await currentTerm();
  if (!term) return { rows: [], academicYear: null, term: null };

  const [items, deadlines] = await Promise.all([
    db.clearanceItem.findMany({
      where: { ...itemOfficeWhere(user, officeCode), clearance: { academicYearId: term.academicYearId, term: term.term } },
      orderBy: [
        { status: 'asc' },
        { clearance: { student: { firstName: 'asc' } } },
        { clearance: { student: { lastName: 'asc' } } },
        { id: 'asc' },
      ],
      select: {
        id: true,
        officeId: true,
        status: true,
        task: true,
        remarks: true,
        description: true,
        nextStep: true,
        dueAt: true,
        updatedAt: true,
        office: { select: { code: true, name: true } },
        clearance: { select: { student: { select: { firstName: true, lastName: true, studentNumber: true } } } },
        submissions: { where: { status: 'submitted' }, orderBy: { submittedAt: 'desc' }, take: 1, select: { id: true } },
      },
    }),
    deadlineMap(term.academicYearId, term.term),
  ]);

  return {
    academicYear: term.label,
    term: term.termLabel,
    rows: items.map((i) => {
      const due = effectiveDue(i, deadlines);
      const student = i.clearance.student;
      return {
        itemId: i.id,
        studentName: `${student.firstName} ${student.lastName}`,
        studentNumber: student.studentNumber,
        officeCode: i.office.code,
        officeName: i.office.name,
        status: i.status,
        task: i.task,
        remarks: i.remarks,
        description: i.description,
        nextStep: i.nextStep,
        updatedAt: i.updatedAt.toISOString(),
        dueAt: iso(due.dueAt),
        ownDueAt: iso(due.ownDueAt),
        officeDueAt: iso(due.officeDueAt),
        waitingSubmissionId: i.submissions[0]?.id ?? null,
      };
    }),
  };
}
