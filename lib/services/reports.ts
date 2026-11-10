import 'server-only';
import { db } from '@/lib/db';
import { fail } from '@/lib/result';
import { STATUS } from '@/lib/constants';
import { loadCurrentTerm, type CurrentTerm } from '@/lib/services/clearance';
import type { ItemStatus } from '@/generated/prisma/client';

/* ---------- §8.10 Reports (Registrar and admins, current term) ---------- */

export type ReportTerm = { academicYearId: number; label: string; term: CurrentTerm['term']; termLabel: string };

export type ProgressRow = { clearances: number; cleared: number; avgPercent: number | null };
export type ProgramReportRow = ProgressRow & { code: string; name: string };
export type YearReportRow = ProgressRow & { yearLevel: number };
export type OfficeReportRow = {
  code: string;
  name: string;
  icon: string;
  approved: number;
  pending: number;
  needsAction: number;
  /** Submissions still waiting for a decision (all time). */
  waitingEvidence: number;
  /** Average upload-to-decision time in hours, 1 decimal (all time). Null when nothing was reviewed. */
  avgReviewHours: number | null;
  /** The earliest upload still waiting for a decision (all time). */
  oldestWaiting: Date | null;
};

export type Report =
  | { term: null }
  | {
      term: ReportTerm;
      /** Active student accounts. */
      students: number;
      clearances: number;
      cleared: number;
      /** Rounded average of the per-clearance percent; null when no clearance is open. */
      avgPercent: number | null;
      byProgram: ProgramReportRow[];
      byYear: YearReportRow[];
      byOffice: OfficeReportRow[];
      applications: { pending: number; approved: number; rejected: number };
    };

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const nOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * The per-clearance summary of one term (legacy v_clearance_summary): percent_complete is
 * round(100 * approved / total) per clearance (null without items), eligible when every item is approved.
 */
function summarySql(ct: CurrentTerm) {
  return db.$queryRaw<{ clearances: number; cleared: number; avg_percent: number | null }[]>`
    WITH cs AS (
      SELECT c.clearance_id,
             COUNT(ci.item_id) AS total,
             COUNT(ci.item_id) FILTER (WHERE ci.status = 'approved') AS approved
        FROM clearances c
        LEFT JOIN clearance_items ci ON ci.clearance_id = c.clearance_id
       WHERE c.academic_year_id = ${ct.academicYearId} AND c.term = ${ct.term}::"Term"
       GROUP BY c.clearance_id
    )
    SELECT COUNT(*)::int AS clearances,
           COUNT(*) FILTER (WHERE total > 0 AND approved = total)::int AS cleared,
           ROUND(AVG(ROUND(100.0 * approved / NULLIF(total, 0))))::int AS avg_percent
      FROM cs`;
}

function byProgramSql(ct: CurrentTerm) {
  return db.$queryRaw<{ code: string; name: string; clearances: number; cleared: number; avg_percent: number | null }[]>`
    WITH cs AS (
      SELECT c.clearance_id, s.program_id,
             COUNT(ci.item_id) AS total,
             COUNT(ci.item_id) FILTER (WHERE ci.status = 'approved') AS approved
        FROM clearances c
        JOIN students s ON s.student_id = c.student_id
        LEFT JOIN clearance_items ci ON ci.clearance_id = c.clearance_id
       WHERE c.academic_year_id = ${ct.academicYearId} AND c.term = ${ct.term}::"Term"
       GROUP BY c.clearance_id, s.program_id
    )
    SELECT p.code, p.name,
           COUNT(cs.clearance_id)::int AS clearances,
           COUNT(cs.clearance_id) FILTER (WHERE cs.total > 0 AND cs.approved = cs.total)::int AS cleared,
           ROUND(AVG(ROUND(100.0 * cs.approved / NULLIF(cs.total, 0))))::int AS avg_percent
      FROM programs p
      LEFT JOIN cs ON cs.program_id = p.program_id
     GROUP BY p.program_id, p.code, p.name
     ORDER BY p.code`;
}

