// Demo data (HANDOFF §13), ported from database/cleargate_db.sql lines 621–731. The accounts follow the
// accounts snapshot of Oct 24, 2026 (cleargate-accounts.xlsx): same user IDs, emails, names, created and
// last sign-in times. The snapshot has no passwords, so students get STUDENT_PASSWORD and staff and admin DEMO_PASSWORD.
// Run with `npx prisma db seed` (prisma.config.ts runs `tsx prisma/seed.ts`). It RESETS the database:
// every app table is emptied first, exactly like importing the legacy SQL file did.
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient, type ItemStatus } from '../generated/prisma/client';
import { createStorage, storageConfigFromProcessEnv } from '../lib/files/storage-core';
import { sniff } from '../lib/files/sniff';
import { addDays, manilaYmd, prettyDue } from '../lib/time';

neonConfig.webSocketConstructor = ws;

const DEMO_PASSWORD = 'ClearGate2026!';
const STUDENT_PASSWORD = 'StudentCleargate2026!';
const DOMAIN = 'cgateway.edu.ph';

/** A fixed legacy timestamp, read as Manila time (the legacy DATETIME values were naive +08:00). */
const manila = (local: string) => new Date(`${local}+08:00`);

const PROGRAMS = [
  { code: 'BSCS', name: 'Bachelor of Science in Computer Science' },
  { code: 'BSIT', name: 'Bachelor of Science in Information Technology' },
  { code: 'BSBA', name: 'Bachelor of Science in Business Administration' },
  { code: 'BSN', name: 'Bachelor of Science in Nursing' },
];

const YEARS = [
  { label: '2025 - 2026', startDate: '2025-08-01', endDate: '2026-05-31', isCurrent: false },
  { label: '2026 - 2027', startDate: '2026-08-01', endDate: '2027-05-31', isCurrent: true },
];

const OFFICES = [
  { code: 'library', name: 'Library', icon: 'book', officeHours: 'Mon to Fri · 8:00 AM to 5:00 PM', sortOrder: 1 },
  { code: 'accounting', name: 'Accounting', icon: 'wallet', officeHours: 'Mon to Fri · 8:00 AM to 4:00 PM', sortOrder: 2 },
  { code: 'registrar', name: 'Registrar', icon: 'file', officeHours: 'Mon to Fri · 8:00 AM to 5:00 PM', sortOrder: 3 },
  { code: 'guidance', name: 'Guidance Office', icon: 'heart', officeHours: 'Mon to Fri · 8:00 AM to 5:00 PM', sortOrder: 4 },
  { code: 'dean', name: "Dean's Office", icon: 'cap', officeHours: 'Mon to Fri · 9:00 AM to 4:00 PM', sortOrder: 5 },
  { code: 'property', name: 'Property Custodian', icon: 'box', officeHours: 'Mon to Fri · 8:00 AM to 5:00 PM', sortOrder: 6 },
] as const;

type OfficeCode = (typeof OFFICES)[number]['code'];

/** When the demo accounts were created in the snapshot (Manila time). */
const SEEDED_AT = '2026-10-20T20:11:09';

// Times below are the snapshot's "Last sign-in" (Manila time); null = never signed in.
const STAFF: { id: number; email: string; office: OfficeCode; fullName: string; position: string; lastLogin: string | null }[] = [
  { id: 10, email: 'resosojustinlibrary@cgateway.edu.ph', office: 'library', fullName: 'Justin Edelf Khalil Resoso', position: 'Head Librarian', lastLogin: '2026-10-21T23:42:47' },
  { id: 11, email: 'maligrogerardoaccounting@cgateway.edu.ph', office: 'accounting', fullName: 'Gerardo Maligro Jr.', position: 'Accounting Officer', lastLogin: '2026-10-21T22:51:16' },
  { id: 12, email: 'bordeosjamesregistrar@cgateway.edu.ph', office: 'registrar', fullName: 'James Bordeos', position: 'Registrar', lastLogin: '2026-10-24T17:04:12' },
  { id: 13, email: 'tapnioyelguidance@cgateway.edu.ph', office: 'guidance', fullName: 'Yel Tapnio', position: 'Guidance Counselor', lastLogin: '2026-10-22T13:05:12' },
  { id: 14, email: 'sundiamaldrindean@cgateway.edu.ph', office: 'dean', fullName: 'Aldrin Sundiam', position: "Dean's Secretary", lastLogin: null },
  { id: 15, email: 'maritinitoeugeneproperty@cgateway.edu.ph', office: 'property', fullName: 'Eugene Maritinito', position: 'Property Custodian', lastLogin: null },
];

