// Display helpers for the admin pages. Client-safe.
import { manilaYmd } from '@/lib/time';

/** "1st year", "2nd year", "3rd year", "4th year" */
export function yearLabel(level: number): string {
  const suffix = level % 100 >= 11 && level % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[level % 10] ?? 'th';
  return `${level}${suffix} year`;
}

/** An average review time: "25 min", "3.5 hrs", "4 days". */
export function hoursText(hours: number | null): string {
  if (hours === null) return '\u2014';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1)} hrs`;
  return `${Math.round(hours / 24)} days`;
}

/** Whole Manila calendar days from `since` to `now`. */
export function daysSince(since: Date, now: Date): number {
  const a = Date.parse(`${manilaYmd(since)}T00:00:00Z`);
  const b = Date.parse(`${manilaYmd(now)}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** How long the oldest upload has waited: "Today", "1 day", "6 days". */
export function ageText(since: Date | null, now: Date): string {
  if (!since) return '\u2014';
  const days = daysSince(since, now);
  if (days === 0) return 'Today';
  return days === 1 ? '1 day' : `${days} days`;
}

/** Whole percent of a part, or null without a total. */
export function percentOf(part: number, total: number): number | null {
  return total > 0 ? Math.round((100 * part) / total) : null;
}

/** 1234 → "1,234" */
export const count = (n: number) => n.toLocaleString('en-US');

/** "1 office" / "3 offices" (with thousands separators). */
export const plural = (n: number, word: string, many = `${word}s`) => `${count(n)} ${n === 1 ? word : many}`;
