// Rules and wording for the office automation: Approve selected, clearing students automatically at an office
// deadline, and the morning email to office staff. Pure and client-safe; the queries live in
// lib/services/officeAutomation.ts and the scheduler.
import { formatWeekdayDate, manilaYmd, prettyDue } from '@/lib/time';

/** An office with auto-clear on is warned once its deadline is this close (a daily cron still gives a day's notice). */
export const AUTO_CLEAR_WARN_HOURS = 48;

/** The morning email goes out once a day, from this hour in Manila (00:00 UTC, when the Vercel cron runs). */
export const DIGEST_HOUR = 8;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** True from AUTO_CLEAR_WARN_HOURS before the deadline until it passes. */
export function shouldWarnAutoClear(dueAt: Date, now: Date): boolean {
  const left = dueAt.getTime() - now.getTime();
  return left > 0 && left <= AUTO_CLEAR_WARN_HOURS * HOUR;
}

/** The most recent 8:00 AM in Manila at or before `now`. */
export function digestWindowStart(now: Date): Date {
  const today = new Date(`${manilaYmd(now)}T${String(DIGEST_HOUR).padStart(2, '0')}:00:00+08:00`);
  return today.getTime() <= now.getTime() ? today : new Date(today.getTime() - DAY);
}

/** The morning email is due when it hasn't gone out since the start of today's window. */
export function isDigestDue(lastRunAt: Date | null, now: Date): boolean {
  return lastRunAt === null || lastRunAt.getTime() < digestWindowStart(now).getTime();
}

export type ApprovalHow = 'bulk' | 'auto';

/** What the student and the item history show for an approval without an upload. */
export function approvalText(office: string, how: ApprovalHow) {
  return {
    remarks: how === 'bulk' ? 'Cleared by the office' : 'Cleared at the office deadline',
    description: `${office} has cleared your account.`,
    /** Replaces the default "Awaiting office review" headline; a real requirement keeps its own. */
    clearedTask: 'No issues, cleared',
    note: how === 'bulk' ? 'Approved with Approve selected on Clearance status' : 'Cleared automatically when the office deadline passed',
  };
}

/** The bell notification an office gets before its deadline clears students automatically. */
export function autoClearWarning(office: string, students: number, dueAt: Date) {
  return {
    title: `${office} will clear ${count(students, 'student')} automatically`,
    body:
      `When the deadline passes (${prettyDue(dueAt)}), students still Pending with no upload waiting, ` +
      `whom your office hasn't updated, are cleared. To hold a student, mark them Needs action.`,
  };
}

/** The "deadline passed" notice, saying how many were cleared automatically when auto-clear ran. */
export function deadlinePassedNotice(office: string, left: number, cleared: number) {
  const auto = cleared ? `${count(cleared, 'student')} ${cleared === 1 ? 'was' : 'were'} cleared automatically. ` : '';
  let body: string;
  if (!left) body = cleared ? `${auto}Every student is cleared now.` : 'Every student was cleared in time.';
  else body = `${auto}${count(left, 'student')} ${left === 1 ? 'is' : 'are'} not cleared yet. Send them a reminder from Deadlines.`;
  return { tone: left ? ('needs_action' as const) : ('approved' as const), title: `${office} deadline passed`, body };
}

/* ---------- The morning email ---------- */

export type DigestInput = {
  officeName: string;
  /** "1st Semester, A.Y 2026 - 2027" */
  termText: string;
  /** The app's address without a trailing slash, e.g. "https://cleargate.example.edu". */
  appUrl: string;
  now: Date;
  /** Uploads waiting for review this term, and when the oldest came in. */
  uploads: number;
  oldestUploadAt: Date | null;
  /** Student messages nobody at the office has opened. */
  messages: number;
  /** Set when auto-clear runs within AUTO_CLEAR_WARN_HOURS: how many students it would clear, and when. */
  autoClear: { count: number; dueAt: Date } | null;
};

export type DigestEmail = { subject: string; text: string; html: string };

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Whole Manila calendar days between two moments ("today" is 0). */
const daysBetween = (from: Date, to: Date) => Math.round((Date.parse(manilaYmd(to)) - Date.parse(manilaYmd(from))) / DAY);

/** The office's morning email, or null when nothing is waiting. */
export function officeDigestEmail(d: DigestInput): DigestEmail | null {
  type Line = { summary: string; detail: string; linkText: string; path: string };
  const lines: Line[] = [];
  const subject: string[] = [];

  if (d.uploads > 0) {
    const days = d.oldestUploadAt ? daysBetween(d.oldestUploadAt, d.now) : 0;
    const who = d.uploads === 1 ? 'It' : 'The oldest';
    const wait = days <= 0 ? `${who} arrived today.` : `${who} has waited ${count(days, 'day')}.`;
    subject.push(`${count(d.uploads, 'upload')} to review`);
    const linkText = d.uploads === 1 ? 'Review it' : 'Review them';
    lines.push({ summary: `${count(d.uploads, 'upload')} to review.`, detail: wait, linkText, path: '/staff' });
  }
  if (d.messages > 0) {
    subject.push(count(d.messages, 'unread message'));
    const linkText = d.messages === 1 ? 'Read it' : 'Read them';
    lines.push({ summary: `${count(d.messages, 'unread message')} from students.`, detail: '', linkText, path: '/messages' });
  }
  if (d.autoClear && d.autoClear.count > 0) {
    const n = count(d.autoClear.count, 'student');
    subject.push(`${n} clear automatically on ${formatWeekdayDate(d.autoClear.dueAt)}`);
    lines.push({
      summary: `${n} will be cleared automatically when your deadline passes on ${prettyDue(d.autoClear.dueAt)}.`,
      detail: 'To hold a student, mark them Needs action before then.',
      linkText: 'Clearance status',
      path: '/office-status',
    });
  }
  if (!lines.length) return null;

  // Office names come with and without "Office" ("Accounting", "Dean's Office"), so no article before them.
  const intro = `Here is what is waiting for your office in ClearGate (${d.officeName}, ${d.termText}):`;
  const outro = `You get this email because the morning email is on for ${d.officeName} in ClearGate. An administrator can turn it off in Settings.`;
  const url = (path: string) => `${d.appUrl}${path}`;

  const text = [
    intro,
    '',
    ...lines.flatMap((l) => [`- ${[l.summary, l.detail].filter(Boolean).join(' ')}`, `  ${l.linkText}: ${url(l.path)}`, '']),
    outro,
  ].join('\n');

  const html =
    `<p>${escapeHtml(intro)}</p>\n<ul>\n` +
    lines
      .map(
        (l) =>
          `<li style="margin-bottom:12px"><strong>${escapeHtml(l.summary)}</strong>${l.detail ? ` ${escapeHtml(l.detail)}` : ''}` +
          `<br><a href="${escapeHtml(url(l.path))}">${escapeHtml(l.linkText)}</a></li>`,
      )
      .join('\n') +
    `\n</ul>\n<p style="color:#5d6168">${escapeHtml(outro)}</p>`;

  return { subject: `${d.officeName}: ${subject.join(', ')}`, text, html };
}
