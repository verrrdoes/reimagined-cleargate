import 'server-only';
import { db, type Db } from '@/lib/db';
import { env } from '@/lib/env';
import { sendOfficeDigest } from '@/lib/mail';
import { digestWindowStart, isDigestDue, officeDigestEmail, shouldWarnAutoClear, type DigestEmail } from '@/lib/officeAutomation';
import { termText, type CurrentTerm } from '@/lib/services/clearance';
import type { Prisma, Term } from '@/generated/prisma/client';

// Queries behind auto-clear and the morning email (the rules and wording are in lib/officeAutomation.ts).

type TermKey = { academicYearId: number; term: Term };

/**
 * What auto-clear may approve for one office this term: items still pending that follow the office deadline
 * (no deadline of their own), that nobody at the office ever updated (only the student by uploading, or nobody),
 * with no upload waiting for review, for students whose account is active. Needs action means "hold".
 */
export function autoClearableWhere(officeId: number, term: TermKey): Prisma.ClearanceItemWhereInput {
  return {
    officeId,
    status: 'pending',
    dueAt: null,
    clearance: { academicYearId: term.academicYearId, term: term.term, student: { user: { isActive: true } } },
    submissions: { none: { status: 'submitted' } },
    OR: [{ updatedById: null }, { updatedBy: { role: 'student' } }],
  };
}

export const autoClearCount = (tx: Db, officeId: number, term: TermKey) =>
  tx.clearanceItem.count({ where: autoClearableWhere(officeId, term) });

export type AutoClearPlan = {
  /** ISO time of the office deadline when the students are cleared. */
  dueAt: string;
  /** Students it would clear if the deadline passed now. */
  count: number;
};

/** For Clearance status: the office's coming auto-clear, or null when auto-clear is off or no future deadline is set. */
export async function autoClearPlan(office: { id: number } | { code: string }, term: TermKey): Promise<AutoClearPlan | null> {
  const row = await db.office.findUnique({
    where: 'id' in office ? { id: office.id } : { code: office.code },
    select: {
      id: true,
      autoClear: true,
      isActive: true,
      deadlines: { where: { academicYearId: term.academicYearId, term: term.term }, select: { dueAt: true } },
    },
  });
  const due = row?.deadlines[0]?.dueAt;
  if (!row?.autoClear || !row.isActive || !due || due.getTime() <= Date.now()) return null;
  return { dueAt: due.toISOString(), count: await autoClearCount(db, row.id, term) };
}

/* ---------- The morning email ---------- */

export type OfficeDigest = { officeId: number; officeName: string; to: string[]; email: DigestEmail };

/** One email per office that has the morning email on and something waiting. Sends nothing. */
export async function buildOfficeDigests(ct: CurrentTerm, now: Date, tx: Db = db): Promise<OfficeDigest[]> {
  const offices = await tx.office.findMany({
    where: { isActive: true, dailyDigest: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      contactEmail: true,
      autoClear: true,
      staff: { where: { user: { isActive: true, role: 'staff' } }, select: { user: { select: { email: true } } } },
      deadlines: { where: { academicYearId: ct.academicYearId, term: ct.term }, select: { dueAt: true } },
    },
  });

  const appUrl = env().APP_URL.replace(/\/+$/, '');
  const out: OfficeDigest[] = [];
  for (const o of offices) {
    const [uploads, messages] = await Promise.all([
      tx.submission.aggregate({
        where: { status: 'submitted', item: { officeId: o.id, clearance: { academicYearId: ct.academicYearId, term: ct.term } } },
        _count: { _all: true },
        _min: { submittedAt: true },
      }),
      // Same count as the Messages badge in the staff shell.
      tx.officeMessage.count({ where: { readAt: null, senderRole: 'student', item: { officeId: o.id } } }),
    ]);
    const due = o.deadlines[0]?.dueAt ?? null;
    const autoClear =
      o.autoClear && due && shouldWarnAutoClear(due, now) ? { count: await autoClearCount(tx, o.id, ct), dueAt: due } : null;

    const email = officeDigestEmail({
      officeName: o.name,
      termText: termText(ct),
      appUrl,
      now,
      uploads: uploads._count._all,
      oldestUploadAt: uploads._min.submittedAt,
      messages,
      autoClear,
    });
    if (!email) continue;
    // An office without an active staff account gets it at its contact address.
    const staff = [...new Set(o.staff.map((s) => s.user.email))];
    out.push({ officeId: o.id, officeName: o.name, to: staff.length ? staff : [o.contactEmail], email });
  }
  return out;
}

/**
 * Claims today's morning email run: one conditional upsert on job_state('digest'), so only one tick a day wins.
 * Returns false when today's run already happened (or before 8:00 AM, yesterday's).
 */
export async function claimDigestRun(tx: Db, now: Date): Promise<boolean> {
  const last = await tx.jobState.findUnique({ where: { name: 'digest' } });
  if (!isDigestDue(last?.lastRunAt ?? null, now)) return false;
  const claimed = await tx.$executeRaw`
    INSERT INTO job_state (name, last_run_at) VALUES ('digest', ${now})
    ON CONFLICT (name) DO UPDATE SET last_run_at = EXCLUDED.last_run_at
     WHERE job_state.last_run_at < ${digestWindowStart(now)}`;
  return claimed === 1;
}

/** Sends the morning emails once a day, from 8:00 AM Manila. Returns how many emails went out. */
export async function sendOfficeDigests(ct: CurrentTerm, now: Date): Promise<number> {
  if (!(await claimDigestRun(db, now))) return 0;

  let sent = 0;
  for (const d of await buildOfficeDigests(ct, now)) {
    for (const to of d.to) {
      if (await sendOfficeDigest(to, d.email)) sent += 1;
    }
  }
  return sent;
}
