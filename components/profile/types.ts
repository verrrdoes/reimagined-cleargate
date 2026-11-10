// Shapes for My profile. Client-safe: dates are ISO strings (calendar dates are "YYYY-MM-DD").
import type { RoleName } from '@/lib/types';

/** A student's contact details as shown: their own values, else the ones from their application. */
export type StudentContact = {
  personalEmail: string | null;
  phone: string | null;
  currentAddress: string | null;
  emergencyName: string | null;
  emergencyContact: string | null;
};

export type ApplicationDetails = {
  reference: string | null;
  admissionType: string;
  sex: string;
  civilStatus: string;
  /** "YYYY-MM-DD" */
  birthday: string;
  placeOfBirth: string | null;
  religion: string | null;
  permanentAddress: string | null;
  /** "Juan Dela Cruz (Driver)" */
  father: string;
  mother: string;
  /** "Ana Reyes (Aunt, 0917 123 4567)" */
  guardian: string;
};

/** The student's latest clearance (newest academic year and term). */
export type ProfileClearance = {
  academicYear: string;
  termLabel: string;
  /** True when it is for the current academic year and term. */
  isCurrent: boolean;
  totalOffices: number;
  approvedCount: number;
  pendingCount: number;
  needsActionCount: number;
  percentComplete: number;
  isEligible: boolean;
};

export type StudentInfo = {
  /** First, middle and last name with suffix, as on the application. */
  fullName: string;
  studentNumber: string;
  programCode: string;
  programName: string;
  yearLevel: number;
  contact: StudentContact;
  application: ApplicationDetails | null;
  clearance: ProfileClearance | null;
};

export type StaffInfo = {
  fullName: string;
  position: string | null;
  phone: string | null;
  isAdmin: boolean;
  office: { name: string; email: string; hours: string } | null;
};

export type ProfileView = {
  userId: number;
  role: RoleName;
  name: string;
  /** The sign-in (school) email. */
  email: string;
  avatarUrl: string | null;
  /** Shown when there is no profile picture: the photo from the student's application. */
  photoFallbackUrl: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  student: StudentInfo | null;
  staff: StaffInfo | null;
};

/** What "Edit your details" sends. Students use the contact fields; staff and admins the name fields. */
export type ProfileInput = {
  personalEmail?: string;
  phone?: string;
  currentAddress?: string;
  emergencyName?: string;
  emergencyContact?: string;
  fullName?: string;
  position?: string;
};
