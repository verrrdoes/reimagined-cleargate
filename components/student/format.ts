// Small client-safe helpers shared by the student pages and dialogs.
import { STATUS } from '@/lib/constants';
import type { StudentClearanceSummary, StudentItem, StudentProfile } from '@/lib/services/student';

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** 1st, 2nd, 3rd, 4th, 11th, 21st … */
export function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

/** "Maria Santos · 2nd year BSIT · A.Y 2026 - 2027, 1st Semester" */
export function studentLine(student: StudentProfile | null, clearance: StudentClearanceSummary | null): string {
  if (!student) return 'Student clearance portal';
  const parts = [`${student.firstName} ${student.lastName}`, `${ordinal(student.yearLevel)} year ${student.program}`];
  if (clearance) parts.push(`A.Y ${clearance.academicYear}, ${clearance.termLabel}`);
  return parts.join(' · ');
}

/** The upload button's label (§8.4), or null when the office has already cleared the student. */
export function uploadLabel(item: Pick<StudentItem, 'status' | 'submission'>): string | null {
  if (item.status === 'approved') return null;
  if (item.submission?.status === 'submitted') return 'Replace file';
  if (item.submission?.status === 'returned') return 'Resubmit evidence';
  return 'Upload';
}

/** The anchor id of an office's row on the Clearance status page (legacy `#office-{code}`). */
export const officeAnchor = (officeCode: string) => `office-${officeCode}`;
export const statusHref = (officeCode: string) => `/clearance-status#${officeAnchor(officeCode)}`;

/** The file route for a submission (inline preview, or `download` as an attachment). */
export const submissionFileUrl = (id: number, download = false) => `/api/files/submissions/${id}${download ? '?download=1' : ''}`;

/** "1.2 MB" or "640 KB" */
export function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "PDF", "JPEG", "PNG", "WEBP" */
export function fileKind(mime: string): string {
  return mime === 'application/pdf' ? 'PDF' : mime.replace(/^image\//, '').toUpperCase();
}

/** Search on the Requirements page: office, task, remarks, description and status label (legacy). */
export function matchesQuery(item: StudentItem, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [item.officeName, item.officeCode, item.task, item.remarks, item.description, item.nextStep ?? '', STATUS[item.status].label]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

/** The text that tells the student what to do next for an item. */
export function nextStepText(item: Pick<StudentItem, 'status' | 'nextStep' | 'description'>): string {
  return item.status === 'approved' ? item.description : item.nextStep || item.description;
}
