import { describe, expect, it } from 'vitest';
import {
  AUTO_CLEAR_WARN_HOURS,
  approvalText,
  autoClearWarning,
  deadlinePassedNotice,
  digestWindowStart,
  isDigestDue,
  officeDigestEmail,
  shouldWarnAutoClear,
  type DigestInput,
} from '@/lib/officeAutomation';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Mon, Nov 9 2026, 9:00 AM in Manila.
const now = new Date('2026-11-09T01:00:00Z');
const at = (ms: number) => new Date(now.getTime() + ms);

describe('shouldWarnAutoClear', () => {
  it('warns once the deadline is two days away or less, and only before it passes', () => {
    expect(AUTO_CLEAR_WARN_HOURS).toBe(48);
    expect(shouldWarnAutoClear(at(47 * HOUR), now)).toBe(true);
    expect(shouldWarnAutoClear(at(48 * HOUR), now)).toBe(true);
    expect(shouldWarnAutoClear(at(49 * HOUR), now)).toBe(false);
    expect(shouldWarnAutoClear(at(-1), now)).toBe(false);
    expect(shouldWarnAutoClear(now, now)).toBe(false);
  });
});

describe('digestWindowStart / isDigestDue', () => {
  it('starts each day at 8:00 AM Manila', () => {
    expect(digestWindowStart(now).toISOString()).toBe('2026-11-09T00:00:00.000Z');
    // 7:59 AM in Manila still belongs to yesterday's window.
    expect(digestWindowStart(new Date('2026-11-08T23:59:00Z')).toISOString()).toBe('2026-11-08T00:00:00.000Z');
    expect(digestWindowStart(new Date('2026-11-09T00:00:00Z')).toISOString()).toBe('2026-11-09T00:00:00.000Z');
  });

  it('is due when nothing went out since this morning at 8', () => {
    expect(isDigestDue(null, now)).toBe(true);
    expect(isDigestDue(new Date('2026-11-08T00:05:00Z'), now)).toBe(true); // yesterday 8:05 AM
    expect(isDigestDue(new Date('2026-11-08T23:00:00Z'), now)).toBe(true); // today 7:00 AM, before the window
    expect(isDigestDue(new Date('2026-11-09T00:01:00Z'), now)).toBe(false); // today 8:01 AM
  });
});

describe('approvalText', () => {
  it('tells the student the office cleared them and records how', () => {
    const bulk = approvalText('Library', 'bulk');
    const auto = approvalText('Library', 'auto');
    expect(bulk.description).toBe('Library has cleared your account.');
    expect(auto.description).toBe('Library has cleared your account.');
    expect(bulk.note).toMatch(/Approve selected/);
    expect(auto.note).toMatch(/automatically/);
    expect(auto.remarks).not.toBe(bulk.remarks);
    // Replaces the "Awaiting office review" placeholder, so an approved row never says it's still waiting.
    expect(bulk.clearedTask).toBe('No issues, cleared');
    expect(auto.clearedTask).toBe('No issues, cleared');
    for (const t of [bulk, auto]) {
      expect(t.remarks.length).toBeLessThanOrEqual(120);
      expect(t.note.length).toBeLessThanOrEqual(255);
    }
  });
});

describe('autoClearWarning', () => {
  it('names the office, how many students and when, and how to hold someone', () => {
    const w = autoClearWarning("Dean's Office", 15, new Date('2026-11-13T09:00:00Z'));
    expect(w.title).toBe("Dean's Office will clear 15 students automatically");
    expect(w.body).toContain('Fri, Nov 13, 5:00 PM');
    expect(w.body).toContain('Needs action');
    expect(w.body.length).toBeLessThanOrEqual(255);
    expect(autoClearWarning('Guidance Office', 1, now).title).toBe('Guidance Office will clear 1 student automatically');
  });
});