function byYearSql(ct: CurrentTerm) {
  return db.$queryRaw<{ year_level: number; clearances: number; cleared: number; avg_percent: number | null }[]>`
    WITH cs AS (
      SELECT c.clearance_id, s.year_level,
             COUNT(ci.item_id) AS total,
             COUNT(ci.item_id) FILTER (WHERE ci.status = 'approved') AS approved
        FROM clearances c
        JOIN students s ON s.student_id = c.student_id
        LEFT JOIN clearance_items ci ON ci.clearance_id = c.clearance_id
       WHERE c.academic_year_id = ${ct.academicYearId} AND c.term = ${ct.term}::"Term"
       GROUP BY c.clearance_id, s.year_level
    )
    SELECT year_level::int AS year_level,
           COUNT(*)::int AS clearances,
           COUNT(*) FILTER (WHERE total > 0 AND approved = total)::int AS cleared,
           ROUND(AVG(ROUND(100.0 * approved / NULLIF(total, 0))))::int AS avg_percent
      FROM cs
     GROUP BY year_level
     ORDER BY year_level`;
}

/**
 * Active offices in sort order: this term's item counts, plus evidence waiting, the average review time
 * (whole minutes from upload to decision, averaged, in hours to 1 decimal) and the oldest wait, all time.
 */
function byOfficeSql(ct: CurrentTerm) {
  return db.$queryRaw<
    {
      code: string;
      name: string;
      icon: string;
      approved: number;
      pending: number;
      needs_action: number;
      waiting_evidence: number;
      avg_review_hours: number | null;
      oldest_waiting: Date | null;
    }[]
  >`
    SELECT o.code, o.name, o.icon,
           COUNT(ci.item_id) FILTER (WHERE ci.status = 'approved')::int AS approved,
           COUNT(ci.item_id) FILTER (WHERE ci.status = 'pending')::int AS pending,
           COUNT(ci.item_id) FILTER (WHERE ci.status = 'needs_action')::int AS needs_action,
           (SELECT COUNT(*)
              FROM submissions sb JOIN clearance_items x ON x.item_id = sb.item_id
             WHERE x.office_id = o.office_id AND sb.status = 'submitted')::int AS waiting_evidence,
           (SELECT ROUND(AVG(TRUNC(EXTRACT(EPOCH FROM (sb.reviewed_at - sb.submitted_at))::numeric / 60)) / 60, 1)
              FROM submissions sb JOIN clearance_items x ON x.item_id = sb.item_id
             WHERE x.office_id = o.office_id AND sb.reviewed_at IS NOT NULL)::float8 AS avg_review_hours,
           (SELECT MIN(sb.submitted_at)
              FROM submissions sb JOIN clearance_items x ON x.item_id = sb.item_id
             WHERE x.office_id = o.office_id AND sb.status = 'submitted') AS oldest_waiting
      FROM offices o
      LEFT JOIN clearance_items ci
             ON ci.office_id = o.office_id
            AND ci.clearance_id IN (SELECT clearance_id FROM clearances
                                     WHERE academic_year_id = ${ct.academicYearId} AND term = ${ct.term}::"Term")
     WHERE o.is_active
     GROUP BY o.office_id, o.code, o.name, o.icon, o.sort_order
     ORDER BY o.sort_order, o.name`;
}

function applicationsSql() {
  return db.$queryRaw<{ pending: number; approved: number; rejected: number }[]>`
    SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
           COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
           COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
      FROM applications`;
}

const progress = (r: { clearances: unknown; cleared: unknown; avg_percent: unknown }): ProgressRow => ({
  clearances: n(r.clearances),
  cleared: n(r.cleared),
  avgPercent: n(r.clearances) > 0 ? nOrNull(r.avg_percent) : null,
});