// Student names are stored in capitals, the same as names that come in through the application form.
const STUDENT = {
  id: 1,
  email: 'tapnioariel@cgateway.edu.ph',
  studentNumber: '2024-00123',
  firstName: 'ARIEL',
  lastName: 'TAPNIO',
  program: 'BSCS',
  yearLevel: 3,
  lastLogin: '2026-10-24T16:51:57',
};

const ADMIN = { id: 20, email: 'loretodenveradmin@cgateway.edu.ph', fullName: 'Denver Loreto', lastLogin: '2026-10-22T13:01:53' };

/** The snapshot's other students. Their clearances for the term are open, with no office review yet. */
const MORE_STUDENTS: {
  id: number;
  email: string;
  studentNumber: string;
  lastName: string;
  firstName: string;
  program: string;
  yearLevel: number;
  personalEmail: string | null;
  phone: string | null;
  createdAt: string;
  lastLogin: string;
}[] = [
  { id: 21, email: 'jamesloreto@student.example.edu', studentNumber: '2026-01212', lastName: 'LORETO', firstName: 'JAMES DENVER', program: 'BSCS', yearLevel: 2, personalEmail: null, phone: null, createdAt: '2026-10-20T20:31:09', lastLogin: '2026-10-21T20:17:24' },
  { id: 25, email: 'bonjingberto@cgateway.edu.ph', studentNumber: '2026-01213', lastName: 'BONJING', firstName: 'BERTO', program: 'BSCS', yearLevel: 3, personalEmail: 'jamesloreto50@gmail.com', phone: '09812975979', createdAt: '2026-10-21T19:18:00', lastLogin: '2026-10-21T19:20:01' },
  { id: 26, email: 'trinidadangelika@cgateway.edu.ph', studentNumber: '2026-01214', lastName: 'TRINIDAD', firstName: 'ANGELIKA', program: 'BSIT', yearLevel: 4, personalEmail: 'angelikatrinidad101@gmail.com', phone: '09103213421', createdAt: '2026-10-21T20:04:17', lastLogin: '2026-10-21T20:04:45' },
  { id: 27, email: 'maligrorei@cgateway.edu.ph', studentNumber: '2026-01215', lastName: 'MALIGRO', firstName: 'REI', program: 'BSIT', yearLevel: 3, personalEmail: 'reimaligro@gmail.com', phone: '09812975979', createdAt: '2026-10-21T20:23:14', lastLogin: '2026-10-21T20:23:39' },
  { id: 28, email: 'bolivararvy@cgateway.edu.ph', studentNumber: '2026-01216', lastName: 'BOLIVAR', firstName: 'ARVY', program: 'BSCS', yearLevel: 3, personalEmail: 'arvybolivar@gmail.com', phone: '091231231231', createdAt: '2026-10-21T22:38:26', lastLogin: '2026-10-21T22:53:28' },
  { id: 29, email: 'marklopez@cgateway.edu.ph', studentNumber: '2026-01217', lastName: 'MARK', firstName: 'LOPEZ', program: 'BSIT', yearLevel: 1, personalEmail: 'kahitsan@gmail.com', phone: '09123456121', createdAt: '2026-10-22T12:47:48', lastLogin: '2026-10-22T12:48:26' },
  { id: 30, email: 'lopezmark@cgateway.edu.ph', studentNumber: '2026-01218', lastName: 'LOPEZ', firstName: 'MARK', program: 'BSCS', yearLevel: 1, personalEmail: 'marklopez123@gmail.com', phone: '09123123561', createdAt: '2026-10-24T17:22:03', lastLogin: '2026-10-24T17:24:39' },
];

