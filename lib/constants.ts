// Fixed lists and limits (HANDOFF §10.2–10.3). Client-safe.
import type { ItemStatus, SubmissionStatusName, TermName } from '@/lib/types';

export const SCHOOL_DOMAIN = 'cgateway.edu.ph';

export const TERM_LABEL: Record<TermName, string> = {
  first_semester: '1st Semester',
  second_semester: '2nd Semester',
  summer: 'Summer',
};
export const TERMS = ['first_semester', 'second_semester', 'summer'] as const satisfies readonly TermName[];
export function termFrom(value: unknown): TermName | null {
  if (typeof value !== 'string') return null;
  if ((TERMS as readonly string[]).includes(value)) return value as TermName;
  const hit = TERMS.find((t) => TERM_LABEL[t] === value);
  return hit ?? null;
}

export const ADMISSION_TYPES = ['New student', 'Transferee', 'Returnee', 'Cross-enrollee'] as const;
export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated'] as const;
export const OFFICE_ICONS = ['book', 'wallet', 'file', 'heart', 'cap', 'box'] as const;
export type OfficeIconKey = (typeof OFFICE_ICONS)[number];

/** Status display. `tone` picks the pill colour class: pill--action, pill--pending, pill--approved. */
export const STATUS: Record<ItemStatus, { label: string; tone: 'action' | 'pending' | 'approved'; order: number }> = {
  needs_action: { label: 'Needs action', tone: 'action', order: 0 },
  pending: { label: 'Pending', tone: 'pending', order: 1 },
  approved: { label: 'Approved', tone: 'approved', order: 2 },
};
export const ITEM_STATUSES = ['needs_action', 'pending', 'approved'] as const satisfies readonly ItemStatus[];

export const SUBMISSION_BADGE: Record<SubmissionStatusName | 'resubmitted', { label: string; tone: string }> = {
  submitted: { label: 'Pending review', tone: 'pending' },
  resubmitted: { label: 'Resubmitted', tone: 'info' },
  approved: { label: 'Approved', tone: 'approved' },
  returned: { label: 'Returned', tone: 'action' },
  replaced: { label: 'Replaced', tone: 'muted' },
};

export const RETURN_REASONS = [
  'Incomplete or unverified evidence',
  'Wrong document uploaded',
  'File is unreadable or cut off',
  "Details don't match office records",
  'Outstanding balance or liability',
  'Other',
] as const;

export const LIMITS = {
  evidenceMB: 5,
  photoMB: 5,
  avatarMB: 2,
  loginFailuresPerLogin: 5,
  loginFailuresPerIp: 20,
  lockoutMinutes: 15,
  applicationsPerIpPerWindow: 10,
  messagesPerMinute: 20,
  idleTimeoutMinutes: 120,
  rememberDays: 30,
  resetTokenMinutes: 30,
  passwordRequestHours: 24,
  passwordRequestAllowMinutes: 15,
  passwordRequestsPerLogin: 3,
  passwordRequestsPerIp: 50,
  passwordRequestsList: 200,
  notificationsShown: 30,
  applicationsList: 500,
  historyList: 300,
  threadsList: 300,
  auditRows: 1000,
  auditDefaultDays: 90,
  remindersList: 100,
  pendingPageSize: 8,
} as const;

export const MB = 1024 * 1024;

export const CHECKLISTS: Record<string, readonly string[]> = {
  library: ['Student ID matches the submission', 'All borrowed books are returned', 'No unpaid library fines', 'Return slip is verified in the ledger'],
  accounting: ['Student ID matches the submission', 'Receipt amount matches the balance', 'OR number is verified in cashier records', 'No remaining balance'],
  registrar: ['Student ID matches the submission', 'Required forms are complete', 'Documents are signed and readable', 'Details match the registrar file'],
  guidance: ['Student ID matches the submission', 'Exit interview form is complete', 'No open guidance referral', 'Counselor signature is present'],
  dean: ['Student ID matches the submission', 'No incomplete grades', 'No pending disciplinary case', "Dean's office signature is present"],
  property: ['Student ID matches the submission', 'All borrowed equipment is returned', 'No damage or liability recorded', 'Custodian acknowledgment is attached'],
};
/** An office without its own list uses the Registrar's (legacy behaviour). */
export const checklistFor = (officeCode: string) => CHECKLISTS[officeCode] ?? CHECKLISTS.registrar;

export const PATTERNS = {
  applyPhone: /^\+?[0-9][0-9 -]{6,18}$/,
  profilePhone: /^\+?[0-9][0-9 ()-]{6,18}$/,
  officeCode: /^[a-z][a-z0-9-]{1,19}$/,
  programCode: /^[A-Z][A-Z0-9-]{1,9}$/,
  postalCode: /^[0-9]{4}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const;