/** The report for the current term, or `{ term: null }` when no academic year is current. */
export async function getReport(): Promise<Report> {
  const ct = await loadCurrentTerm();
  if (!ct) return { term: null };

  const [summary, students, programs, years, offices, apps] = await Promise.all([
    summarySql(ct),
    db.student.count({ where: { user: { isActive: true } } }),
    byProgramSql(ct),
    byYearSql(ct),
    byOfficeSql(ct),
    applicationsSql(),
  ]);

  const sum = progress(summary[0] ?? { clearances: 0, cleared: 0, avg_percent: null });
  const a = apps[0] ?? { pending: 0, approved: 0, rejected: 0 };
  return {
    term: { academicYearId: ct.academicYearId, label: ct.label, term: ct.term, termLabel: ct.termLabel },
    students,
    clearances: sum.clearances,
    cleared: sum.cleared,
    avgPercent: sum.avgPercent,
    byProgram: programs.map((r) => ({ code: r.code, name: r.name, ...progress(r) })),
    byYear: years.map((r) => ({ yearLevel: n(r.year_level), ...progress(r) })),
    byOffice: offices.map((r) => ({
      code: r.code,
      name: r.name,
      icon: r.icon,
      approved: n(r.approved),
      pending: n(r.pending),
      needsAction: n(r.needs_action),
      waitingEvidence: n(r.waiting_evidence),
      avgReviewHours: nOrNull(r.avg_review_hours),
      oldestWaiting: r.oldest_waiting ? new Date(r.oldest_waiting) : null,
    })),
    applications: { pending: n(a.pending), approved: n(a.approved), rejected: n(a.rejected) },
  };
}

/* ---------- CSV export ---------- */

export const REPORT_CSV_FIXED = ['Student ID', 'Name', 'School email', 'Program', 'Year'] as const;

/**
 * Every clearance of the current term, one row per student, ordered by program then name:
 * Student ID, Name, School email, Program, Year, one column per active office ("Needs action",
 * "Pending" or "Approved"), Offices cleared ("4 of 6"), Percent ("67%"), Eligible to enroll ("Yes"/"No").
 * 404 no_term without a current academic year.
 */
export async function reportCsvData(): Promise<{
  filename: string;
  header: string[];
  rows: (string | number)[][];
}> {
  const ct = await loadCurrentTerm();
  if (!ct) fail(404, 'no_term', 'No current academic year is set.');

  const [offices, clearances, items] = await Promise.all([
    db.office.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
    db.$queryRaw<
      {
        clearance_id: number;
        student_number: string;
        student_name: string;
        email: string;
        program: string;
        year_level: number;
        total: number;
        approved: number;
      }[]
    >`
      SELECT c.clearance_id, s.student_number, s.first_name || ' ' || s.last_name AS student_name,
             u.email, p.code AS program, s.year_level::int AS year_level,
             COUNT(ci.item_id)::int AS total,
             COUNT(ci.item_id) FILTER (WHERE ci.status = 'approved')::int AS approved
        FROM clearances c
        JOIN students s ON s.student_id = c.student_id
        JOIN users u    ON u.user_id = s.user_id
        JOIN programs p ON p.program_id = s.program_id
        LEFT JOIN clearance_items ci ON ci.clearance_id = c.clearance_id
       WHERE c.academic_year_id = ${ct.academicYearId} AND c.term = ${ct.term}::"Term"
       GROUP BY c.clearance_id, s.student_number, s.first_name, s.last_name, u.email, p.code, s.year_level
       ORDER BY p.code, lower(s.first_name || ' ' || s.last_name), c.clearance_id`,
    db.clearanceItem.findMany({
      where: { clearance: { academicYearId: ct.academicYearId, term: ct.term } },
      select: { clearanceId: true, officeId: true, status: true },
    }),
  ]);

  const status = new Map<number, Map<number, ItemStatus>>();
  for (const i of items) {
    let row = status.get(i.clearanceId);
    if (!row) status.set(i.clearanceId, (row = new Map()));
    row.set(i.officeId, i.status);
  }

  const header = [...REPORT_CSV_FIXED, ...offices.map((o) => o.name), 'Offices cleared', 'Percent', 'Eligible to enroll'];
  const rows = clearances.map((c) => {
    const total = n(c.total);
    const approved = n(c.approved);
    const percent = total ? Math.round((100 * approved) / total) : 0;
    const own = status.get(c.clearance_id);
    return [
      c.student_number,
      c.student_name,
      c.email,
      c.program,
      n(c.year_level),
      ...offices.map((o) => {
        const s = own?.get(o.id);
        return s ? STATUS[s].label : '';
      }),
      `${approved} of ${total}`,
      `${percent}%`,
      total > 0 && approved === total ? 'Yes' : 'No',
    ];
  });

  const word = (s: string) => s.replace(/\W+/g, '');
  return { filename: `cleargate-clearances-${word(ct.label)}-${word(ct.termLabel)}.csv`, header, rows };
}
