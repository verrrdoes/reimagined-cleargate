import 'server-only';
import { cache } from 'react';
import { db } from '@/lib/db';
import { deadlineMap, effectiveDue, summarize } from '@/lib/services/clearance';
import { studentRecords, type StudentRecord } from '@/lib/services/officeRecords';
import { STATUS, TERM_LABEL } from '@/lib/constants';
import type { SessionUser } from '@/lib/auth/session';
import type { ItemStatus, SubmissionStatusName, TermName } from '@/lib/types';

/*
 * The student payload (HANDOFF §8.2): the student's latest clearance with its summary, and every item
 * with its office, effective deadline, latest submission and message counts. Dates are ISO strings so
 * the result can go straight to client components.
 */

export type StudentProfile = {
  studentNumber: string;
  firstName: string;
  lastName: string;
  yearLevel: number;
  program: string;
  programName: string;
};

export type StudentClearanceSummary = {
  clearanceId: number;
  academicYear: string;
  term: TermName;
  termLabel: string;
  totalOffices: number;
  approvedCount: number;
  pendingCount: number;
  needsActionCount: number;
  percentComplete: number;
  isEligible: boolean;
};

/** The latest submission for an item that is not `replaced` (by submitted time). */
export type StudentSubmission = {
  id: number;
  reference: string | null;
  status: SubmissionStatusName;
  fileName: string;
  mimeType: string;
  fileSize: number;
  note: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  returnCategory: string | null;
  reviewNote: string | null;
};

export type StudentItem = {
  itemId: number;
  officeCode: string;
  officeName: string;
  officeIcon: string;
  email: string;
  hours: string;
  status: ItemStatus;
  task: string;
  remarks: string;
  description: string;
  nextStep: string | null;
  updatedAt: string;
  approvedAt: string | null;
  /** Effective deadline: the student's own one, else the office deadline for the term. */
  dueAt: string | null;
  /** True when the effective deadline is the student's own (set on this item). */
  dueOwn: boolean;
  ownDueAt: string | null;
  officeDueAt: string | null;
  /** The office deadline's note (applies when the deadline is not the student's own). */
  dueNote: string | null;
  submission: StudentSubmission | null;
  /** `unread` counts office messages the student has not opened yet. */
  messages: { total: number; unread: number };
  /** What the office has on record against the student (borrowed books, balances...), open ones first. */
  records: StudentRecord[];
};

export type StudentClearance = {
  student: StudentProfile | null;
  clearance: StudentClearanceSummary | null;
  items: StudentItem[];
  serverNow: string;
};

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/**
 * The signed-in student's latest clearance: newest academic year by start date, then newest term
 * (not limited to the current year). Items are ordered needs action, pending, approved, then by the
 * office's sort order. Cached per request.
 */
export const getStudentClearance = cache(async (user: SessionUser): Promise<StudentClearance> => {
  const serverNow = new Date().toISOString();
  const s = user.student;
  if (!s) return { student: null, clearance: null, items: [], serverNow };

  const student: StudentProfile = {
    studentNumber: s.studentNumber,
    firstName: s.firstName,
    lastName: s.lastName,
    yearLevel: s.yearLevel,
    program: s.program.code,
    programName: s.program.name,
  };

  const clearance = await db.clearance.findFirst({
    where: { studentId: s.id },
    orderBy: [{ academicYear: { startDate: 'desc' } }, { term: 'desc' }, { id: 'desc' }],
    select: { id: true, academicYearId: true, term: true, academicYear: { select: { label: true } } },
  });
  if (!clearance) return { student, clearance: null, items: [], serverNow };

  const [rows, deadlines] = await Promise.all([
    db.clearanceItem.findMany({
      where: { clearanceId: clearance.id },
      orderBy: [{ status: 'asc' }, { office: { sortOrder: 'asc' } }, { id: 'asc' }],
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
        approvedAt: true,
        office: { select: { code: true, name: true, icon: true, contactEmail: true, officeHours: true, sortOrder: true } },
      },
    }),
    deadlineMap(clearance.academicYearId, clearance.term),
  ]);

  // The enum is declared in display order, but sort here too so the order never depends on the database.
  rows.sort(
    (a, b) => STATUS[a.status].order - STATUS[b.status].order || a.office.sortOrder - b.office.sortOrder || a.id - b.id,
  );

  const ids = rows.map((r) => r.id);
  const latest = new Map<number, StudentSubmission>();
  const totals = new Map<number, number>();
  const unread = new Map<number, number>();
  let records = new Map<number, StudentRecord[]>();

  if (ids.length) {
    const [submissions, totalCounts, unreadCounts, recordMap] = await Promise.all([
      db.submission.findMany({
        where: { itemId: { in: ids }, status: { not: 'replaced' } },
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          itemId: true,
          reference: true,
          status: true,
          originalName: true,
          mimeType: true,
          fileSize: true,
          studentNote: true,
          submittedAt: true,
          reviewedAt: true,
          returnCategory: true,
          reviewNote: true,
        },
      }),
      db.officeMessage.groupBy({ by: ['itemId'], where: { itemId: { in: ids } }, _count: { _all: true } }),
      db.officeMessage.groupBy({
        by: ['itemId'],
        where: { itemId: { in: ids }, senderRole: { not: 'student' }, readAt: null },
        _count: { _all: true },
      }),
      studentRecords(ids, new Map(rows.map((r) => [r.id, r.office.code]))),
    ]);
    records = recordMap;

    // Oldest first, so the last one written per item is the latest.
    for (const sub of submissions) {
      latest.set(sub.itemId, {
        id: sub.id,
        reference: sub.reference,
        status: sub.status,
        fileName: sub.originalName,
        mimeType: sub.mimeType,
        fileSize: sub.fileSize,
        note: sub.studentNote,
        submittedAt: sub.submittedAt.toISOString(),
        reviewedAt: iso(sub.reviewedAt),
        returnCategory: sub.returnCategory,
        reviewNote: sub.reviewNote,
      });
    }
    for (const c of totalCounts) totals.set(c.itemId, c._count._all);
    for (const c of unreadCounts) unread.set(c.itemId, c._count._all);
  }

  const items: StudentItem[] = rows.map((r) => {
    const due = effectiveDue({ dueAt: r.dueAt, officeId: r.officeId }, deadlines);
    return {
      itemId: r.id,
      officeCode: r.office.code,
      officeName: r.office.name,
      officeIcon: r.office.icon,
      email: r.office.contactEmail,
      hours: r.office.officeHours,
      status: r.status,
      task: r.task,
      remarks: r.remarks,
      description: r.description,
      nextStep: r.nextStep,
      updatedAt: r.updatedAt.toISOString(),
      approvedAt: iso(r.approvedAt),
      dueAt: iso(due.dueAt),
      dueOwn: due.ownDueAt !== null,
      ownDueAt: iso(due.ownDueAt),
      officeDueAt: iso(due.officeDueAt),
      dueNote: due.dueNote,
      submission: latest.get(r.id) ?? null,
      messages: { total: totals.get(r.id) ?? 0, unread: unread.get(r.id) ?? 0 },
      records: records.get(r.id) ?? [],
    };
  });

  const sum = summarize(rows);
  return {
    student,
    clearance: {
      clearanceId: clearance.id,
      academicYear: clearance.academicYear.label,
      term: clearance.term,
      termLabel: TERM_LABEL[clearance.term],
      ...sum,
    },
    items,
    serverNow,
  };
});
