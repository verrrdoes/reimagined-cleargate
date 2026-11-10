import 'server-only';
import bcrypt from 'bcryptjs';
import { db, type Db, type Tx } from '@/lib/db';
import { ApiError, fail, isUniqueViolation } from '@/lib/result';
import { LIMITS } from '@/lib/constants';
import { cut, str } from '@/lib/input';
import { applicationReference, randomHex, schoolEmail, schoolEmailBase, sha256Hex, tempPassword } from '@/lib/ids';
import { clientIp } from '@/lib/request';
import { manilaDayStart, manilaYear, manilaYmd, parseYmd } from '@/lib/time';
import { verifyTicket, type VerifiedTicket } from '@/lib/files/ticket';
import { inspectUpload, removeQuietly } from '@/lib/files/storage';
import { loadCurrentTerm, openClearance } from '@/lib/services/clearance';
import { notifyAdmins, notifyOffice } from '@/lib/services/notifications';
import { checkApplication, type ApplicationField } from '@/components/applications/rules';
import type {
  ApplicationCounts,
  ApplicationDetail,
  ApplicationList,
  ApplicationRow,
  ApplicationStatusName,
  ApplicationStatusView,
  ProgramOption,
} from '@/components/applications/types';
import type { Prisma } from '@/generated/prisma/client';

// Sign-up applications and the Registrar's review (HANDOFF §6, §8.3, §9; legacy routeApply,
// routeApplicationStatus, routeApplications, routeApplication, routeReviewApplication, routeResetTempPassword).

const BCRYPT_COST = 12;
const NOT_FOUND = 'That application was not found.';
const STATUS_NOT_FOUND =
  'We could not find an application with those details. Check the reference number, email and birthday.';

/* ---------- reading ---------- */

const applicationInclude = {
  program: { select: { code: true, name: true } },
  reviewedBy: { select: { role: true, email: true, fullName: true, staffProfile: { select: { fullName: true } } } },
} satisfies Prisma.ApplicationInclude;

type ApplicationWithJoins = Prisma.ApplicationGetPayload<{ include: typeof applicationInclude }>;

