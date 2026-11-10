// Deadline badges and countdowns (HANDOFF §10.5). Client-safe.
import { formatWeekdayDate, prettyDue } from '@/lib/time';
import type { ItemStatus } from '@/lib/types';

/** "45 min", "5 hrs 20 min", "2 days" */
export function spanText(ms: number): string {
  const min = Math.max(1, Math.round(Math.abs(ms) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) {
    const rest = min - h * 60;
    return `${h} ${h === 1 ? 'hr' : 'hrs'}${h < 6 && rest ? ` ${rest} min` : ''}`;
  }
  // Whole days, rounded down, so the badge agrees with the countdown beside it (2 days 16 hours reads
  // "2 days"; legacy rounded to "3 days").
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'}`;
}

export type DueTone = 'muted' | 'overdue' | 'action' | 'pending' | 'info';

export function dueState(due: string | Date, status: ItemStatus, now: number): { tone: DueTone; text: string } {
  const at = new Date(due).getTime();
  if (status === 'approved') return { tone: 'muted', text: `Cleared before ${formatWeekdayDate(due)}` };
  const left = at - now;
  if (left < 0) return { tone: 'overdue', text: `Overdue by ${spanText(left)}` };
  if (left < 86_400_000) return { tone: 'action', text: `Due in ${spanText(left)}` };
  if (left < 3 * 86_400_000) return { tone: 'pending', text: `Due in ${spanText(left)}` };
  return { tone: 'info', text: `${spanText(left)} left` };
}

export const dueLine = (due: string | Date) => `Due ${prettyDue(due)}`;

/** Days, hours, minutes and seconds left (never negative). */
export function countdownParts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}
