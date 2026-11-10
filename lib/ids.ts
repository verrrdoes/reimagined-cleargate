import 'server-only';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { SCHOOL_DOMAIN } from '@/lib/constants';
import { REQUEST_CODE_ALPHABET, REQUEST_CODE_LENGTH } from '@/lib/passwordRequest';

export const randomHex = (bytes: number) => randomBytes(bytes).toString('hex');
export const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** 10 characters with no look-alikes (0, O, 1, l, I). */
export function tempPassword(length = 10): string {
  let out = '';
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return out;
}

/** The short code a student shows at the Registrar's desk, e.g. "K7P4QX". */
export function requestCode(): string {
  let out = '';
  for (let i = 0; i < REQUEST_CODE_LENGTH; i++) out += REQUEST_CODE_ALPHABET[randomInt(REQUEST_CODE_ALPHABET.length)];
  return out;
}

/** The device secret of a password request: its expiry (ms, base 36), a dot, then 32 random bytes as hex. */
export const requestToken = (expiresAt: Date) => `${expiresAt.getTime().toString(36)}.${randomHex(32)}`;

/** ñ → n, accents dropped, then only a–z. */
export function asciiSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

export const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** APP-2026-0001 */
export const applicationReference = (id: number, year: number) => `APP-${year}-${pad(id, 4)}`;

/** LIB-2026-0007: first three letters of the office code. */
export const submissionReference = (officeCode: string, id: number, year: number) =>
  `${officeCode.slice(0, 3).toUpperCase()}-${year}-${pad(id, 4)}`;

/** The base of a student's school email; the caller adds 2, 3, … when it's taken. */
export function schoolEmailBase(lastName: string, firstName: string): string {
  return asciiSlug(lastName) + asciiSlug(firstName) || 'student';
}
export const schoolEmail = (base: string, n: number) => `${base}${n > 1 ? n : ''}@${SCHOOL_DOMAIN}`;