describe('deadlinePassedNotice', () => {
  it('keeps the old wording when nothing was cleared automatically', () => {
    expect(deadlinePassedNotice('Library', 3, 0)).toEqual({
      tone: 'needs_action',
      title: 'Library deadline passed',
      body: '3 students are not cleared yet. Send them a reminder from Deadlines.',
    });
    expect(deadlinePassedNotice('Library', 0, 0)).toEqual({
      tone: 'approved',
      title: 'Library deadline passed',
      body: 'Every student was cleared in time.',
    });
  });

  it('says how many were cleared automatically and who is left', () => {
    const some = deadlinePassedNotice('Guidance Office', 1, 14);
    expect(some.tone).toBe('needs_action');
    expect(some.body).toBe('14 students were cleared automatically. 1 student is not cleared yet. Send them a reminder from Deadlines.');
    const all = deadlinePassedNotice('Guidance Office', 0, 1);
    expect(all.tone).toBe('approved');
    expect(all.body).toBe('1 student was cleared automatically. Every student is cleared now.');
  });
});

describe('officeDigestEmail', () => {
  const base: DigestInput = {
    officeName: 'Guidance Office',
    termText: '1st Semester, A.Y 2026 - 2027',
    appUrl: 'https://cleargate.example.edu',
    now,
    uploads: 0,
    oldestUploadAt: null,
    messages: 0,
    autoClear: null,
  };

  it('sends nothing when nothing is waiting', () => {
    expect(officeDigestEmail(base)).toBeNull();
    expect(officeDigestEmail({ ...base, autoClear: { count: 0, dueAt: at(DAY) } })).toBeNull();
  });

  it('lists uploads to review with the oldest wait and a link', () => {
    const e = officeDigestEmail({ ...base, uploads: 2, oldestUploadAt: at(-9 * DAY - HOUR) })!;
    expect(e.subject).toBe('Guidance Office: 2 uploads to review');
    expect(e.text).toContain('2 uploads to review. The oldest has waited 9 days.');
    expect(e.text).toContain('https://cleargate.example.edu/staff');
    expect(e.text).toContain('1st Semester, A.Y 2026 - 2027');
    expect(e.html).toContain('href="https://cleargate.example.edu/staff"');
    expect(e.text).toContain('Review them: https://cleargate.example.edu/staff');
    const one = officeDigestEmail({ ...base, uploads: 1, oldestUploadAt: at(-HOUR) })!;
    expect(one.text).toContain('1 upload to review. It arrived today.');
    expect(one.text).toContain('Review it: https://cleargate.example.edu/staff');
  });

  it('reads well for office names with or without "Office" in them', () => {
    const e = officeDigestEmail({ ...base, officeName: 'Accounting', uploads: 5, oldestUploadAt: at(-DAY) })!;
    expect(e.text).toContain('Here is what is waiting for your office in ClearGate (Accounting, 1st Semester, A.Y 2026 - 2027):');
    expect(e.text).toContain('the morning email is on for Accounting');
    expect(e.text).not.toContain('the Accounting');
  });

  it('adds unread messages and an upcoming auto-clear', () => {
    const e = officeDigestEmail({
      ...base,
      messages: 3,
      autoClear: { count: 14, dueAt: new Date('2026-11-13T09:00:00Z') },
    })!;
    expect(e.subject).toBe('Guidance Office: 3 unread messages, 14 students clear automatically on Fri, Nov 13');
    expect(e.text).toContain('3 unread messages from students.');
    expect(e.text).toContain('https://cleargate.example.edu/messages');
    expect(e.text).toContain('14 students will be cleared automatically when your deadline passes on Fri, Nov 13, 5:00 PM.');
    expect(e.text).toContain('https://cleargate.example.edu/office-status');
  });

  it('escapes the office name in the HTML', () => {
    const e = officeDigestEmail({ ...base, officeName: 'R&D <Office>', messages: 1 })!;
    expect(e.html).toContain('R&amp;D &lt;Office&gt;');
    expect(e.html).not.toContain('<Office>');
    expect(e.text).toContain('1 unread message from students.');
  });
});
