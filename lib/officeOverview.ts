// The rules behind the staff Dashboard (/overview): whose move each student is, day counts in Manila time,
// and the wording of the recent-activity lines. The queries are in lib/services/officeOverview.ts.
import { approvalText } from '@/lib/officeAutomation';
import { manilaYmd } from '@/lib/time';
import type { ItemStatus } from '@/lib/types';

/** Whose move it is: the office's (an upload to review), nobody's yet, the student's, or no one's (cleared). */
export type Bucket = 'waiting' | 'unreviewed' | 'student' | 'cleared';

export function bucketOf(item: { status: ItemStatus; hasUpload: boolean }): Bucket {
  if (item.status === 'approved') return 'cleared';
  if (item.hasUpload) return 'waiting';
  return item.status === 'needs_action' ? 'student' : 'unreviewed';
}

export type BucketCounts = Record<Bucket, number> & { total: number; notCleared: number };

export function countBuckets(items: { status: ItemStatus; hasUpload: boolean }[]): BucketCounts {
  const c: BucketCounts = { waiting: 0, unreviewed: 0, student: 0, cleared: 0, total: items.length, notCleared: 0 };
  for (const i of items) c[bucketOf(i)] += 1;
  c.notCleared = c.total - c.cleared;
  return c;
}

const DAY = 86_400_000;

/** Whole Manila calendar days from `from` to `now` (0 = the same day; negative when `from` is later). */
export function daysSince(from: Date, now: Date): number {
  return Math.round((Date.parse(manilaYmd(now)) - Date.parse(manilaYmd(from))) / DAY);
}

export const waitedText = (days: number) => (days <= 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`);

/** "11 days ago" / "Yesterday" / "Earlier today" once passed; "Today" / "Tomorrow" / "In 10 days" before. */
export function deadlineState(dueAt: Date | null, now: Date): { passed: boolean; text: string } | null {
  if (!dueAt) return null;
  if (dueAt.getTime() <= now.getTime()) {
    const d = daysSince(dueAt, now);
    return { passed: true, text: d <= 0 ? 'Earlier today' : d === 1 ? 'Yesterday' : `${d} days ago` };
  }
  const d = daysSince(now, dueAt);
  return { passed: false, text: d <= 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days` };
}

/* ---------- Recent activity ---------- */

export type ActivityEvent =
  | { kind: 'upload'; at: Date; student: string; file: string }
  | {
      kind: 'status';
      at: Date;
      student: string;
      /** The person who changed it, or null for ClearGate itself or a deleted account. */
      actor: string | null;
      actorRole: 'student' | 'staff' | 'admin' | null;
      to: ItemStatus;
      note: string | null;
    };

export type ActivityLine = { at: string; who: string; what: string };

const BULK_NOTE = approvalText('', 'bulk').note;
const AUTO_NOTE = approvalText('', 'auto').note;

export function activityLine(e: ActivityEvent): { who: string; what: string } {
  if (e.kind === 'upload') return { who: e.student, what: `uploaded ${e.file}` };
  if (e.note === AUTO_NOTE) return { who: 'ClearGate', what: `cleared ${e.student} at the deadline` };
  const who = e.actor ?? 'Someone';
  if (e.to === 'approved') return { who, what: e.note === BULK_NOTE ? `cleared ${e.student} with Approve selected` : `cleared ${e.student}` };
  if (e.to === 'needs_action') {
    return { who, what: e.note?.startsWith('Returned submission') ? `returned ${e.student}'s upload` : `marked ${e.student} Needs action` };
  }
  return { who, what: `set ${e.student} back to Pending` };
}

/**
 * The newest `limit` events, newest first. A student's own status change is left out:
 * it is the log their upload writes, and the upload is already listed.
 */
export function recentActivity(events: ActivityEvent[], limit: number): ActivityLine[] {
  return events
    .filter((e) => !(e.kind === 'status' && e.actorRole === 'student'))
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit)
    .map((e) => ({ at: e.at.toISOString(), ...activityLine(e) }));
}
