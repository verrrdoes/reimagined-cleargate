import 'server-only';
import { db } from '@/lib/db';
import { displayName, type SessionUser } from '@/lib/auth/guards';
import { currentTerm, summarize } from '@/lib/services/clearance';
import { avatarUrl } from '@/lib/services/shell';
import { TERM_LABEL } from '@/lib/constants';
import type {
  ApplicationDetails,
  ProfileClearance,
  ProfileView,
  StaffInfo,
  StudentContact,
  StudentInfo,
} from '@/components/profile/types';

/*
 * My profile (HANDOFF §8.10, legacy profile/studentContact/applicationDetails): the account, the student's
 * details with fallbacks from their application, their latest clearance, or the staff member's office.
 */

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Joins the parts that are set: "Juan Santos Dela Cruz". */
const joinName = (...parts: (string | null | undefined)[]) =>
  parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ');

/** "Juan Dela Cruz (Driver)", or just the name when the extra part is empty. */
const withNote = (name: string, note: string | null | undefined) => (note && note.trim() ? `${name} (${note.trim()})` : name);

const applicationSelect = {
  reference: true,
  admissionType: true,
  middleName: true,
  suffix: true,
  sex: true,
  civilStatus: true,
  birthday: true,
  placeOfBirth: true,
  personalEmail: true,
  contactNumber: true,
  religion: true,
  permanentAddress: true,
  region: true,
  province: true,
  city: true,
  barangay: true,
  street: true,
  postalCode: true,
  fatherFirst: true,
  fatherMiddle: true,
  fatherLast: true,
  fatherOccupation: true,
  motherFirst: true,
  motherMiddle: true,
  motherLast: true,
  motherOccupation: true,
  guardianFirst: true,
  guardianMiddle: true,
  guardianLast: true,
  guardianRelationship: true,
  guardianContact: true,
  photoKey: true,
} as const;

/** The student's latest clearance (newest academic year by start date, then newest term) with its summary. */
async function latestClearance(studentId: number): Promise<ProfileClearance | null> {
  const clearance = await db.clearance.findFirst({
    where: { studentId },
    orderBy: [{ academicYear: { startDate: 'desc' } }, { term: 'desc' }, { id: 'desc' }],
    select: {
      academicYearId: true,
      term: true,
      academicYear: { select: { label: true } },
      items: { select: { status: true } },
    },
  });
  if (!clearance) return null;
  const now = await currentTerm();
  return {
    academicYear: clearance.academicYear.label,
    termLabel: TERM_LABEL[clearance.term],
    isCurrent: now !== null && now.academicYearId === clearance.academicYearId && now.term === clearance.term,
    ...summarize(clearance.items),
  };
}

async function studentInfo(user: SessionUser): Promise<{ info: StudentInfo; hasPhoto: boolean } | null> {
  const s = user.student;
  if (!s) return null;
  const [app, clearance] = await Promise.all([
    s.applicationId ? db.application.findUnique({ where: { id: s.applicationId }, select: applicationSelect }) : null,
    latestClearance(s.id),
  ]);

  // Legacy studentContact: the student's own values win; the application fills the gaps.
  const contact: StudentContact = {
    personalEmail: user.personalEmail ?? app?.personalEmail ?? null,
    phone: user.phone ?? app?.contactNumber ?? null,
    currentAddress:
      s.currentAddress ??
      (app ? [app.street, app.barangay, app.city, app.province, app.region, app.postalCode].filter((p) => p && p.trim()).join(', ') || null : null),
    emergencyName: s.emergencyName ?? (app ? joinName(app.guardianFirst, app.guardianMiddle, app.guardianLast) || null : null),
    emergencyContact: s.emergencyContact ?? app?.guardianContact ?? null,
  };

  const application: ApplicationDetails | null = app
    ? {
        reference: app.reference,
        admissionType: app.admissionType,
        sex: app.sex,
        civilStatus: app.civilStatus,
        birthday: app.birthday.toISOString().slice(0, 10),
        placeOfBirth: app.placeOfBirth,
        religion: app.religion,
        permanentAddress: app.permanentAddress,
        father: withNote(joinName(app.fatherFirst, app.fatherMiddle, app.fatherLast), app.fatherOccupation),
        mother: withNote(joinName(app.motherFirst, app.motherMiddle, app.motherLast), app.motherOccupation),
        guardian: withNote(
          joinName(app.guardianFirst, app.guardianMiddle, app.guardianLast),
          [app.guardianRelationship, app.guardianContact].filter((p) => p && p.trim()).join(', '),
        ),
      }
    : null;

  return {
    info: {
      fullName: joinName(s.firstName, app?.middleName, s.lastName, app?.suffix),
      studentNumber: s.studentNumber,
      programCode: s.program.code,
      programName: s.program.name,
      yearLevel: s.yearLevel,
      contact,
      application,
      clearance,
    },
    hasPhoto: Boolean(app?.photoKey),
  };
}

function staffInfo(user: SessionUser): StaffInfo {
  const p = user.staffProfile;
  return {
    fullName: p?.fullName || user.fullName || displayName(user),
    position: p?.position ?? null,
    phone: user.phone,
    isAdmin: user.role === 'admin',
    office: p ? { name: p.office.name, email: p.office.contactEmail, hours: p.office.officeHours } : null,
  };
}

/** Everything My profile shows for the signed-in account. */
export async function getProfileView(user: SessionUser): Promise<ProfileView> {
  const view: ProfileView = {
    userId: user.id,
    role: user.role,
    name: displayName(user),
    email: user.email,
    avatarUrl: avatarUrl(user),
    photoFallbackUrl: null,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: iso(user.lastLoginAt),
    student: null,
    staff: null,
  };
  if (user.role === 'student') {
    const s = await studentInfo(user);
    if (s) {
      view.student = s.info;
      if (s.hasPhoto) view.photoFallbackUrl = '/api/files/application-photo/me';
    }
    return view;
  }
  view.staff = staffInfo(user);
  return view;
}
