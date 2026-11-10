// Manila time helpers. Safe on the server and in the browser: every format names its time zone,
// so the server render and the client render print the same text.

export const TIME_ZONE = 'Asia/Manila';
const LOCALE = 'en-US';

type DateLike = Date | string | number;
const toDate = (v: DateLike) => (v instanceof Date ? v : new Date(v));

const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(v: DateLike, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const key = JSON.stringify(opts);
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, ...opts });
    formatters.set(key, f);
  }
  const out: Record<string, string> = {};
  for (const p of f.formatToParts(toDate(v))) out[p.type] = p.value;
  return out;
}

const clock = (p: Record<string, string>) => `${p.hour}:${p.minute} ${p.dayPeriod}`;

/** "Mon, Oct 26, 5:00 PM" (legacy prettyDue). */
export function prettyDue(v: DateLike): string {
  const p = parts(v, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  return `${p.weekday}, ${p.month} ${p.day}, ${clock(p)}`;
}

/** "Oct 26, 2026, 5:00 PM" */
export function formatDateTime(v: DateLike): string {
  const p = parts(v, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  return `${p.month} ${p.day}, ${p.year}, ${clock(p)}`;
}

/** "Oct 26, 2026" */
export function formatDate(v: DateLike): string {
  const p = parts(v, { year: 'numeric', month: 'short', day: 'numeric' });
  return `${p.month} ${p.day}, ${p.year}`;
}

/** "Mon, Oct 26" */
export function formatWeekdayDate(v: DateLike): string {
  const p = parts(v, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${p.weekday}, ${p.month} ${p.day}`;
}

/** "5:00 PM" */
export function formatTime(v: DateLike): string {
  return clock(parts(v, { hour: 'numeric', minute: '2-digit', hour12: true }));
}

/** "2026-10-26" (the Manila calendar day). */
export function manilaYmd(v: DateLike = new Date()): string {
  const p = parts(v, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}

export function manilaYear(v: DateLike = new Date()): number {
  return Number(parts(v, { year: 'numeric' }).year);
}

/** Value for an <input type="datetime-local">: "2026-10-26T17:00" in Manila time. */
export function toLocalInputValue(v: DateLike): string {
  const p = parts(v, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

/** Reads a datetime-local value as Manila time. Returns null when it isn't a real date and time. */
export function parseLocalDateTime(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec((value ?? '').trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}+08:00`);
  if (Number.isNaN(d.getTime())) return null;
  // Reject rollovers such as Feb 30.
  return toLocalInputValue(d) === `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` ? d : null;
}

/** Reads "YYYY-MM-DD" as a calendar date; null when invalid. */
export function parseYmd(value: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
  if (!m) return null;
  const d = new Date(`${m[0]}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== m[0]) return null;
  return m[0];
}

/** Midnight at the start of a Manila calendar day. */
export function manilaDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+08:00`);
}

/** Adds whole days to a "YYYY-MM-DD" string. */
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Just now", "5 min ago", "3 hr ago", "Yesterday", "Oct 26" (relative to `now`). */
export function timeAgo(v: DateLike, now: DateLike = new Date()): string {
  const ms = toDate(now).getTime() - toDate(v).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const today = manilaYmd(now);
  const day = manilaYmd(v);
  if (day === today) return `${Math.floor(min / 60)} hr ago`;
  if (day === addDays(today, -1)) return 'Yesterday';
  const p = parts(v, { month: 'short', day: 'numeric', year: 'numeric' });
  return p.year === String(manilaYear(now)) ? `${p.month} ${p.day}` : `${p.month} ${p.day}, ${p.year}`;
}
