import { describe, expect, it } from 'vitest';
import {
  activityLine,
  bucketOf,
  countBuckets,
  daysSince,
  deadlineState,
  recentActivity,
  waitedText,
  type ActivityEvent,
} from '@/lib/officeOverview';

// Tue, Nov 10 2026, 10:58 AM in Manila.
const now = new Date('2026-11-10T02:58:00Z');

describe('bucketOf', () => {
  it("sorts each item by whose move it is", () => {
    expect(bucketOf({ status: 'approved', hasUpload: false })).toBe('cleared');
    expect(bucketOf({ status: 'pending', hasUpload: true })).toBe('waiting');
    expect(bucketOf({ status: 'pending', hasUpload: false })).toBe('unreviewed');
    expect(bucketOf({ status: 'needs_action', hasUpload: false })).toBe('student');
  });

  it('puts an upload waiting for review with the office even if the item still says Needs action', () => {
    expect(bucketOf({ status: 'needs_action', hasUpload: true })).toBe('waiting');
  });

  it('keeps an approved item cleared even if a stray upload is still marked submitted', () => {
    expect(bucketOf({ status: 'approved', hasUpload: true })).toBe('cleared');
  });
});

describe('countBuckets', () => {
  it('counts every item once, so the groups add up to the total', () => {
    const items = [
      { status: 'approved' as const, hasUpload: false },
      { status: 'approved' as const, hasUpload: false },
      { status: 'pending' as const, hasUpload: true },
      { status: 'pending' as const, hasUpload: false },
      { status: 'needs_action' as const, hasUpload: false },
    ];
    const c = countBuckets(items);
    expect(c).toEqual({ waiting: 1, unreviewed: 1, student: 1, cleared: 2, total: 5, notCleared: 3 });
    expect(c.waiting + c.unreviewed + c.student + c.cleared).toBe(c.total);
  });

  it('handles an office with no students', () => {
    expect(countBuckets([])).toEqual({ waiting: 0, unreviewed: 0, student: 0, cleared: 0, total: 0, notCleared: 0 });
  });
});

describe('daysSince / waitedText', () => {
  it('counts Manila calendar days, not 24-hour blocks', () => {
    // Nov 9, 11:30 PM Manila is "1 day" ago on Nov 10, though under 12 hours have passed.
    expect(daysSince(new Date('2026-11-09T15:30:00Z'), now)).toBe(1);
    // Nov 10, 12:10 AM Manila is today.
    expect(daysSince(new Date('2026-11-09T16:10:00Z'), now)).toBe(0);
    // Oct 23, 8:22 AM Manila.
    expect(daysSince(new Date('2026-10-23T00:22:38Z'), now)).toBe(18);
  });

  it('reads Today, 1 day, N days', () => {
    expect(waitedText(0)).toBe('Today');
    expect(waitedText(1)).toBe('1 day');
    expect(waitedText(18)).toBe('18 days');
  });
});

describe('deadlineState', () => {
  it('is null without a deadline', () => {
    expect(deadlineState(null, now)).toBeNull();
  });

  it('says how long ago a passed deadline was', () => {
    expect(deadlineState(new Date('2026-10-30T09:00:00Z'), now)).toEqual({ passed: true, text: '11 days ago' });
    expect(deadlineState(new Date('2026-11-09T09:00:00Z'), now)).toEqual({ passed: true, text: 'Yesterday' });
    expect(deadlineState(new Date('2026-11-10T01:00:00Z'), now)).toEqual({ passed: true, text: 'Earlier today' });
  });

  it('says how far away a coming deadline is', () => {
    expect(deadlineState(new Date('2026-11-10T09:00:00Z'), now)).toEqual({ passed: false, text: 'Today' });
    expect(deadlineState(new Date('2026-11-11T09:00:00Z'), now)).toEqual({ passed: false, text: 'Tomorrow' });
    expect(deadlineState(new Date('2026-11-20T09:00:00Z'), now)).toEqual({ passed: false, text: 'In 10 days' });
  });
});

