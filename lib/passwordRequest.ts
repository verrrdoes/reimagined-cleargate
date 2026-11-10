// Password requests the Registrar approves: the rules shared by the server and the student page. Client-safe.

export type PasswordRequestStatusName = 'pending' | 'approved' | 'declined' | 'used' | 'cancelled' | 'withdrawn';

/** What the student page shows: waiting for the Registrar, allowed to set a password, or closed for any other reason. */
export type RequestState = 'waiting' | 'allowed' | 'closed';

/** No look-alikes (O, 0, I, 1): the student reads the code out at the desk. */
export const REQUEST_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const REQUEST_CODE_LENGTH = 6;

/** Every ending other than success reads the same, so it never tells whether the account exists. */
export const PASSWORD_REQUEST_CLOSED = 'This request is closed. If you still need a new password, ask again.';

/** A student ID or school email as typed: trimmed, lowercased, cut to 190 characters. */
export function normalizeLogin(v: unknown): string {
  return typeof v === 'string' ? Array.from(v.trim().toLowerCase()).slice(0, 190).join('') : '';
}

/** "K7P4QX" → "K7P 4QX" */
export const formatRequestCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

const TOKEN = /^([0-9a-z]{1,11})\.[0-9a-f]{64}$/;

/**
 * The device secret is `<expiry in ms, base 36>.<64 hex>`. It carries its own expiry so the status check can
 * answer for a request that was never stored (an unknown student ID) exactly as it would for a real one.
 */
export function parseRequestToken(v: unknown): { token: string; expiresAt: Date } | null {
  if (typeof v !== 'string') return null;
  const m = TOKEN.exec(v);
  if (!m) return null;
  const ms = parseInt(m[1], 36);
  if (!Number.isFinite(ms)) return null;
  return { token: v, expiresAt: new Date(ms) };
}

export function requestState(
  r: { status: PasswordRequestStatusName; expiresAt: Date; approvedUntil: Date | null },
  now: Date,
): RequestState {
  if (r.status === 'pending' && r.expiresAt > now) return 'waiting';
  if (r.status === 'approved' && r.approvedUntil && r.approvedUntil > now) return 'allowed';
  return 'closed';
}
