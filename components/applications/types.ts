// Shapes shared by the applications service, its actions and the client components. Client-safe.
// Dates cross the boundary as ISO strings; birthdays as "YYYY-MM-DD".

export type ApplicationStatusName = 'pending' | 'approved' | 'rejected';

export const APPLICATION_STATUSES = ['pending', 'approved', 'rejected'] as const satisfies readonly ApplicationStatusName[];

/** Pill label and tone for each application status. */
export const APPLICATION_STATUS: Record<ApplicationStatusName, { label: string; tone: 'pending' | 'approved' | 'overdue' }> = {
  pending: { label: 'Pending', tone: 'pending' },
  approved: { label: 'Approved', tone: 'approved' },
  rejected: { label: 'Rejected', tone: 'overdue' },
};

export type ProgramOption = { code: string; name: string };

/** One row of the Registrar's list (legacy applicationRow). */
export type ApplicationRow = {
  id: number;
  reference: string;
  status: ApplicationStatusName;
  /** "Last, First Middle Suffix" */
  name: string;
  firstName: string;
  lastName: string;
  program: string;
  programName: string;
  yearLevel: number;
  admissionType: string;
  personalEmail: string;
  contactNumber: string;
  submittedAt: string;
  reviewedAt: string | null;
  hasPhoto: boolean;
  reviewer: string | null;
};

export type ApplicationAccount = {
  studentNumber: string | null;
  studentEmail: string | null;
  /** Null once the student has set their own password. */
  tempPassword: string | null;
};

/** The full application for the detail page (legacy applicationFull). */
export type ApplicationDetail = ApplicationRow & {
  middleName: string | null;
  suffix: string | null;
  sex: string;
  civilStatus: string;
  birthday: string;
  placeOfBirth: string | null;
  religion: string | null;
  permanentAddress: string | null;
  region: string;
  province: string;
  city: string;
  barangay: string;
  street: string;
  postalCode: string | null;
  fatherFirst: string;
  fatherMiddle: string | null;
  fatherLast: string;
  fatherOccupation: string;
  motherFirst: string;
  motherMiddle: string | null;
  motherLast: string;
  motherOccupation: string;
  guardianFirst: string;
  guardianMiddle: string | null;
  guardianLast: string;
  guardianRelationship: string;
  guardianContact: string;
  rejectReason: string | null;
  /** Set when approved and the account exists. */
  account: ApplicationAccount | null;
  /** Pending only: the school email approval would create right now. */
  schoolEmailPreview: string | null;
};

export type ApplicationCounts = { pending: number; approved: number; rejected: number; today: number };

export type ApplicationList = { counts: ApplicationCounts; rows: ApplicationRow[]; limited: boolean };

/** POST /api/applications/status reply (legacy routeApplicationStatus). */
export type ApplicationStatusView = {
  reference: string;
  status: ApplicationStatusName;
  name: string;
  submittedAt: string;
  reviewedAt: string | null;
  /** Only when rejected. */
  rejectReason: string | null;
  /** The three below only when approved. */
  studentNumber?: string | null;
  studentEmail?: string | null;
  tempPassword?: string | null;
};

/** What the sign-up form keeps after a successful submit (legacy localStorage `cg_application`). */
export const SAVED_APPLICATION_KEY = 'cg_application';
export type SavedApplication = { reference: string; token: string };

/** "1st", "2nd", "3rd", "4th" */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
