// The clearance certificate: its number, the signed code printed on it and in its QR, and the data it shows.
// The code is the clearance id plus a signature only ClearGate can make, so the public check page
// (/verify/<code>) can't be walked through by guessing ids. The page reads the clearance live, so a
// certificate stops checking out as soon as any office reopens the student's clearance.
import { createHmac } from 'node:crypto';
import { safeEqual } from '@/lib/files/sign';
import type { ItemStatus } from '@/lib/types';

const SIG_LENGTH = 10;

function signature(clearanceId: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`clearance-certificate:${clearanceId}`)
    .digest('hex')
    .slice(0, SIG_LENGTH)
    .toUpperCase();
}

/** "482-3FA91C07D2" */
export function certificateCode(clearanceId: number, secret: string): string {
  return `${clearanceId}-${signature(clearanceId, secret)}`;
}

const CODE = new RegExp(`^([1-9]\\d{0,8})-([0-9A-F]{${SIG_LENGTH}})$`);

/** The clearance id a code stands for, or null when the code is malformed or not one ClearGate signed. */
export function readCertificateCode(code: string, secret: string): number | null {
  const m = CODE.exec(code.trim().toUpperCase());
  if (!m) return null;
  const id = Number(m[1]);
  return safeEqual(m[2], signature(id, secret)) ? id : null;
}

/** "CLR-2026-00042": the start year of the academic year and the clearance. */
export function certificateNumber(clearanceId: number, academicYearLabel: string): string {
  const year = /\d{4}/.exec(academicYearLabel)?.[0] ?? '0000';
  return `CLR-${year}-${String(clearanceId).padStart(5, '0')}`;
}

/** The last four digits of a student number, for the public check page. */
export const numberHint = (studentNumber: string) => studentNumber.replace(/\D/g, '').slice(-4);

/** When the last office cleared the student, or null while any office hasn't. */
export function clearedOn(items: { status: ItemStatus; approvedAt: string | null }[]): string | null {
  if (!items.length || items.some((i) => i.status !== 'approved' || !i.approvedAt)) return null;
  const last = Math.max(...items.map((i) => Date.parse(i.approvedAt!)));
  return new Date(last).toISOString();
}

export const verifyPath = (code: string) => `/verify/${code}`;

export type CertificateOffice = { name: string; status: ItemStatus; approvedAt: string | null };

/** Everything the certificate and its check page show. Dates are ISO strings. */
export type CertificateData = {
  clearanceId: number;
  /** "CLR-2026-00042" */
  number: string;
  /** "42-3FA91C07D2" */
  code: string;
  school: string;
  student: { name: string; number: string; program: string; programName: string; yearLevel: number };
  /** "1st Semester, A.Y 2026 - 2027" */
  termText: string;
  offices: CertificateOffice[];
  /** When the last office cleared the student; null while the clearance isn't complete. */
  clearedAt: string | null;
  /** True while every office has the student cleared. */
  valid: boolean;
};
