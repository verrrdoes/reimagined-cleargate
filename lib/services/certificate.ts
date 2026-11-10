import 'server-only';
import { db } from '@/lib/db';
import { appSecret } from '@/lib/env';
import { SCHOOL_NAME, TERM_LABEL } from '@/lib/constants';
import {
  certificateCode,
  certificateNumber,
  clearedOn,
  readCertificateCode,
  type CertificateData,
} from '@/lib/certificate';

// Loads the clearance certificate. The rules (code, number, cleared date) are in lib/certificate.ts,
// the PDF in lib/certificatePdf.ts.

/** The certificate for one clearance, read live, or null when there is no such clearance. */
export async function certificateFor(clearanceId: number): Promise<CertificateData | null> {
  const c = await db.clearance.findUnique({
    where: { id: clearanceId },
    select: {
      id: true,
      term: true,
      academicYear: { select: { label: true } },
      student: {
        select: { firstName: true, lastName: true, studentNumber: true, yearLevel: true, program: { select: { code: true, name: true } } },
      },
      items: {
        orderBy: [{ office: { sortOrder: 'asc' } }, { id: 'asc' }],
        select: { status: true, approvedAt: true, office: { select: { name: true } } },
      },
    },
  });
  if (!c) return null;

  const offices = c.items.map((i) => ({ name: i.office.name, status: i.status, approvedAt: i.approvedAt?.toISOString() ?? null }));
  const clearedAt = clearedOn(offices);
  return {
    clearanceId: c.id,
    number: certificateNumber(c.id, c.academicYear.label),
    code: certificateCode(c.id, appSecret()),
    school: SCHOOL_NAME,
    student: {
      name: `${c.student.firstName} ${c.student.lastName}`,
      number: c.student.studentNumber,
      program: c.student.program.code,
      programName: c.student.program.name,
      yearLevel: c.student.yearLevel,
    },
    termText: `${TERM_LABEL[c.term]}, A.Y ${c.academicYear.label}`,
    offices,
    clearedAt,
    valid: clearedAt !== null,
  };
}

/** The certificate a printed or scanned code stands for, or null when the code isn't one ClearGate signed. */
export async function certificateFromCode(code: string): Promise<CertificateData | null> {
  const id = readCertificateCode(code, appSecret());
  return id === null ? null : certificateFor(id);
}

/** The student's latest clearance, picked the way their dashboard picks it. */
export async function latestClearanceId(studentId: number): Promise<number | null> {
  const c = await db.clearance.findFirst({
    where: { studentId },
    orderBy: [{ academicYear: { startDate: 'desc' } }, { term: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  return c?.id ?? null;
}
