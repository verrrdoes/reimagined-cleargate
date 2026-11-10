import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { LIMITS } from '@/lib/constants';
import { addDays, manilaDayStart, manilaYmd, parseYmd, TIME_ZONE } from '@/lib/time';

/* ---------- §8.11 Audit log (Registrar and admins) ---------- */

export const AUDIT_KINDS = [
  'Status change',
  'Evidence uploaded',
  'Evidence approved',
  'Evidence returned',
  'Application submitted',
  'Application approved',
  'Application rejected',
  'Deadline',
  'Reminder',
  'Password request',
  'Admin change',
] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

export type AuditRow = {
  at: Date;
  kind: AuditKind;
  actor: string;
  office: string;
  subject: string;
  details: string;
};

export type AuditRange = { from: string; to: string };

/**
 * ?from=&to= as YYYY-MM-DD; a missing or invalid value falls back to the last 90 days through today (Manila).
 * A start after the end is read the other way round.
 */
export function auditRange(from: unknown, to: unknown): AuditRange {
  const today = manilaYmd();
  const a = parseYmd(typeof from === 'string' ? from : null) ?? addDays(today, -LIMITS.auditDefaultDays);
  const b = parseYmd(typeof to === 'string' ? to : null) ?? today;
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

/**
 * The person behind an action (§5.4): staff full name → student "First Last" → users.full_name →
 * "System Administrator" for admins → email → "System". Expects the aliases u (users), st (office_staff), s (students).
 */
const WHO = Prisma.sql`COALESCE(st.full_name, s.first_name || ' ' || s.last_name, u.full_name,
  CASE WHEN u.role = 'admin' THEN 'System Administrator' ELSE u.email END, 'System')`;

/** "First Last (2026-00012)" for the student a clearance belongs to (alias cs). */
const SUBJECT = Prisma.sql`cs.first_name || ' ' || cs.last_name || ' (' || cs.student_number || ')'`;

/**
 * One merged feed, newest first, at most 1000 rows, for Manila days from..to inclusive:
 * status changes, evidence uploaded/approved/returned, applications submitted/approved/rejected,
 * and deadline, reminder and admin changes from admin_actions.
 */
export async function auditRows(range: AuditRange): Promise<AuditRow[]> {
  const start = manilaDayStart(range.from);
  const end = manilaDayStart(addDays(range.to, 1));
  const inRange = (col: Prisma.Sql) => Prisma.sql`${col} >= ${start}::timestamptz AND ${col} < ${end}::timestamptz`;

  const rows = await db.$queryRaw<{ at: Date; kind: string; actor: string | null; office: string | null; subject: string | null; details: string | null }[]>`
    SELECT feed.at, feed.kind, feed.actor, feed.office, feed.subject, feed.details FROM (
      SELECT l.changed_at AS at, 'Status change'::text AS kind, ${WHO} AS actor, o.name::text AS office,
             ${SUBJECT} AS subject,
             COALESCE(l.old_status::text, 'new') || ' → ' || l.new_status::text
               || CASE WHEN l.note IS NULL THEN '' ELSE ': ' || l.note END AS details
        FROM clearance_item_logs l
        JOIN clearance_items ci ON ci.item_id = l.item_id
        JOIN offices o          ON o.office_id = ci.office_id
        JOIN clearances c       ON c.clearance_id = ci.clearance_id
        JOIN students cs        ON cs.student_id = c.student_id
        LEFT JOIN users u         ON u.user_id = l.changed_by
        LEFT JOIN office_staff st ON st.user_id = u.user_id
        LEFT JOIN students s      ON s.user_id = u.user_id
       WHERE ${inRange(Prisma.sql`l.changed_at`)}

      UNION ALL
      SELECT sb.submitted_at, 'Evidence uploaded', cs.first_name || ' ' || cs.last_name, o.name, ${SUBJECT},
             COALESCE(sb.reference, '') || ': ' || sb.original_name
        FROM submissions sb
        JOIN clearance_items ci ON ci.item_id = sb.item_id
        JOIN offices o          ON o.office_id = ci.office_id
        JOIN clearances c       ON c.clearance_id = ci.clearance_id
        JOIN students cs        ON cs.student_id = c.student_id
       WHERE ${inRange(Prisma.sql`sb.submitted_at`)}

      UNION ALL
      SELECT sb.reviewed_at,
             CASE WHEN sb.status = 'approved' THEN 'Evidence approved' ELSE 'Evidence returned' END,
             ${WHO}, o.name, ${SUBJECT},
             COALESCE(sb.reference, '') || CASE WHEN sb.return_category IS NULL THEN '' ELSE ': ' || sb.return_category END
        FROM submissions sb
        JOIN clearance_items ci ON ci.item_id = sb.item_id
        JOIN offices o          ON o.office_id = ci.office_id
        JOIN clearances c       ON c.clearance_id = ci.clearance_id
        JOIN students cs        ON cs.student_id = c.student_id
        LEFT JOIN users u         ON u.user_id = sb.reviewed_by
        LEFT JOIN office_staff st ON st.user_id = u.user_id
        LEFT JOIN students s      ON s.user_id = u.user_id
       WHERE sb.reviewed_at IS NOT NULL AND sb.status IN ('approved', 'returned')
         AND ${inRange(Prisma.sql`sb.reviewed_at`)}

      UNION ALL
      SELECT a.submitted_at, 'Application submitted', a.first_name || ' ' || a.last_name, 'Registrar',
             a.first_name || ' ' || a.last_name, COALESCE(a.reference, '') || ' · ' || a.personal_email
        FROM applications a
       WHERE ${inRange(Prisma.sql`a.submitted_at`)}

      UNION ALL
      SELECT a.reviewed_at,
             CASE WHEN a.status = 'approved' THEN 'Application approved' ELSE 'Application rejected' END,
             ${WHO}, 'Registrar', a.first_name || ' ' || a.last_name,
             COALESCE(a.reference, '') || CASE WHEN a.reject_reason IS NULL THEN '' ELSE ': ' || a.reject_reason END
        FROM applications a
        LEFT JOIN users u         ON u.user_id = a.reviewed_by
        LEFT JOIN office_staff st ON st.user_id = u.user_id
        LEFT JOIN students s      ON s.user_id = u.user_id
       WHERE a.reviewed_at IS NOT NULL AND ${inRange(Prisma.sql`a.reviewed_at`)}

      UNION ALL
      SELECT x.created_at,
             CASE WHEN x.action LIKE 'deadline.%' THEN 'Deadline'
                  WHEN x.action LIKE 'reminder.%' THEN 'Reminder'
                  WHEN x.action LIKE 'password_request.%' THEN 'Password request'
                  ELSE 'Admin change' END,
             ${WHO}, COALESCE(o2.name, ''), '', x.details
        FROM admin_actions x
        LEFT JOIN users u         ON u.user_id = x.user_id
        LEFT JOIN office_staff st ON st.user_id = u.user_id
        LEFT JOIN students s      ON s.user_id = u.user_id
        LEFT JOIN offices o2      ON o2.office_id = st.office_id
       WHERE ${inRange(Prisma.sql`x.created_at`)}
    ) AS feed
    ORDER BY feed.at DESC
    LIMIT ${LIMITS.auditRows}`;

  return rows.map((r) => ({
    at: new Date(r.at),
    kind: (AUDIT_KINDS as readonly string[]).includes(r.kind) ? (r.kind as AuditKind) : 'Admin change',
    actor: r.actor || 'System',
    office: r.office ?? '',
    subject: r.subject ?? '',
    details: r.details ?? '',
  }));
}

const STATUS_WORD: Record<string, string> = { needs_action: 'Needs action', pending: 'Pending', approved: 'Approved', new: 'New' };

/** "pending → approved: note" reads "Pending → Approved: note" on screen (the CSV keeps the stored words). */
export function prettyDetails(details: string): string {
  return details.replace(/\b(needs_action|pending|approved|new) → (needs_action|pending|approved)\b/, (_m, a: string, b: string) => `${STATUS_WORD[a]} → ${STATUS_WORD[b]}`);
}

/** Case-insensitive match over every column, as the legacy table search did. */
export function matchesAudit(row: AuditRow, q: string): boolean {
  if (!q) return true;
  const hay = [row.kind, row.actor, row.office, row.subject, row.details, prettyDetails(row.details)].join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

const stampFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** "2026-10-24 14:03:09" in Manila time, which Excel reads as a date and time. */
export function manilaStamp(d: Date): string {
  const p: Record<string, string> = {};
  for (const part of stampFormat.formatToParts(d)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
}

export const AUDIT_CSV_HEADER = ['When', 'Type', 'By', 'Office', 'About', 'Details'] as const;

export const auditCsvName = (range: AuditRange) => `cleargate-audit-${range.from}-to-${range.to}.csv`;

export const auditCsvRows = (rows: AuditRow[]) =>
  rows.map((r) => [manilaStamp(r.at), r.kind, r.actor, r.office, r.subject, r.details]);
