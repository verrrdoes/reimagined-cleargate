// Shapes for the Deadlines and reminders page and its dialogs. Client-safe: dates are ISO strings.
import type { ItemStatus } from '@/lib/types';

export type ReminderAudienceName = 'outstanding' | 'overdue' | 'student';

/** One office row: its deadline for the current term and how its students stand. */
export type DeadlineOffice = {
  id: number;
  code: string;
  name: string;
  icon: string;
  /** Students the office never updated are cleared when the deadline passes (Settings, Offices). */
  autoClear: boolean;
  dueAt: string | null;
  note: string | null;
  /** Who last set the deadline (staff name, admin name, "System Administrator" or the email). */
  setBy: string | null;
  updatedAt: string | null;
  /** Active students with a requirement at this office this term. */
  students: number;
  /** Of those, not approved yet. */
  outstanding: number;
  /** Not approved and past their effective deadline (own date, else the office date). */
  overdue: number;
  /** Requirements with a student's own deadline. */
  ownDeadlines: number;
};

/** One clearance requirement of the current term, for the student pickers and the own-deadline list. */
export type DeadlineItem = {
  id: number;
  studentName: string;
  studentNumber: string;
  officeCode: string;
  officeName: string;
  status: ItemStatus;
  task: string;
  /** The student's own deadline on this requirement, or null when the office deadline applies. */
  ownDueAt: string | null;
  officeDueAt: string | null;
};

export type ReminderRow = {
  id: number;
  /** Null for an every-office reminder from an administrator. */
  officeCode: string | null;
  officeName: string | null;
  audience: ReminderAudienceName;
  message: string;
  sendAt: string;
  sentAt: string | null;
  cancelledAt: string | null;
  recipients: number | null;
  createdByName: string | null;
  studentName: string | null;
  studentNumber: string | null;
};

/** The office a dialog works on: code, name and its current deadline. */
export type OfficeChoice = { code: string; name: string; dueAt: string | null };

export type DeadlinesView = {
  /** Null when no current academic year is set. */
  term: { text: string; label: string; termLabel: string } | null;
  /** True for a staff account that is not linked to an office. */
  noOffice: boolean;
  isAdmin: boolean;
  /** The signed-in staff member's office code; null for admins. */
  ownOfficeCode: string | null;
  offices: DeadlineOffice[];
  items: DeadlineItem[];
  reminders: ReminderRow[];
  serverNow: string;
};
