// Serializable shapes for the staff review area. Shared by lib/services/review.ts, the actions and the client
// components (no server imports here). Dates cross the boundary as ISO strings.
import type { ItemStatus, SubmissionStatusName } from '@/lib/types';

/** One office cell of a student's clearance slip (ClearanceSlip mini in table rows). */
export type SlipOffice = {
  officeCode: string;
  officeName: string;
  icon: string;
  status: ItemStatus;
  approvedAt: string | null;
};

export type PendingRow = {
  id: number;
  reference: string;
  fileName: string;
  mimeType: string;
  submittedAt: string;
  resubmitted: boolean;
  studentName: string;
  studentNumber: string;
  program: string;
  yearLevel: number;
  officeCode: string;
  officeName: string;
  task: string;
  slip: SlipOffice[];
};

export type PendingData = {
  rows: PendingRow[];
  submittedToday: number;
  approvedToday: number;
  returnedToday: number;
  /** "1st Semester, A.Y 2026 - 2027", or null without a current academic year. */
  termLabel: string | null;
};

/** Another submission for the same requirement (the review page's history). */
export type SubmissionHistoryEntry = {
  id: number;
  reference: string;
  status: SubmissionStatusName;
  fileName: string;
  submittedAt: string;
  reviewedAt: string | null;
  returnCategory: string | null;
  reviewNote: string | null;
  reviewer: string | null;
};

export type SubmissionDetail = {
  id: number;
  reference: string;
  status: SubmissionStatusName;
  resubmitted: boolean;
  fileName: string;
  mimeType: string;
  fileSize: number;
  note: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewer: string | null;
  returnCategory: string | null;
  reviewNote: string | null;
  checklist: string[];
  student: {
    name: string;
    firstName: string;
    number: string;
    program: string;
    programName: string;
    yearLevel: number;
    email: string;
  };
  item: {
    id: number;
    status: ItemStatus;
    task: string;
    remarks: string;
    description: string;
    nextStep: string | null;
    updatedAt: string;
  };
  office: { code: string; name: string; email: string };
  academicYear: string;
  /** Term label, e.g. "1st Semester". */
  term: string;
  history: SubmissionHistoryEntry[];
};

/** What reviewSubmission() returns: the updated submission, the item status before, and the student's notification. */
export type ReviewOutcome = SubmissionDetail & {
  previousItemStatus: ItemStatus;
  notification: { title: string; body: string; createdAt: string } | null;
};

export type ReviewDecision = 'approve' | 'return';

export type HistoryRow = {
  id: number;
  reference: string;
  status: 'approved' | 'returned';
  fileName: string;
  submittedAt: string;
  reviewedAt: string | null;
  returnCategory: string | null;
  reviewNote: string | null;
  studentName: string;
  studentNumber: string;
  program: string;
  yearLevel: number;
  officeCode: string;
  officeName: string;
  reviewer: string | null;
};

/** One row of the Clearance Status queue (current year and term). */
export type QueueRow = {
  itemId: number;
  studentName: string;
  studentNumber: string;
  officeCode: string;
  officeName: string;
  status: ItemStatus;
  task: string;
  remarks: string;
  description: string;
  nextStep: string | null;
  updatedAt: string;
  /** Effective deadline: the student's own, else the office deadline. */
  dueAt: string | null;
  ownDueAt: string | null;
  officeDueAt: string | null;
  /** The upload waiting for review, if any: such rows are reviewed, not approved with Approve selected. */
  waitingSubmissionId: number | null;
};

export type QueueData = {
  rows: QueueRow[];
  /** "2026 - 2027", or null without a current academic year. */
  academicYear: string | null;
  /** "1st Semester", or null without a current academic year. */
  term: string | null;
};

/** What Approve selected returns: how many were approved, and how many were skipped (approved already, or an upload came in). */
export type BulkApproveResult = { approved: number; skipped: number };

export type ItemUpdateResult = {
  itemId: number;
  officeCode: string;
  studentName: string;
  status: ItemStatus;
  task: string;
  remarks: string;
  nextStep: string | null;
  updatedAt: string;
  approvedAt: string | null;
};