/** An item no office has reviewed yet: the same values as defaultItem() in lib/services/clearance.ts (server-only). */
const awaitingReview = (officeName: string) => ({
  status: 'pending' as const,
  task: 'Awaiting office review',
  remarks: 'Awaiting review',
  description: `${officeName} has not reviewed your account yet.`,
  nextStep: `Wait for ${officeName} to review your account, or visit the office.`,
});

/** Ariel Tapnio: matches the website design (4 of 6 cleared). */
const ITEMS: Record<
  OfficeCode,
  { status: ItemStatus; task: string; remarks: string; description: string; nextStep: string | null; approvedAt: string | null }
> = {
  library: {
    status: 'needs_action',
    task: 'Return 1 unreturned book',
    remarks: '1 unreturned book',
    description: 'Library is waiting for the book to be returned before your account can be cleared.',
    nextStep: 'Return the book to the Library so the office can clear your account.',
    approvedAt: null,
  },
  accounting: {
    status: 'pending',
    task: 'Review balance PHP 3,600',
    remarks: 'Review balance PHP 3,600',
    description: 'Review your balance with Accounting to resolve the pending clearance.',
    nextStep: 'Review your balance with Accounting to resolve the pending clearance.',
    approvedAt: null,
  },
  registrar: {
    status: 'approved',
    task: 'Records verified, form submitted',
    remarks: 'Records verified, form submitted',
    description: 'Registrar has already cleared your account.',
    nextStep: null,
    approvedAt: '2026-09-28T10:15:00',
  },
  guidance: {
    status: 'approved',
    task: 'No issues, cleared',
    remarks: 'No issues, cleared',
    description: 'Guidance Office has already cleared your account.',
    nextStep: null,
    approvedAt: '2026-09-28T13:40:00',
  },
  dean: {
    status: 'approved',
    task: 'Academic stand okay',
    remarks: 'Academic stand okay',
    description: "Dean's Office has already cleared your account.",
    nextStep: null,
    approvedAt: '2026-09-29T09:05:00',
  },
  property: {
    status: 'approved',
    task: 'No liabilities',
    remarks: 'No liabilities',
    description: 'Property Custodian has already cleared your account.',
    nextStep: null,
    approvedAt: '2026-09-29T15:20:00',
  },
};

const DEMO_FILES = {
  librarySlip: 'demo-book-return-slip.pdf',
  officialReceipt: 'demo-official-receipt.pdf',
} as const;

function connectionString(): string {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('Set DIRECT_URL (or DATABASE_URL) in .env before seeding. See .env.example.');
  return url;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'the configured database';
  }
}

/** Stores one demo PDF under a content-derived evidence key (re-seeding overwrites the same object). */
async function uploadDemoFile(store: ReturnType<typeof createStorage>, name: string) {
  const bytes = new Uint8Array(await readFile(fileURLToPath(new URL(`./demo-files/${name}`, import.meta.url))));
  const type = sniff(bytes.subarray(0, 16));
  if (type?.mime !== 'application/pdf') throw new Error(`prisma/demo-files/${name} is not a PDF.`);
  const key = `evidence/${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}.pdf`;
  await store.put(key, bytes, 'application/pdf');
  return { key, size: bytes.byteLength };
}