/** Staff full name → users.full_name → "System Administrator" for admins → the email (legacy reviewerName). */
export function reviewerName(fullName: string | null | undefined, role: string | null | undefined, email: string | null | undefined): string | null {
  if (fullName) return fullName;
  if (role === 'admin') return 'System Administrator';
  return email ?? null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
/** A @db.Date column value for a "YYYY-MM-DD" day. */
const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

const referenceOf = (a: { id: number; reference: string | null; submittedAt: Date }) =>
  a.reference ?? applicationReference(a.id, manilaYear(a.submittedAt));

function toRow(a: ApplicationWithJoins): ApplicationRow {
  const r = a.reviewedBy;
  return {
    id: a.id,
    reference: referenceOf(a),
    status: a.status,
    name: `${a.lastName}, ${[a.firstName, a.middleName, a.suffix].filter(Boolean).join(' ')}`,
    firstName: a.firstName,
    lastName: a.lastName,
    program: a.program.code,
    programName: a.program.name,
    yearLevel: a.yearLevel,
    admissionType: a.admissionType,
    personalEmail: a.personalEmail,
    contactNumber: a.contactNumber,
    submittedAt: a.submittedAt.toISOString(),
    reviewedAt: iso(a.reviewedAt),
    hasPhoto: Boolean(a.photoKey),
    reviewer: r ? reviewerName(r.staffProfile?.fullName ?? r.fullName, r.role, r.email) : null,
  };
}

/** The school email approval would give this name now: surname + first name, then 2, 3, … when taken. */
async function nextSchoolEmail(tx: Db, lastName: string, firstName: string): Promise<string> {
  const base = schoolEmailBase(lastName, firstName);
  const taken = new Set(
    (await tx.user.findMany({ where: { email: { startsWith: base } }, select: { email: true } })).map((u) => u.email),
  );
  let n = 1;
  while (taken.has(schoolEmail(base, n))) n += 1;
  return schoolEmail(base, n);
}

async function toDetail(a: ApplicationWithJoins, tx: Db = db): Promise<ApplicationDetail> {
  let account: ApplicationDetail['account'] = null;
  if (a.status === 'approved' && a.userId) {
    const u = await tx.user.findUnique({
      where: { id: a.userId },
      select: { email: true, student: { select: { studentNumber: true } } },
    });
    account = { studentNumber: u?.student?.studentNumber ?? null, studentEmail: u?.email ?? null, tempPassword: a.tempPassword };
  }
  return {
    ...toRow(a),
    middleName: a.middleName,
    suffix: a.suffix,
    sex: a.sex,
    civilStatus: a.civilStatus,
    birthday: ymdOf(a.birthday),
    placeOfBirth: a.placeOfBirth,
    religion: a.religion,
    permanentAddress: a.permanentAddress,
    region: a.region,
    province: a.province,
    city: a.city,
    barangay: a.barangay,
    street: a.street,
    postalCode: a.postalCode,
    fatherFirst: a.fatherFirst,
    fatherMiddle: a.fatherMiddle,
    fatherLast: a.fatherLast,
    fatherOccupation: a.fatherOccupation,
    motherFirst: a.motherFirst,
    motherMiddle: a.motherMiddle,
    motherLast: a.motherLast,
    motherOccupation: a.motherOccupation,
    guardianFirst: a.guardianFirst,
    guardianMiddle: a.guardianMiddle,
    guardianLast: a.guardianLast,
    guardianRelationship: a.guardianRelationship,
    guardianContact: a.guardianContact,
    rejectReason: a.rejectReason,
    account,
    schoolEmailPreview: a.status === 'pending' ? await nextSchoolEmail(tx, a.lastName, a.firstName) : null,
  };
}

/** Programs for the sign-up form, by name (legacy routePrograms). */
export async function programOptions(): Promise<ProgramOption[]> {
  return db.program.findMany({ orderBy: { name: 'asc' }, select: { code: true, name: true } });
}

/** The full application, or null. */
export async function getApplication(id: number): Promise<ApplicationDetail | null> {
  const a = await db.application.findUnique({ where: { id }, include: applicationInclude });
  return a ? toDetail(a) : null;
}

/** Search words each have to match a name part, the reference, the email or the program. */
function searchWhere(q: string): Prisma.ApplicationWhereInput[] {
  const words = q
    .split(/[\s,]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 6);
  return words.map((w) => ({
    OR: [
      { lastName: { contains: w, mode: 'insensitive' } },
      { firstName: { contains: w, mode: 'insensitive' } },
      { middleName: { contains: w, mode: 'insensitive' } },
      { suffix: { contains: w, mode: 'insensitive' } },
      { reference: { contains: w, mode: 'insensitive' } },
      { personalEmail: { contains: w, mode: 'insensitive' } },
      { program: { code: { contains: w, mode: 'insensitive' } } },
      { program: { name: { contains: w, mode: 'insensitive' } } },
    ],
  }));
}

/** Counts for the whole table: by status, plus applications submitted today (Manila). */
export async function applicationCounts(): Promise<ApplicationCounts> {
  const [groups, today] = await Promise.all([
    db.application.groupBy({ by: ['status'], _count: { _all: true } }),
    db.application.count({ where: { submittedAt: { gte: manilaDayStart(manilaYmd()) } } }),
  ]);
  const by = (s: ApplicationStatusName) => groups.find((g) => g.status === s)?._count._all ?? 0;
  return { pending: by('pending'), approved: by('approved'), rejected: by('rejected'), today };
}

/**
 * The Registrar's list (legacy routeApplications): pending first, then newest, at most 500 rows.
 * `status` null means every status.
 */
export async function listApplications(opts: { status: ApplicationStatusName | null; q?: string }): Promise<ApplicationList> {
  const limit = LIMITS.applicationsList;
  const search = searchWhere(str(opts.q, 100));
  const where = (status?: Prisma.ApplicationWhereInput['status']): Prisma.ApplicationWhereInput => ({
    AND: [...(status ? [{ status }] : []), ...search],
  });
  const newest = { orderBy: [{ submittedAt: 'desc' as const }, { id: 'desc' as const }], include: applicationInclude };

  let rows: ApplicationWithJoins[];
  if (opts.status) {
    rows = await db.application.findMany({ where: where(opts.status), take: limit + 1, ...newest });
  } else {
    // Legacy ORDER BY status = 'pending' DESC, submitted_at DESC: pending first, the rest by date together.
    const pending = await db.application.findMany({ where: where('pending'), take: limit + 1, ...newest });
    const rest =
      pending.length > limit
        ? []
        : await db.application.findMany({ where: where({ not: 'pending' }), take: limit + 1 - pending.length, ...newest });
    rows = [...pending, ...rest];
  }

  const counts = await applicationCounts();
  return { counts, rows: rows.slice(0, limit).map(toRow), limited: rows.length > limit };
}

/* ---------- applying (public) ---------- */

export type ApplyInput = Partial<Record<ApplicationField, unknown>> & { photoTicket?: unknown };

/**
 * A new application (legacy routeApply). Throws the legacy 429/400/409/413/415 errors. When anything fails
 * after the photo's ticket checked out, the uploaded photo is deleted, so the form uploads it again next time.
 */
export async function submitApplication(input: ApplyInput): Promise<{ reference: string; token: string }> {
  const raw = (input && typeof input === 'object' ? input : {}) as ApplyInput;

  // The photo was uploaded straight to storage before this call; its ticket names the object.
  const hasPhoto = typeof raw.photoTicket === 'string' && raw.photoTicket !== '';
  let ticket: VerifiedTicket | null = null;
  let ticketError: unknown = null;
  if (hasPhoto) {
    try {
      ticket = verifyTicket(raw.photoTicket, { kind: 'photo', userId: null });
    } catch (e) {
      ticketError = e;
    }
  }

  try {
    const ip = await clientIp();
    const since = new Date(Date.now() - LIMITS.lockoutMinutes * 60_000);
    const recent = await db.loginAttempt.count({
      where: { ipAddress: ip, login: { startsWith: 'apply:' }, attemptedAt: { gt: since } },
    });
    if (recent >= LIMITS.applicationsPerIpPerWindow) {
      fail(429, 'too_many_attempts', `Too many applications from this computer. Try again in ${LIMITS.lockoutMinutes} minutes.`);
    }

    const programs = await db.program.findMany({ select: { id: true, code: true } });
    const check = checkApplication(raw, { programCodes: programs.map((p) => p.code), today: manilaYmd() });
    if (!check.ok) fail(400, check.problem.code, check.problem.message);
    const f = check.value;
    const { programCode, birthday, ...fields } = f;
    const programId = programs.find((p) => p.code === programCode)!.id;

    if (await db.user.findFirst({ where: { OR: [{ personalEmail: f.personalEmail }, { email: f.personalEmail }] }, select: { id: true } })) {
      fail(409, 'already_registered', 'That email already has a ClearGate account. Sign in, or use Forgot password.');
    }
    if (await db.application.findFirst({ where: { personalEmail: f.personalEmail, status: 'pending' }, select: { id: true } })) {
      fail(409, 'already_pending', 'An application with that email is already waiting for the Registrar. Check its status instead.');
    }

    // Optional 2x2 photo: at most 5 MB and really a JPG, PNG or WEBP (inspectUpload deletes anything else).
    let photo: { key: string; mime: string } | null = null;
    if (hasPhoto) {
      if (!ticket) throw ticketError;
      const type = await inspectUpload(ticket);
      photo = { key: ticket.key, mime: type.mime };
    }

    // Counted by the throttle above (and by the photo presign), as the legacy app did.
    await db.loginAttempt.create({ data: { login: cut(`apply:${f.personalEmail}`, 190), ipAddress: ip, succeeded: false } });

    const token = randomHex(24);
    const reference = await db.$transaction(async (tx) => {
      const created = await tx.application.create({
        data: {
          ...fields,
          birthday: dateOnly(birthday),
          programId,
          statusToken: sha256Hex(token),
          photoKey: photo?.key ?? null,
          photoMime: photo?.mime ?? null,
        },
        select: { id: true },
      });
      const ref = applicationReference(created.id, manilaYear());
      await tx.application.update({ where: { id: created.id }, data: { reference: ref } });

      const notice = {
        tone: 'pending' as const,
        title: `New application: ${`${f.firstName} ${f.lastName}`.trim()}`,
        body: `${ref} is waiting for review.`,
        link: `/applications/${created.id}`,
      };
      const registrar = await tx.office.findUnique({ where: { code: 'registrar' }, select: { id: true } });
      if (registrar) await notifyOffice(tx, registrar.id, true, notice);
      else await notifyAdmins(tx, notice);
      return ref;
    });

    return { reference, token };
  } catch (e) {
    if (ticket) await removeQuietly(ticket.key);
    throw e;
  }
}

/* ---------- public status page ---------- */

/**
 * Looks an application up by reference + status token, or by reference + personal email + birthday
 * (legacy routeApplicationStatus). Throws 404 when nothing matches.
 */
export async function applicationStatus(input: Record<string, unknown>): Promise<ApplicationStatusView> {
  const reference = str(input.reference, 20).toUpperCase();
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  let where: Prisma.ApplicationWhereInput | null = null;
  if (reference !== '' && token !== '') {
    where = { reference, statusToken: sha256Hex(token.slice(0, 200)) };
  } else if (reference !== '') {
    const email = str(input.personalEmail ?? input.personal_email, 190).toLowerCase();
    const birthday = parseYmd(str(input.birthday, 10));
    if (email !== '' && birthday) where = { reference, personalEmail: email, birthday: dateOnly(birthday) };
  }
  const a = where
    ? await db.application.findFirst({
        where,
        select: {
          reference: true,
          id: true,
          status: true,
          firstName: true,
          lastName: true,
          submittedAt: true,
          reviewedAt: true,
          rejectReason: true,
          tempPassword: true,
          userId: true,
        },
      })
    : null;
  if (!a) fail(404, 'not_found', STATUS_NOT_FOUND);

  const out: ApplicationStatusView = {
    reference: referenceOf(a),
    status: a.status,
    name: `${a.firstName} ${a.lastName}`,
    submittedAt: a.submittedAt.toISOString(),
    reviewedAt: iso(a.reviewedAt),
    rejectReason: a.status === 'rejected' ? a.rejectReason : null,
  };
  if (a.status === 'approved' && a.userId) {
    const u = await db.user.findUnique({
      where: { id: a.userId },
      select: { email: true, student: { select: { studentNumber: true } } },
    });
    out.studentNumber = u?.student?.studentNumber ?? null;
    out.studentEmail = u?.email ?? null;
    out.tempPassword = a.tempPassword; // null once the student has set their own
  }
  return out;
}

/* ---------- review (Registrar and admins; the action checks the role) ---------- */

async function loadForReview(id: unknown) {
  const n = typeof id === 'number' || typeof id === 'string' ? Number(id) : NaN;
  const a = Number.isSafeInteger(n) && n >= 1 ? await db.application.findUnique({ where: { id: n }, include: applicationInclude }) : null;
  if (!a) fail(404, 'not_found', NOT_FOUND);
  return a;
}

const alreadyReviewed = (status: string): never => fail(409, 'already_reviewed', `This application has already been ${status}.`);

/** Moves a still-pending application on; 409 when someone else reviewed it first. */
async function claimPending(tx: Db, id: number, data: Prisma.ApplicationUncheckedUpdateManyInput) {
  const claimed = await tx.application.updateMany({ where: { id, status: 'pending' }, data });
  if (claimed.count === 0) {
    const now = await tx.application.findUnique({ where: { id }, select: { status: true } });
    if (!now) fail(404, 'not_found', NOT_FOUND);
    alreadyReviewed(now.status);
  }
}

/** Next student number for this Manila year: the highest YYYY-NNNNN plus one, padded to 5. */
async function nextStudentNumber(tx: Tx): Promise<string> {
  const year = manilaYear();
  const pattern = `^${year}-[0-9]{1,9}$`;
  const rows = await tx.$queryRaw<{ n: number | bigint | null }[]>`
    SELECT MAX(CAST(SUBSTRING(student_number FROM 6) AS INTEGER)) AS n
      FROM students
     WHERE student_number ~ ${pattern}`;
  const max = Number(rows[0]?.n ?? 0);
  return `${year}-${String(max + 1).padStart(5, '0')}`;
}

const APPROVE_ATTEMPTS = 5;

export async function reviewApplication(
  reviewer: { id: number },
  input: { id?: unknown; decision?: unknown; reason?: unknown },
): Promise<ApplicationDetail> {
  const a = await loadForReview(input?.id);
  if (a.status !== 'pending') alreadyReviewed(a.status);
  const decision = input?.decision;

  if (decision === 'reject') {
    const reason = str(input.reason, 255);
    if (Array.from(reason).length < 5) fail(400, 'reason_required', 'Tell the applicant why (at least 5 characters).');
    await claimPending(db, a.id, { status: 'rejected', rejectReason: reason, reviewedById: reviewer.id, reviewedAt: new Date() });
  } else if (decision === 'approve') {
    if (await db.user.findFirst({ where: { personalEmail: a.personalEmail }, select: { id: true } })) {
      fail(409, 'already_registered', 'An account with this personal email already exists.');
    }
    const temp = tempPassword();
    const passwordHash = await bcrypt.hash(temp, BCRYPT_COST);

    for (let attempt = 1; ; attempt++) {
      try {
        await db.$transaction(async (tx) => {
          // Claim first: a second reviewer waits on this row, then sees it is no longer pending.
          await claimPending(tx, a.id, { status: 'approved', reviewedById: reviewer.id, reviewedAt: new Date() });
          const studentNumber = await nextStudentNumber(tx);
          const email = await nextSchoolEmail(tx, a.lastName, a.firstName);
          const user = await tx.user.create({
            data: { email, passwordHash, role: 'student', personalEmail: a.personalEmail, mustChangePassword: true },
            select: { id: true },
          });
          const student = await tx.student.create({
            data: {
              userId: user.id,
              studentNumber,
              // Student names are kept in capitals; applications sent before that rule may not be.
              firstName: a.firstName.toUpperCase(),
              lastName: a.lastName.toUpperCase(),
              programId: a.programId,
              yearLevel: a.yearLevel,
              applicationId: a.id,
            },
            select: { id: true },
          });
          const term = await loadCurrentTerm(tx);
          if (term) await openClearance(tx, student.id, term.academicYearId, term.term);
          await tx.application.update({ where: { id: a.id }, data: { userId: user.id, tempPassword: temp } });
        });
        break;
      } catch (e) {
        if (e instanceof ApiError || !isUniqueViolation(e)) throw e;
        // Another approval took the same personal email, student number or school email.
        if (await db.user.findFirst({ where: { personalEmail: a.personalEmail }, select: { id: true } })) {
          const now = await db.application.findUnique({ where: { id: a.id }, select: { status: true } });
          if (now && now.status !== 'pending') alreadyReviewed(now.status);
          fail(409, 'already_registered', 'An account with this personal email already exists.');
        }
        if (attempt >= APPROVE_ATTEMPTS) throw e;
      }
    }
  } else {
    fail(400, 'invalid_request', 'decision must be approve or reject.');
  }

  const detail = await getApplication(a.id);
  if (!detail) fail(404, 'not_found', NOT_FOUND);
  return detail;
}

/** A new temporary password for an approved application's account (legacy routeResetTempPassword). */
export async function resetTempPassword(input: { id?: unknown }): Promise<ApplicationDetail> {
  const a = await loadForReview(input?.id);
  const userId = a.userId;
  if (a.status !== 'approved' || !userId) fail(409, 'not_approved', 'Only approved applications have an account.');
  const temp = tempPassword();
  const passwordHash = await bcrypt.hash(temp, BCRYPT_COST);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: true } });
    await tx.application.update({ where: { id: a.id }, data: { tempPassword: temp } });
  });
  const detail = await getApplication(a.id);
  if (!detail) fail(404, 'not_found', NOT_FOUND);
  return detail;
}

