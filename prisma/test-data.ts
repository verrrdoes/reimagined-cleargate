// Extra test data on top of the demo seed: run `npx prisma db seed` first, then `npm run db:test-data`.
// Adds students in every clearance state, evidence waiting in every office's queue (two of them
// resubmissions), review history, message threads, applications in each status, more deadlines, a
// scheduled reminder and a turned-off staff account, so every screen has something to show.
// It only adds rows; to start over, run the seed again (it empties every table) and then this.
import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient, type ItemStatus, type Term } from '../generated/prisma/client';
import { createStorage, storageConfigFromProcessEnv } from '../lib/files/storage-core';
import { CHECKLISTS } from '../lib/constants';
import { addDays, manilaYear, manilaYmd, prettyDue } from '../lib/time';
import { evidencePdf } from './demo-evidence';

neonConfig.webSocketConstructor = ws;

const PASSWORD = 'ClearGate2026!';
const STUDENT_PASSWORD = 'StudentCleargate2026!';
/** The approved applicant's temporary password: the shared student password, but she must still change it. */
const TEMP_PASSWORD = STUDENT_PASSWORD;
const DOMAIN = 'cgateway.edu.ph';
const TERM_LABEL: Record<Term, string> = { first_semester: '1st Semester', second_semester: '2nd Semester', summer: 'Summer' };