async function main() {
  const url = connectionString();
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });

  try {
    // Files first: if storage isn't reachable, the database is left untouched.
    const storageConfig = storageConfigFromProcessEnv(() => {
      throw new Error('The seed never creates upload URLs.');
    });
    const store = createStorage(storageConfig);
    const slip = await uploadDemoFile(store, DEMO_FILES.librarySlip);
    const receipt = await uploadDemoFile(store, DEMO_FILES.officialReceipt);

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const studentHash = await bcrypt.hash(STUDENT_PASSWORD, 12);
    const today = manilaYmd();
    const libraryDue = new Date(`${addDays(today, 5)}T17:00:00+08:00`);
    const accountingDue = new Date(`${addDays(today, 2)}T17:00:00+08:00`);

    const summary = await prisma.$transaction(
      async (tx) => {
        // Reset the demo. A constant statement: nothing here comes from user input.
        await tx.$executeRaw`
          TRUNCATE TABLE
            deadline_alerts, reminders, office_deadlines, admin_actions, login_attempts, password_resets,
            notifications, office_messages, submissions, clearance_item_logs, clearance_items, clearances,
            office_staff, students, applications, sessions, users, offices, academic_years, programs, job_state
          RESTART IDENTITY CASCADE`;

        await tx.program.createMany({ data: PROGRAMS });
        const programs = new Map((await tx.program.findMany()).map((p) => [p.code, p.id]));

        const years = new Map<string, number>();
        for (const y of YEARS) {
          const row = await tx.academicYear.create({
            data: { label: y.label, startDate: new Date(`${y.startDate}T00:00:00Z`), endDate: new Date(`${y.endDate}T00:00:00Z`), isCurrent: y.isCurrent },
          });
          years.set(y.label, row.id);
        }

        const offices = new Map<OfficeCode, { id: number; name: string }>();
        for (const o of OFFICES) {
          const row = await tx.office.create({ data: { ...o, contactEmail: `${o.code}@${DOMAIN}` } });
          offices.set(o.code, { id: row.id, name: row.name });
        }
        const office = (code: OfficeCode) => offices.get(code)!;

        // Accounts: the demo student, 1 staff member per office, 1 admin (the snapshot's other students follow below).
        const createdAt = manila(SEEDED_AT);
        const lastLoginAt = (local: string | null) => (local ? manila(local) : null);
        const studentUser = await tx.user.create({
          data: {
            id: STUDENT.id,
            email: STUDENT.email,
            passwordHash: studentHash,
            role: 'student',
            createdAt,
            lastLoginAt: lastLoginAt(STUDENT.lastLogin),
            student: {
              create: {
                studentNumber: STUDENT.studentNumber,
                firstName: STUDENT.firstName,
                lastName: STUDENT.lastName,
                programId: programs.get(STUDENT.program)!,
                yearLevel: STUDENT.yearLevel,
              },
            },
          },
          include: { student: true },
        });
        const student = studentUser.student!;

        const staffIds = new Map<OfficeCode, number>();
        for (const s of STAFF) {
          const row = await tx.user.create({
            data: {
              id: s.id,
              email: s.email,
              passwordHash,
              role: 'staff',
              createdAt,
              lastLoginAt: lastLoginAt(s.lastLogin),
              staffProfile: { create: { officeId: office(s.office).id, fullName: s.fullName, position: s.position } },
            },
          });
          staffIds.set(s.office, row.id);
        }

        await tx.user.create({
          data: {
            id: ADMIN.id,
            email: ADMIN.email,
            passwordHash,
            role: 'admin',
            fullName: ADMIN.fullName,
            createdAt,
            lastLoginAt: lastLoginAt(ADMIN.lastLogin),
          },
        });

        // Clearance for A.Y 2026 - 2027, 1st Semester.
        const yearId = years.get('2026 - 2027')!;
        const clearance = await tx.clearance.create({
          data: { studentId: student.id, academicYearId: yearId, term: 'first_semester' },
        });

        for (const s of MORE_STUDENTS) {
          const row = await tx.user.create({
            data: {
              id: s.id,
              email: s.email,
              passwordHash: studentHash,
              role: 'student',
              personalEmail: s.personalEmail,
              phone: s.phone,
              createdAt: manila(s.createdAt),
              lastLoginAt: manila(s.lastLogin),
              student: {
                create: {
                  studentNumber: s.studentNumber,
                  firstName: s.firstName,
                  lastName: s.lastName,
                  programId: programs.get(s.program)!,
                  yearLevel: s.yearLevel,
                },
              },
            },
            select: { student: { select: { id: true } } },
          });
          const c = await tx.clearance.create({
            data: { studentId: row.student!.id, academicYearId: yearId, term: 'first_semester' },
          });
          await tx.clearanceItem.createMany({
            data: OFFICES.map((o) => ({ clearanceId: c.id, officeId: office(o.code).id, ...awaitingReview(o.name) })),
          });
        }

        // The accounts above keep the snapshot's user IDs, so new accounts continue after the highest one.
        await tx.$executeRaw`SELECT setval(pg_get_serial_sequence('users', 'user_id'), (SELECT MAX(user_id) FROM users))`;

        const items = new Map<OfficeCode, number>();
        for (const o of OFFICES) {
          const it = ITEMS[o.code];
          const row = await tx.clearanceItem.create({
            data: {
              clearanceId: clearance.id,
              officeId: office(o.code).id,
              status: it.status,
              task: it.task,
              remarks: it.remarks,
              description: it.description,
              nextStep: it.nextStep,
              approvedAt: it.approvedAt ? manila(it.approvedAt) : null,
            },
          });
          items.set(o.code, row.id);
        }

        // Audit history for Ariel's approvals.
        await tx.clearanceItemLog.createMany({
          data: OFFICES.filter((o) => ITEMS[o.code].status === 'approved').map((o) => ({
            itemId: items.get(o.code)!,
            oldStatus: 'pending' as const,
            newStatus: 'approved' as const,
            note: 'Cleared during clearance week',
            changedById: staffIds.get(o.code)!,
            changedAt: manila(ITEMS[o.code].approvedAt!),
          })),
        });

        // Ariel's bell: two unread, one read.
        await tx.notification.createMany({
          data: [
            {
              userId: studentUser.id,
              itemId: items.get('library')!,
              tone: 'needs_action',
              title: 'Library needs action',
              body: '1 unreturned book is holding your clearance.',
              isRead: false,
              createdAt: manila('2026-10-01T09:00:00'),
            },
            {
              userId: studentUser.id,
              itemId: items.get('accounting')!,
              tone: 'pending',
              title: 'Accounting is reviewing',
              body: 'Review your balance of PHP 3,600 to finish clearance.',
              isRead: false,
              createdAt: manila('2026-10-01T09:05:00'),
            },
            {
              userId: studentUser.id,
              itemId: items.get('registrar')!,
              tone: 'approved',
              title: 'Registrar cleared you',
              body: 'Records verified, form submitted.',
              isRead: true,
              createdAt: manila('2026-09-28T10:15:00'),
            },
          ],
        });

        // Evidence: Library returned an unsigned book return slip (so Library needs action again);
        // Accounting is reviewing Ariel's official receipt.
        const reference = (code: OfficeCode, id: number, at: Date) =>
          `${code.slice(0, 3).toUpperCase()}-${manilaYmd(at).slice(0, 4)}-${String(id).padStart(4, '0')}`;

        const libSubmittedAt = manila('2026-09-30T15:10:00');
        const libSubmission = await tx.submission.create({
          data: {
            itemId: items.get('library')!,
            storageKey: slip.key,
            originalName: 'book-return-slip.pdf',
            mimeType: 'application/pdf',
            fileSize: slip.size,
            studentNote: 'Returned the book at the circulation desk.',
            status: 'returned',
            submittedById: studentUser.id,
            submittedAt: libSubmittedAt,
            reviewedById: staffIds.get('library')!,
            reviewedAt: manila('2026-10-01T09:00:00'),
            returnCategory: 'Incomplete or unverified evidence',
            reviewNote: 'The slip has no staff signature. Bring the book or your signed slip to the Library, then upload the signed copy.',
          },
        });
        const libRef = reference('library', libSubmission.id, libSubmittedAt);
        await tx.submission.update({ where: { id: libSubmission.id }, data: { reference: libRef } });

        const accSubmittedAt = manila('2026-10-01T09:05:00');
        const accSubmission = await tx.submission.create({
          data: {
            itemId: items.get('accounting')!,
            storageKey: receipt.key,
            originalName: 'official-receipt.pdf',
            mimeType: 'application/pdf',
            fileSize: receipt.size,
            studentNote: 'Paid PHP 3,600 at the cashier.',
            status: 'submitted',
            submittedById: studentUser.id,
            submittedAt: accSubmittedAt,
          },
        });
        const accRef = reference('accounting', accSubmission.id, accSubmittedAt);
        await tx.submission.update({ where: { id: accSubmission.id }, data: { reference: accRef } });

        // Accounting staff's bell: Ariel's receipt is waiting for review.
        await tx.notification.create({
          data: {
            userId: staffIds.get('accounting')!,
            itemId: items.get('accounting')!,
            tone: 'pending',
            title: `${STUDENT.firstName} ${STUDENT.lastName} uploaded evidence`,
            body: `${accRef} · official-receipt.pdf for "${ITEMS.accounting.task}"`,
            link: `/review/${accSubmission.id}`,
            isRead: false,
            createdAt: accSubmittedAt,
          },
        });

        // Deadlines for the open term, counted from today (Manila): Library in 5 days, Accounting in 2, both at 5:00 PM.
        await tx.officeDeadline.create({
          data: {
            officeId: office('library').id,
            academicYearId: yearId,
            term: 'first_semester',
            dueAt: libraryDue,
            note: 'Return borrowed books before the semester break.',
            setById: staffIds.get('library')!,
          },
        });
        await tx.officeDeadline.create({
          data: {
            officeId: office('accounting').id,
            academicYearId: yearId,
            term: 'first_semester',
            dueAt: accountingDue,
            note: null,
            setById: staffIds.get('accounting')!,
          },
        });

        const approved = OFFICES.filter((o) => ITEMS[o.code].status === 'approved').length;
        return { approved, total: OFFICES.length, libRef, accRef };
      },
      { maxWait: 20_000, timeout: 120_000 },
    );

    const where =
      storageConfig.bucket
        ? `in the bucket "${storageConfig.bucket}"`
        : 'on local disk in .data/uploads (set S3_BUCKET to use R2 or S3)';
    const lines = [
      `ClearGate demo data is ready on ${hostOf(url)}.`,
      `  ${PROGRAMS.length} programs, ${YEARS.length} academic years (current: 2026 - 2027), ${OFFICES.length} offices`,
      `  Accounts (students: password ${STUDENT_PASSWORD}; staff and admin: ${DEMO_PASSWORD}):`,
      ...[STUDENT, ...MORE_STUDENTS].map((s) => `    student  ${s.email}  (student number ${s.studentNumber})`),
      ...STAFF.map((s) => `    staff    ${s.email}  (${OFFICES.find((o) => o.code === s.office)!.name})`),
      `    admin    ${ADMIN.email}`,
      `  ${STUDENT.firstName} ${STUDENT.lastName}: 1st Semester, A.Y 2026 - 2027, ${summary.approved} of ${summary.total} offices cleared`,
      `  The other ${MORE_STUDENTS.length} students: same term, no office has reviewed them yet`,
      `  Submissions: ${summary.libRef} (returned), ${summary.accRef} (waiting for review)`,
      `  Deadlines: Library ${prettyDue(libraryDue)}, Accounting ${prettyDue(accountingDue)}`,
      `  Evidence files: 2 PDFs stored ${where}`,
    ];
    console.log(lines.join('\n'));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Seeding failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