const status = (over: Partial<Extract<ActivityEvent, { kind: 'status' }>>): ActivityEvent => ({
  kind: 'status',
  at: new Date('2026-10-25T09:22:58Z'),
  student: 'ARIEL TAPNIO',
  actor: 'Denver Loreto',
  actorRole: 'admin',
  to: 'approved',
  note: 'Approved submission LIB-2026-0042',
  ...over,
});

describe('activityLine', () => {
  it('describes an upload', () => {
    expect(
      activityLine({ kind: 'upload', at: now, student: 'ARVY BOLIVAR', file: 'IMG_1821.jpeg' }),
    ).toEqual({ who: 'ARVY BOLIVAR', what: 'uploaded IMG_1821.jpeg' });
  });

  it('describes approvals: reviewed, Approve selected, and the deadline auto-clear', () => {
    expect(activityLine(status({}))).toEqual({ who: 'Denver Loreto', what: 'cleared ARIEL TAPNIO' });
    expect(activityLine(status({ note: 'Approved with Approve selected on Clearance status' }))).toEqual({
      who: 'Denver Loreto',
      what: 'cleared ARIEL TAPNIO with Approve selected',
    });
    expect(
      activityLine(status({ actor: null, actorRole: null, note: 'Cleared automatically when the office deadline passed' })),
    ).toEqual({ who: 'ClearGate', what: 'cleared ARIEL TAPNIO at the deadline' });
  });

  it('describes a returned upload and a manual Needs action', () => {
    expect(activityLine(status({ to: 'needs_action', note: 'Returned submission LIB-2026-0042: Unreadable file' }))).toEqual({
      who: 'Denver Loreto',
      what: "returned ARIEL TAPNIO's upload",
    });
    expect(activityLine(status({ to: 'needs_action', note: null }))).toEqual({
      who: 'Denver Loreto',
      what: 'marked ARIEL TAPNIO Needs action',
    });
  });

  it('describes a move back to Pending', () => {
    expect(activityLine(status({ to: 'pending', note: null }))).toEqual({ who: 'Denver Loreto', what: 'set ARIEL TAPNIO back to Pending' });
  });

  it('names a deleted account "Someone"', () => {
    expect(activityLine(status({ actor: null, actorRole: null }))).toEqual({ who: 'Someone', what: 'cleared ARIEL TAPNIO' });
  });
});

describe('recentActivity', () => {
  const t = (iso: string) => new Date(iso);

  it('merges uploads and status changes newest first, drops student status logs, and keeps the limit', () => {
    const events: ActivityEvent[] = [
      { kind: 'upload', at: t('2026-10-24T20:22:38Z'), student: 'PATRICIA GONZALES', file: 'slip.pdf' },
      status({ at: t('2026-10-25T09:22:58Z') }),
      // The status log a student's upload writes duplicates the upload itself.
      status({ at: t('2026-10-25T09:20:22Z'), actor: 'ARIEL TAPNIO', actorRole: 'student', to: 'pending', note: 'Student uploaded evidence' }),
      { kind: 'upload', at: t('2026-10-25T09:20:22Z'), student: 'ARIEL TAPNIO', file: 'slip.pdf' },
      { kind: 'upload', at: t('2026-11-10T02:44:56Z'), student: 'ARVY BOLIVAR', file: 'IMG_1821.jpeg' },
    ];
    const out = recentActivity(events, 3);
    expect(out.map((e) => [e.who, e.what])).toEqual([
      ['ARVY BOLIVAR', 'uploaded IMG_1821.jpeg'],
      ['Denver Loreto', 'cleared ARIEL TAPNIO'],
      ['ARIEL TAPNIO', 'uploaded slip.pdf'],
    ]);
    expect(out[0].at).toBe('2026-11-10T02:44:56.000Z');
  });
});