const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000);
const at = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+08:00`);
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const subRef = (code: string, id: number, when: Date) => `${code.slice(0, 3).toUpperCase()}-${manilaYear(when)}-${pad(id, 4)}`;

const CODES = ['library', 'accounting', 'registrar', 'guidance', 'dean', 'property'] as const;
type Code = (typeof CODES)[number];

/** What each office asks for when it flags a student. */
const REQUIREMENT: Record<Code, { task: string; remarks: string; description: string; nextStep: string; file: string; note: string }> = {
  library: {
    task: 'Return 2 overdue books',
    remarks: '2 overdue books',
    description: 'Library is waiting for 2 overdue books to be returned before your account can be cleared.',
    nextStep: 'Return the books to the Library, or upload your signed return slip.',
    file: 'signed-return-slip.pdf',
    note: 'Returned both books at the circulation desk.',
  },
  accounting: {
    task: 'Settle balance PHP 5,250',
    remarks: 'Balance PHP 5,250',
    description: 'Accounting shows an unpaid balance of PHP 5,250 on your account.',
    nextStep: 'Pay at the cashier, then upload your official receipt.',
    file: 'official-receipt.pdf',
    note: 'Paid the full balance at the cashier.',
  },
  registrar: {
    task: 'Submit Form 137',
    remarks: 'Form 137 missing',
    description: 'Registrar needs your Form 137 to complete your records.',
    nextStep: 'Upload a scan of your Form 137, or bring the original to the Registrar.',
    file: 'form-137.pdf',
    note: 'Scanned copy of my Form 137.',
  },
  guidance: {
    task: 'Complete the exit interview form',
    remarks: 'Exit interview pending',
    description: 'Guidance Office needs your completed exit interview form.',
    nextStep: 'Fill in the exit interview form and upload the signed copy.',
    file: 'exit-interview-form.pdf',
    note: 'Signed by the counselor after my interview.',
  },
  dean: {
    task: 'Submit signed grade sheet',
    remarks: 'Grade sheet unsigned',
    description: "Dean's Office needs your grade sheet signed by your adviser.",
    nextStep: 'Have your adviser sign the grade sheet, then upload it.',
    file: 'signed-grade-sheet.pdf',
    note: 'Signed by my adviser this morning.',
  },
  property: {
    task: 'Return borrowed lab equipment',
    remarks: '1 multimeter not returned',
    description: 'Property Custodian records 1 borrowed multimeter on your account.',
    nextStep: 'Return the multimeter to the Property Custodian, or upload the signed return form.',
    file: 'equipment-return-form.pdf',
    note: 'Returned the multimeter to the stock room.',
  },
};

/** Remarks for offices that cleared a student without asking for anything. */
const CLEARED: Record<Code, string> = {
  library: 'No borrowed books',
  accounting: 'No outstanding balance',
  registrar: 'Records verified',
  guidance: 'No issues, cleared',
  dean: 'Academic standing okay',
  property: 'No liabilities',
};

const RETURNS: Record<Code, { category: string; reason: string }> = {
  library: { category: 'Incomplete or unverified evidence', reason: 'The slip only lists one of the two books. Upload a slip that shows both books returned.' },
  accounting: { category: 'File is unreadable or cut off', reason: 'The OR number is cut off at the bottom of the photo. Upload a scan that shows the whole receipt.' },
  registrar: { category: 'Wrong document uploaded', reason: 'This is your Form 138, not Form 137. Upload your Form 137.' },
  guidance: { category: 'Incomplete or unverified evidence', reason: 'The counselor signature is missing. Have the form signed, then upload it again.' },
  dean: { category: "Details don't match office records", reason: 'The grade sheet is for last semester. Upload the one for this semester.' },
  property: { category: 'Incomplete or unverified evidence', reason: 'The return form has no custodian acknowledgment. Have it signed at the stock room.' },
};

/**
 * One letter per office in the order library, accounting, registrar, guidance, dean, property:
 * A cleared · N needs action · W evidence waiting for review · R resubmitted after a return · P not reviewed yet
 */
type Plan = string;
const STUDENTS: { first: string; last: string; number: string; program: string; year: number; plan: Plan }[] = [
  { first: 'Carlo', last: 'Reyes', number: '2023-00101', program: 'BSIT', year: 4, plan: 'AAAAAA' },
  { first: 'Andrea', last: 'Santos', number: '2023-00102', program: 'BSN', year: 4, plan: 'AAAAAA' },
  { first: 'Lorraine', last: 'Ocampo', number: '2023-00103', program: 'BSN', year: 4, plan: 'AAAAAA' },
  { first: 'Rafael', last: 'Villanueva', number: '2023-00104', program: 'BSCS', year: 4, plan: 'AAWAAA' },
  { first: 'Erica', last: 'Pascual', number: '2023-00105', program: 'BSBA', year: 4, plan: 'AAAAAN' },
  { first: 'Daniel', last: 'Soriano', number: '2023-00106', program: 'BSIT', year: 4, plan: 'AAWAWA' },
  { first: 'Vincent', last: 'Aguilar', number: '2023-00107', program: 'BSCS', year: 4, plan: 'ANAAAA' },
  { first: 'Patricia', last: 'Gonzales', number: '2024-00201', program: 'BSBA', year: 3, plan: 'WAAAAA' },
  { first: 'Gabriel', last: 'Torres', number: '2024-00202', program: 'BSIT', year: 3, plan: 'ARAAAA' },
  { first: 'Samantha', last: 'Flores', number: '2024-00203', program: 'BSN', year: 3, plan: 'AAAAWA' },
  { first: 'Mark', last: 'Lim', number: '2024-00204', program: 'BSCS', year: 3, plan: 'AAAWAA' },
  { first: 'Trisha', last: 'Domingo', number: '2024-00205', program: 'BSBA', year: 3, plan: 'WNAAAA' },
  { first: 'Miguel', last: 'Dela Cruz', number: '2025-00301', program: 'BSCS', year: 2, plan: 'AWAAAA' },
  { first: 'Kimberly', last: 'Aquino', number: '2025-00302', program: 'BSN', year: 2, plan: 'NNAAPA' },
  { first: 'Bea', last: 'Castillo', number: '2025-00303', program: 'BSBA', year: 2, plan: 'AAANAA' },
  { first: 'Christian', last: 'Navarro', number: '2025-00304', program: 'BSIT', year: 2, plan: 'RAAAAA' },
  { first: 'Angelica', last: 'Cruz', number: '2025-00305', program: 'BSN', year: 2, plan: 'NAAAAA' },
  { first: 'Kevin', last: 'Manalo', number: '2025-00306', program: 'BSCS', year: 2, plan: 'AWAAAW' },
  { first: 'Joshua', last: 'Ramos', number: '2026-00401', program: 'BSIT', year: 1, plan: 'PPPPPP' },
  { first: 'Nicole', last: 'Bautista', number: '2026-00402', program: 'BSBA', year: 1, plan: 'PPPPPP' },
  { first: 'Paolo', last: 'Mendoza', number: '2026-00403', program: 'BSCS', year: 1, plan: 'NPPPPN' },
  { first: 'Jasmine', last: 'Garcia', number: '2026-00404', program: 'BSN', year: 1, plan: 'PWPPPP' },
  { first: 'Adrian', last: 'Salazar', number: '2026-00405', program: 'BSIT', year: 1, plan: 'PPAPPP' },
  { first: 'Hannah', last: 'Rivera', number: '2026-00406', program: 'BSBA', year: 1, plan: 'PPPPPP' },
];

/** The approved application's account (must change the temporary password on first sign-in). */
const NEW_STUDENT = { first: 'Bianca', last: 'Mendoza', number: '2026-00001', program: 'BSIT', year: 1, plan: 'PPPPPP' };

const EXTRA_STAFF = [
  { email: `santiagoronaldaccounting@${DOMAIN}`, office: 'accounting' as Code, fullName: 'Ronald Santiago', position: 'Accounting Clerk', active: true },
  { email: `delarosamarielibrary@${DOMAIN}`, office: 'library' as Code, fullName: 'Marie Dela Rosa', position: 'Library Assistant', active: false },
];

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const schoolEmail = (s: { first: string; last: string }) => `${slug(s.last)}${slug(s.first)}@${DOMAIN}`;

type AppStatus = 'pending' | 'approved' | 'rejected';
const APPLICATIONS: {
  status: AppStatus;
  hoursAgo: number;
  admissionType: string;
  program: string;
  yearLevel: number;
  firstName: string;
  middleName: string | null;
  lastName: string;
  sex: 'Male' | 'Female';
  birthday: string;
  placeOfBirth: string;
  personalEmail: string;
  contactNumber: string;
  religion: string | null;
  region: string;
  province: string;
  city: string;
  barangay: string;
  street: string;
  postalCode: string;
  father: [string, string, string];
  mother: [string, string, string];
  guardian: 'father' | 'mother';
  guardianContact: string;
  rejectReason?: string;
}[] = [
  {
    status: 'pending', hoursAgo: 3, admissionType: 'New student', program: 'BSCS', yearLevel: 1,
    firstName: 'Lance', middleName: 'Ignacio', lastName: 'Bernardo', sex: 'Male', birthday: '2007-03-14', placeOfBirth: 'Quezon City',
    personalEmail: 'lance.bernardo@example.com', contactNumber: '0917 555 0142', religion: 'Roman Catholic',
    region: 'National Capital Region (NCR)', province: 'Quezon City', city: 'Quezon City', barangay: 'Alicia', street: '12 Mabini Street', postalCode: '1105',
    father: ['Ramon', 'Bernardo', 'Jeepney operator'], mother: ['Lourdes', 'Bernardo', 'Public school teacher'], guardian: 'mother', guardianContact: '0918 555 0199',
  },
  {
    status: 'pending', hoursAgo: 20, admissionType: 'Transferee', program: 'BSN', yearLevel: 2,
    firstName: 'Ysabel', middleName: 'Ramos', lastName: 'Cortez', sex: 'Female', birthday: '2005-11-02', placeOfBirth: 'Calamba, Laguna',
    personalEmail: 'ysabel.cortez@example.com', contactNumber: '0926 555 0187', religion: 'Roman Catholic',
    region: 'Region IV-A (CALABARZON)', province: 'Laguna', city: 'City of Calamba', barangay: 'Banlic', street: '45 Rizal Avenue', postalCode: '4027',
    father: ['Arnel', 'Cortez', 'Electrician'], mother: ['Grace', 'Cortez', 'Nurse'], guardian: 'mother', guardianContact: '0927 555 0110',
  },
  {
    status: 'pending', hoursAgo: 44, admissionType: 'Returnee', program: 'BSBA', yearLevel: 3,
    firstName: 'Jericho', middleName: null, lastName: 'Panganiban', sex: 'Male', birthday: '2003-06-21', placeOfBirth: 'Pasig City',
    personalEmail: 'jericho.panganiban@example.com', contactNumber: '0905 555 0163', religion: null,
    region: 'National Capital Region (NCR)', province: 'City of Pasig', city: 'City of Pasig', barangay: 'Caniogan', street: '8 Dr. Sixto Antonio Avenue', postalCode: '1606',
    father: ['Rodel', 'Panganiban', 'Driver'], mother: ['Marites', 'Panganiban', 'Sari-sari store owner'], guardian: 'father', guardianContact: '0906 555 0121',
  },
  {
    status: 'pending', hoursAgo: 70, admissionType: 'Cross-enrollee', program: 'BSIT', yearLevel: 2,
    firstName: 'Alyssa', middleName: 'Chua', lastName: 'Tan', sex: 'Female', birthday: '2006-01-30', placeOfBirth: 'Manila',
    personalEmail: 'alyssa.tan@example.com', contactNumber: '0998 555 0175', religion: 'Christian',
    region: 'National Capital Region (NCR)', province: 'City of Mandaluyong', city: 'City of Mandaluyong', barangay: 'Addition Hills', street: '210 Boni Avenue', postalCode: '1550',
    father: ['Henry', 'Tan', 'Businessman'], mother: ['Melissa', 'Tan', 'Accountant'], guardian: 'mother', guardianContact: '0999 555 0133',
  },
  {
    status: 'rejected', hoursAgo: 120, admissionType: 'New student', program: 'BSCS', yearLevel: 1,
    firstName: 'Ramon', middleName: 'Santos', lastName: 'Dizon', sex: 'Male', birthday: '2007-08-09', placeOfBirth: 'Makati City',
    personalEmail: 'ramon.dizon@example.com', contactNumber: '0915 555 0158', religion: 'Roman Catholic',
    region: 'National Capital Region (NCR)', province: 'City of Makati', city: 'City of Makati', barangay: 'Bangkal', street: '33 Evangelista Street', postalCode: '1233',
    father: ['Eduardo', 'Dizon', 'Security guard'], mother: ['Rosario', 'Dizon', 'Seamstress'], guardian: 'mother', guardianContact: '0916 555 0144',
    rejectReason: 'The birth date does not match the PSA birth certificate you presented. Apply again with the correct date.',
  },
  {
    status: 'approved', hoursAgo: 96, admissionType: 'New student', program: 'BSIT', yearLevel: 1,
    firstName: NEW_STUDENT.first, middleName: 'Reyes', lastName: NEW_STUDENT.last, sex: 'Female', birthday: '2007-05-17', placeOfBirth: 'Quezon City',
    personalEmail: 'bianca.mendoza@example.com', contactNumber: '0917 555 0126', religion: 'Roman Catholic',
    region: 'National Capital Region (NCR)', province: 'Quezon City', city: 'Quezon City', barangay: 'Amihan', street: '5 Kalayaan Avenue', postalCode: '1102',
    father: ['Jose', 'Mendoza', 'Mechanic'], mother: ['Liza', 'Mendoza', 'Office clerk'], guardian: 'mother', guardianContact: '0918 555 0177',
  },
];

const MARKER_EMAIL = schoolEmail(STUDENTS[0]);

function connectionString(): string {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('Set DIRECT_URL (or DATABASE_URL) in .env first. See .env.example.');
  return url;
}

type SubPlan = {
  key: string;
  student: string; // student number
  code: Code;
  status: 'submitted' | 'approved' | 'returned';
  originalName: string;
  note: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  returnCategory: string | null;
  reviewNote: string | null;
  checklist: string[] | null;
  size: number;
  bytes: Uint8Array;
};

async function main() {
  const url = connectionString();
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
  const store = createStorage(storageConfigFromProcessEnv(() => {
    throw new Error('Test data never creates upload URLs.');
  }));
  const uploaded: string[] = [];

  try {
    if (await prisma.user.findUnique({ where: { email: MARKER_EMAIL } })) {
      console.log('Test data is already loaded. To start over: npx prisma db seed, then npm run db:test-data.');
      return;
    }
    const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
    const offices = await prisma.office.findMany({ include: { staff: { where: { user: { isActive: true } }, orderBy: { userId: 'asc' } } } });
    const programs = new Map((await prisma.program.findMany()).map((p) => [p.code, p.id]));
    const officeBy = new Map(offices.map((o) => [o.code, o]));
    const registrarStaff = officeBy.get('registrar')?.staff[0];
    if (!year || CODES.some((c) => !officeBy.get(c)?.staff.length) || !registrarStaff || !programs.size) {
      throw new Error('The demo data is missing. Run `npx prisma db seed` first.');
    }
    const newest = await prisma.clearance.findFirst({ where: { academicYearId: year.id }, orderBy: { term: 'desc' }, select: { term: true } });
    const term: Term = newest?.term ?? 'first_semester';
    const termText = `${TERM_LABEL[term]}, A.Y ${year.label}`;
    const office = (c: Code) => officeBy.get(c)!;
    const reviewer = (c: Code) => office(c).staff[0].userId;

    /* ---------- plan every item and file in memory ---------- */
    const everyone = [...STUDENTS, NEW_STUDENT];
    const subs: SubPlan[] = [];
    const newKey = () => `evidence/${randomBytes(16).toString('hex')}.pdf`;
    /** Each upload is that student's own document, dated when it was sent; `flawed` is the copy the office returned. */
    const fileFor = (s: { first: string; last: string; number: string }, c: Code, submittedAt: Date, flawed: boolean) => {
      const bytes = evidencePdf({ office: c, studentName: `${s.first} ${s.last}`.toUpperCase(), studentNumber: s.number, termText, issuedAt: submittedAt, flawed });
      return { bytes, size: bytes.byteLength };
    };

    type ItemPlan = {
      student: string;
      code: Code;
      state: string;
      viaEvidence: boolean;
      approvedAt: Date | null;
      flaggedAt: Date;
      waitingAt: Date | null;
      firstAt: Date | null;
      returnedAt: Date | null;
    };
    const items: ItemPlan[] = [];
    everyone.forEach((s, i) => {
      CODES.forEach((c, j) => {
        const state = s.plan[j];
        const approvedAt = state === 'A' ? hoursAgo(24 * (3 + ((i * 7 + j * 5) % 17)) + (i % 5)) : null;
        const flaggedAt = hoursAgo(24 * (8 + ((i + j) % 6)) + j);
        const waitingAt = state === 'W' || state === 'R' ? hoursAgo(2 + ((i * 11 + j * 3) % 70)) : null;
        const viaEvidence = state === 'A' && ['library', 'accounting', 'registrar'].includes(c) && (i + j) % 2 === 0;
        const firstAt = state === 'R' ? new Date(flaggedAt.getTime() + 24 * 3_600_000) : null;
        const returnedAt = firstAt ? new Date(firstAt.getTime() + 20 * 3_600_000) : null;
        items.push({ student: s.number, code: c, state, viaEvidence, approvedAt, flaggedAt, waitingAt, firstAt, returnedAt });

        const req = REQUIREMENT[c];
        const base = { student: s.number, code: c, originalName: req.file };
        if (viaEvidence && approvedAt) {
          const submittedAt = new Date(approvedAt.getTime() - (4 + ((i + j) % 30)) * 3_600_000);
          subs.push({ ...base, ...fileFor(s, c, submittedAt, false), key: newKey(), status: 'approved', note: req.note, submittedAt, reviewedAt: approvedAt, returnCategory: null, reviewNote: null, checklist: [...CHECKLISTS[c]] });
        }
        if (firstAt && returnedAt) {
          subs.push({ ...base, ...fileFor(s, c, firstAt, true), key: newKey(), status: 'returned', note: req.note, submittedAt: firstAt, reviewedAt: returnedAt, returnCategory: RETURNS[c].category, reviewNote: RETURNS[c].reason, checklist: null });
        }
        if (waitingAt) {
          subs.push({ ...base, ...fileFor(s, c, waitingAt, false), key: newKey(), status: 'submitted', note: state === 'R' ? 'Corrected file, as requested.' : req.note, submittedAt: waitingAt, reviewedAt: null, returnCategory: null, reviewNote: null, checklist: null });
        }
      });
    });

    /* ---------- files first: if storage fails, the database is untouched ---------- */
    for (let n = 0; n < subs.length; n += 8) {
      await Promise.all(subs.slice(n, n + 8).map(async (s) => {
        await store.put(s.key, s.bytes, 'application/pdf');
        uploaded.push(s.key);
      }));
    }

    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    const studentHash = await bcrypt.hash(STUDENT_PASSWORD, 12);
    const tempHash = await bcrypt.hash(TEMP_PASSWORD, 12);
    const today = manilaYmd();

    const result = await prisma.$transaction(async (tx) => {
      /* accounts */
      const users = await tx.user.createManyAndReturn({
        data: [
          ...STUDENTS.map((s) => ({ email: schoolEmail(s), passwordHash: studentHash, role: 'student' as const })),
          {
            email: schoolEmail(NEW_STUDENT), passwordHash: tempHash, role: 'student' as const,
            mustChangePassword: true, personalEmail: 'bianca.mendoza@example.com', phone: '0917 555 0126',
          },
          ...EXTRA_STAFF.map((s) => ({ email: s.email, passwordHash, role: 'staff' as const, isActive: s.active })),
        ],
        select: { id: true, email: true },
      });
      const userId = new Map(users.map((u) => [u.email, u.id]));
      await tx.officeStaff.createMany({
        data: EXTRA_STAFF.map((s) => ({ userId: userId.get(s.email)!, officeId: office(s.office).id, fullName: s.fullName, position: s.position })),
      });
      const students = await tx.student.createManyAndReturn({
        data: everyone.map((s) => ({
          userId: userId.get(schoolEmail(s))!, studentNumber: s.number, firstName: s.first.toUpperCase(), lastName: s.last.toUpperCase(),
          programId: programs.get(s.program)!, yearLevel: s.year,
        })),
        select: { id: true, userId: true, studentNumber: true, firstName: true, lastName: true },
      });
      const studentBy = new Map(students.map((s) => [s.studentNumber, s]));

      /* clearances and items */
      const clearances = await tx.clearance.createManyAndReturn({
        data: students.map((s) => ({ studentId: s.id, academicYearId: year.id, term, createdAt: hoursAgo(24 * 21) })),
        select: { id: true, studentId: true },
      });
      const clearanceOf = new Map(clearances.map((c) => [c.studentId, c.id]));
      const ownDue: Record<string, Date> = {
        '2023-00105:property': at(addDays(today, -1), '17:00'), // overdue on her own deadline
        '2026-00403:library': at(addDays(today, 3), '17:00'),
      };

      const itemRows = items.map((p) => {
        const st = studentBy.get(p.student)!;
        const o = office(p.code);
        const req = REQUIREMENT[p.code];
        const status: ItemStatus = p.state === 'A' ? 'approved' : p.state === 'N' ? 'needs_action' : 'pending';
        const common = { clearanceId: clearanceOf.get(st.id)!, officeId: o.id, status, dueAt: ownDue[`${p.student}:${p.code}`] ?? null };
        if (p.state === 'A') {
          return p.viaEvidence
            ? { ...common, task: req.task, remarks: 'Evidence verified', description: `${o.name} has cleared your account.`, nextStep: null, approvedAt: p.approvedAt, updatedById: reviewer(p.code), updatedAt: p.approvedAt! }
            : { ...common, task: CLEARED[p.code], remarks: CLEARED[p.code], description: `${o.name} has already cleared your account.`, nextStep: null, approvedAt: p.approvedAt, updatedById: reviewer(p.code), updatedAt: p.approvedAt! };
        }
        if (p.state === 'N') {
          return { ...common, task: req.task, remarks: req.remarks, description: req.description, nextStep: req.nextStep, approvedAt: null, updatedById: reviewer(p.code), updatedAt: p.flaggedAt };
        }
        if (p.state === 'W' || p.state === 'R') {
          return { ...common, task: req.task, remarks: 'Evidence submitted', description: req.description, nextStep: `Wait for ${o.name} to review your submission.`, approvedAt: null, updatedById: st.userId, updatedAt: p.waitingAt! };
        }
        return {
          ...common, task: 'Awaiting office review', remarks: 'Awaiting review', description: `${o.name} has not reviewed your account yet.`,
          nextStep: `Wait for ${o.name} to review your account, or visit the office.`, approvedAt: null, updatedById: null, updatedAt: hoursAgo(24 * 21),
        };
      });
      const createdItems = await tx.clearanceItem.createManyAndReturn({ data: itemRows, select: { id: true, clearanceId: true, officeId: true, task: true } });
      const itemKey = (clearanceId: number, officeId: number) => `${clearanceId}:${officeId}`;
      const itemByKey = new Map(createdItems.map((it) => [itemKey(it.clearanceId, it.officeId), it]));
      const itemOf = (student: string, c: Code) => itemByKey.get(itemKey(clearanceOf.get(studentBy.get(student)!.id)!, office(c).id))!;

      /* submissions */
      const createdSubs = await tx.submission.createManyAndReturn({
        data: subs.map((s) => ({
          itemId: itemOf(s.student, s.code).id, storageKey: s.key, originalName: s.originalName, mimeType: 'application/pdf', fileSize: s.size,
          studentNote: s.note, status: s.status, submittedById: studentBy.get(s.student)!.userId, submittedAt: s.submittedAt,
          reviewedById: s.reviewedAt ? reviewer(s.code) : null, reviewedAt: s.reviewedAt, returnCategory: s.returnCategory, reviewNote: s.reviewNote,
          checklist: s.checklist ?? undefined,
        })),
        select: { id: true, storageKey: true },
      });
      const subId = new Map(createdSubs.map((s) => [s.storageKey, s.id]));
      const refOf = (s: SubPlan) => subRef(s.code, subId.get(s.key)!, s.submittedAt);
      await tx.$executeRaw`
        UPDATE submissions s
           SET reference = upper(left(o.code, 3)) || '-' || to_char(s.submitted_at AT TIME ZONE 'Asia/Manila', 'YYYY') || '-' || lpad(s.submission_id::text, 4, '0')
          FROM clearance_items i JOIN offices o ON o.office_id = i.office_id
         WHERE i.item_id = s.item_id AND s.reference IS NULL`;

      /* status history (audit log) */
      const logs: { itemId: number; oldStatus: ItemStatus | null; newStatus: ItemStatus; note: string; changedById: number; changedAt: Date }[] = [];
      for (const p of items) {
        const it = itemOf(p.student, p.code);
        const staff = reviewer(p.code);
        const stu = studentBy.get(p.student)!.userId;
        const mine = subs.filter((s) => s.student === p.student && s.code === p.code);
        const flag = { itemId: it.id, oldStatus: 'pending' as const, newStatus: 'needs_action' as const, note: 'Requirement flagged by the office', changedById: staff, changedAt: p.flaggedAt };
        if (p.state === 'A' && !p.viaEvidence) logs.push({ itemId: it.id, oldStatus: 'pending', newStatus: 'approved', note: 'Cleared during clearance week', changedById: staff, changedAt: p.approvedAt! });
        if (p.state === 'A' && p.viaEvidence) {
          const s = mine[0];
          logs.push({ ...flag, changedAt: new Date(s.submittedAt.getTime() - 48 * 3_600_000) });
          logs.push({ itemId: it.id, oldStatus: 'needs_action', newStatus: 'pending', note: 'Student uploaded evidence', changedById: stu, changedAt: s.submittedAt });
          logs.push({ itemId: it.id, oldStatus: 'pending', newStatus: 'approved', note: `Approved submission ${refOf(s)}`, changedById: staff, changedAt: p.approvedAt! });
        }
        if (p.state === 'N') logs.push(flag);
        if (p.state === 'W') {
          logs.push(flag);
          logs.push({ itemId: it.id, oldStatus: 'needs_action', newStatus: 'pending', note: 'Student uploaded evidence', changedById: stu, changedAt: p.waitingAt! });
        }
        if (p.state === 'R') {
          const returned = mine.find((s) => s.status === 'returned')!;
          logs.push(flag);
          logs.push({ itemId: it.id, oldStatus: 'needs_action', newStatus: 'pending', note: 'Student uploaded evidence', changedById: stu, changedAt: p.firstAt! });
          logs.push({ itemId: it.id, oldStatus: 'pending', newStatus: 'needs_action', note: `Returned submission ${refOf(returned)}: ${returned.returnCategory}`, changedById: staff, changedAt: p.returnedAt! });
          logs.push({ itemId: it.id, oldStatus: 'needs_action', newStatus: 'pending', note: 'Student uploaded evidence', changedById: stu, changedAt: p.waitingAt! });
        }
      }
      await tx.clearanceItemLog.createMany({ data: logs });

      /* bells */
      type Note = { userId: number; itemId: number | null; tone: 'needs_action' | 'pending' | 'approved' | 'info'; title: string; body: string; link: string | null; isRead: boolean; createdAt: Date };
      const notes: Note[] = [];
      const staffOf = (c: Code) => office(c).staff.map((m) => m.userId).concat(
        EXTRA_STAFF.filter((e) => e.office === c && e.active).map((e) => userId.get(e.email)!),
      );
      for (const s of everyone) {
        const st = studentBy.get(s.number)!;
        const mineItems = items.filter((p) => p.student === s.number);
        for (const p of mineItems.filter((x) => x.state === 'N')) {
          notes.push({ userId: st.userId, itemId: itemOf(s.number, p.code).id, tone: 'needs_action', title: `${office(p.code).name} needs action`, body: REQUIREMENT[p.code].description, link: null, isRead: false, createdAt: p.flaggedAt });
        }
        for (const p of mineItems.filter((x) => x.state === 'R')) {
          notes.push({ userId: st.userId, itemId: itemOf(s.number, p.code).id, tone: 'needs_action', title: `${office(p.code).name} needs action`, body: RETURNS[p.code].reason, link: null, isRead: true, createdAt: p.returnedAt! });
        }
        const lastApproval = mineItems.filter((x) => x.state === 'A').sort((a, b) => b.approvedAt!.getTime() - a.approvedAt!.getTime())[0];
        if (lastApproval) {
          const o = office(lastApproval.code);
          notes.push({ userId: st.userId, itemId: itemOf(s.number, lastApproval.code).id, tone: 'approved', title: `${o.name} cleared you`, body: lastApproval.viaEvidence ? `${o.name} has cleared your account.` : `${o.name} has already cleared your account.`, link: null, isRead: true, createdAt: lastApproval.approvedAt! });
        }
      }
      for (const s of subs.filter((x) => x.status === 'submitted')) {
        const st = studentBy.get(s.student)!;
        const it = itemOf(s.student, s.code);
        const resubmitted = subs.some((x) => x.student === s.student && x.code === s.code && x.status === 'returned');
        for (const uid of staffOf(s.code)) {
          notes.push({
            userId: uid, itemId: it.id, tone: 'pending', title: `${st.firstName} ${st.lastName} ${resubmitted ? 'resubmitted evidence' : 'uploaded evidence'}`,
            body: `${refOf(s)} · ${s.originalName} for "${it.task}"`, link: `/review/${subId.get(s.key)}`, isRead: false, createdAt: s.submittedAt,
          });
        }
      }

      /* message threads */
      const excerpt = (b: string) => (Array.from(b).length > 120 ? Array.from(b).slice(0, 117).join('') + '...' : b);
      const threads: { student: string; code: Code; lines: { from: 'student' | 'office'; body: string; hoursAgo: number; read: boolean }[] }[] = [
        {
          student: '2025-00301', code: 'accounting', lines: [
            { from: 'student', body: 'Good morning. I uploaded my official receipt for the PHP 5,250 balance. Is there anything else you need from me?', hoursAgo: 46, read: true },
            { from: 'office', body: "Thanks, Miguel. We'll match it against the cashier records today.", hoursAgo: 26, read: true },
            { from: 'student', body: "Thank you po. Will I get a notification once it's approved?", hoursAgo: 3, read: false },
          ],
        },
        {
          student: '2026-00403', code: 'library', lines: [
            { from: 'student', body: 'Hi, I lost one of the books I borrowed. How much is the replacement fee, and can I pay it at Accounting?', hoursAgo: 5, read: false },
          ],
        },
        {
          student: '2023-00104', code: 'registrar', lines: [
            { from: 'student', body: 'Hello, I uploaded my Form 137 just now.', hoursAgo: 30, read: true },
            { from: 'office', body: "Hi Rafael, the bottom of your Form 137 scan is cut off. Can you bring the original to the Registrar's window this week?", hoursAgo: 2, read: false },
          ],
        },
      ];
      const messages: { itemId: number; senderId: number; senderRole: 'student' | 'staff'; body: string; createdAt: Date; readAt: Date | null }[] = [];
      for (const t of threads) {
        const st = studentBy.get(t.student)!;
        const it = itemOf(t.student, t.code);
        for (const l of t.lines) {
          const createdAt = hoursAgo(l.hoursAgo);
          messages.push({
            itemId: it.id, senderId: l.from === 'student' ? st.userId : reviewer(t.code), senderRole: l.from === 'student' ? 'student' : 'staff',
            body: l.body, createdAt, readAt: l.read ? new Date(createdAt.getTime() + 3_600_000) : null,
          });
        }
        const last = t.lines[t.lines.length - 1];
        if (!last.read && last.from === 'student') {
          for (const uid of staffOf(t.code)) {
            notes.push({ userId: uid, itemId: it.id, tone: 'info', title: `${st.firstName} ${st.lastName} sent a message`, body: excerpt(last.body), link: `/messages?item=${it.id}`, isRead: false, createdAt: hoursAgo(last.hoursAgo) });
          }
        }
        if (!last.read && last.from === 'office') {
          notes.push({ userId: st.userId, itemId: it.id, tone: 'info', title: `${office(t.code).name} sent you a message`, body: excerpt(last.body), link: null, isRead: false, createdAt: hoursAgo(last.hoursAgo) });
        }
      }
      await tx.officeMessage.createMany({ data: messages });

      /* applications */
      const admins = (await tx.user.findMany({ where: { role: 'admin', isActive: true }, select: { id: true } })).map((a) => a.id);
      const appRefs: { name: string; ref: string; status: AppStatus; email: string; birthday: string }[] = [];
      for (const a of APPLICATIONS) {
        const submittedAt = hoursAgo(a.hoursAgo);
        const guardian = a.guardian === 'father' ? a.father : a.mother;
        // Stored in capitals, as the application form stores them.
        const lastName = a.lastName.toUpperCase();
        const firstName = a.firstName.toUpperCase();
        const middleName = a.middleName?.toUpperCase() ?? null;
        const created = await tx.application.create({
          data: {
            status: a.status, statusToken: createHash('sha256').update(randomBytes(24).toString('hex')).digest('hex'),
            admissionType: a.admissionType, programId: programs.get(a.program)!, yearLevel: a.yearLevel,
            lastName, firstName, middleName, sex: a.sex, civilStatus: 'Single',
            birthday: new Date(`${a.birthday}T00:00:00Z`), placeOfBirth: a.placeOfBirth, personalEmail: a.personalEmail,
            contactNumber: a.contactNumber, religion: a.religion, permanentAddress: null,
            region: a.region, province: a.province, city: a.city, barangay: a.barangay, street: a.street, postalCode: a.postalCode,
            fatherFirst: a.father[0], fatherLast: a.father[1], fatherOccupation: a.father[2],
            motherFirst: a.mother[0], motherLast: a.mother[1], motherOccupation: a.mother[2],
            guardianFirst: guardian[0], guardianLast: guardian[1], guardianRelationship: a.guardian === 'father' ? 'Father' : 'Mother',
            guardianContact: a.guardianContact, submittedAt,
            ...(a.status !== 'pending' ? { reviewedById: registrarStaff.userId, reviewedAt: hoursAgo(a.hoursAgo - 20) } : {}),
            ...(a.status === 'rejected' ? { rejectReason: a.rejectReason } : {}),
            ...(a.status === 'approved' ? { userId: userId.get(schoolEmail(NEW_STUDENT))!, tempPassword: TEMP_PASSWORD } : {}),
          },
          select: { id: true },
        });
        const ref = `APP-${manilaYear(submittedAt)}-${pad(created.id, 4)}`;
        await tx.application.update({ where: { id: created.id }, data: { reference: ref } });
        appRefs.push({ name: `${firstName} ${lastName}`, ref, status: a.status, email: a.personalEmail, birthday: a.birthday });
        if (a.status === 'approved') {
          await tx.student.update({ where: { studentNumber: NEW_STUDENT.number }, data: { applicationId: created.id } });
        }
        if (a.status === 'pending') {
          for (const uid of new Set([...staffOf('registrar'), ...admins])) {
            notes.push({ userId: uid, itemId: null, tone: 'pending', title: `New application: ${firstName} ${lastName}`, body: `${ref} is waiting for review.`, link: `/applications/${created.id}`, isRead: false, createdAt: submittedAt });
          }
        }
      }
      await tx.notification.createMany({ data: notes });

      /* more deadlines, a scheduled reminder, and their log entries */
      const registrarDue = at(addDays(today, 10), '17:00');
      const deanDue = at(addDays(today, 1), '17:00');
      for (const [c, dueAt, note] of [
        ['registrar', registrarDue, 'Submit missing records before enrollment for the next term opens.'],
        ['dean', deanDue, null],
      ] as const) {
        await tx.officeDeadline.upsert({
          where: { officeId_academicYearId_term: { officeId: office(c).id, academicYearId: year.id, term } },
          create: { officeId: office(c).id, academicYearId: year.id, term, dueAt, note, setById: reviewer(c) },
          update: { dueAt, note, setById: reviewer(c), passedNotifiedAt: null },
        });
      }
      const sendAt = at(addDays(today, 1), '09:00');
      const reminderText = 'Library clearance closes soon. Return your books or upload your signed return slip.';
      await tx.reminder.create({
        data: { officeId: office('library').id, academicYearId: year.id, term, audience: 'outstanding', message: reminderText, sendAt, createdById: reviewer('library') },
      });
      await tx.adminAction.createMany({
        data: [
          { userId: reviewer('registrar'), action: 'deadline.set', details: `Set the Registrar deadline to ${prettyDue(registrarDue)} (${termText}), notified 0 students`, createdAt: hoursAgo(30) },
          { userId: reviewer('dean'), action: 'deadline.set', details: `Set the Dean's Office deadline to ${prettyDue(deanDue)} (${termText}), notified 0 students`, createdAt: hoursAgo(28) },
          { userId: reviewer('library'), action: 'reminder.schedule', details: `Scheduled a reminder from Library to students not yet cleared for ${prettyDue(sendAt)}: ${reminderText}`, createdAt: hoursAgo(6) },
        ],
      });

      return {
        students: students.length,
        waiting: subs.filter((s) => s.status === 'submitted').length,
        history: subs.filter((s) => s.status !== 'submitted').length,
        messages: messages.length,
        appRefs,
        registrarDue,
        deanDue,
        sendAt,
      };
    }, { maxWait: 20_000, timeout: 180_000 });

    const waitingBy = CODES.map((c) => `${office(c).name} ${subs.filter((s) => s.code === c && s.status === 'submitted').length}`).join(', ');
    console.log([
      `Test data added (${termText}). Students use ${STUDENT_PASSWORD} and staff ${PASSWORD}, unless noted.`,
      `  ${result.students} more students, ${result.waiting} files waiting for review (${waitingBy}), ${result.history} reviewed files, ${result.messages} messages`,
      '  Students to try:',
      `    ${schoolEmail(STUDENTS[0])} (2023-00101)  fully cleared`,
      '    2025-00304  Christian Navarro: Library returned his file once; resubmitted, waiting',
      '    2023-00105  Erica Pascual: Property needs action, her own deadline passed yesterday',
      '    2023-00104  Rafael Villanueva: unread message from the Registrar',
      '    2026-00401  Joshua Ramos: nothing reviewed yet',
      `    2026-00001  Bianca Mendoza: temporary password ${TEMP_PASSWORD}, must change it on first sign-in`,
      '  Staff:',
      `    santiagoronaldaccounting@${DOMAIN}  second Accounting staff member (shares the queue)`,
      `    delarosamarielibrary@${DOMAIN}  turned off; sign-in is refused`,
      '  Applications (status lookup uses reference + personal email + birthday):',
      ...result.appRefs.map((a) => `    ${a.ref}  ${a.status.padEnd(8)}  ${a.name}  ${a.email}  ${a.birthday}`),
      `  Deadlines added: Registrar ${prettyDue(result.registrarDue)}, Dean's Office ${prettyDue(result.deanDue)}`,
      `  Scheduled reminder: Library, ${prettyDue(result.sendAt)}`,
    ].join('\n'));
  } catch (e) {
    for (const key of uploaded) await store.remove(key).catch(() => undefined);
    throw e;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Loading test data failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
