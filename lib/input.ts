// Input readers that match the legacy PHP helpers: trim, then cut to the column length.
import { PATTERNS } from '@/lib/constants';

const chars = (s: string, max: number) => Array.from(s).slice(0, max).join('');

/** Trimmed string cut to `max` characters; '' for anything that isn't a string. */
export function str(v: unknown, max: number): string {
  return typeof v === 'string' ? chars(v.trim(), max) : typeof v === 'number' ? chars(String(v), max) : '';
}

/** Like str(), but collapses runs of whitespace (application form fields). */
export function clean(v: unknown, max: number): string {
  return typeof v === 'string' ? chars(v.trim().replace(/\s+/g, ' '), max) : '';
}

/** Trimmed string, or null when empty. */
export function optStr(v: unknown, max: number): string | null {
  const s = str(v, max);
  return s === '' ? null : s;
}

/** Positive integer or null. */
export function posInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

export function int(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isSafeInteger(n) ? n : null;
}

export function bool(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
}

export function oneOf<T extends string>(v: unknown, list: readonly T[]): T | null {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null;
}

export function isEmail(v: string): boolean {
  return v.length <= 190 && PATTERNS.email.test(v);
}

/** Cuts to `max` characters (not bytes). */
export const cut = chars;

/** FormData → plain object (last value wins; files are dropped). */
export function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  fd.forEach((value, key) => {
    if (typeof value === 'string') out[key] = value;
  });
  return out;
}