/* ---------- photo files ---------- */

export type PhotoFile = { key: string; mime: string; name: string };

const photoName = (reference: string, mime: string) =>
  `${reference}-photo.${mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'}`;

/** The 2x2 photo of one application (Registrar and admins). */
export async function applicationPhoto(id: number): Promise<PhotoFile> {
  const a = await db.application.findUnique({
    where: { id },
    select: { id: true, reference: true, submittedAt: true, photoKey: true, photoMime: true },
  });
  if (!a) fail(404, 'not_found', NOT_FOUND);
  if (!a.photoKey || !a.photoMime) fail(404, 'no_photo', 'No photo was uploaded.');
  return { key: a.photoKey, mime: a.photoMime, name: photoName(referenceOf(a), a.photoMime) };
}

/** A student's own application photo, through students.application_id. */
export async function ownApplicationPhoto(userId: number): Promise<PhotoFile> {
  const s = await db.student.findUnique({
    where: { userId },
    select: { application: { select: { id: true, reference: true, submittedAt: true, photoKey: true, photoMime: true } } },
  });
  const a = s?.application;
  if (!a) fail(404, 'not_found', 'No photo on file.');
  if (!a.photoKey || !a.photoMime) fail(404, 'no_photo', 'No photo was uploaded.');
  return { key: a.photoKey, mime: a.photoMime, name: photoName(referenceOf(a), a.photoMime) };
}
