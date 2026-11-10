import { describe, expect, it } from 'vitest';
import { formatRequestCode, normalizeLogin, parseRequestToken, requestState, REQUEST_CODE_ALPHABET } from '@/lib/passwordRequest';
import { requestCode, requestToken } from '@/lib/ids';
import { LIMITS } from '@/lib/constants';

const now = new Date('2026-10-25T02:00:00Z');
const later = (min: number) => new Date(now.getTime() + min * 60_000);

describe('normalizeLogin', () => {
  it('trims and lowercases', () => {
    expect(normalizeLogin('  2026-00042 ')).toBe('2026-00042');
    expect(normalizeLogin('SantosMaria@CGATEWAY.edu.ph')).toBe('santosmaria@cgateway.edu.ph');
  });
  it('rejects non-strings and cuts to 190', () => {
    expect(normalizeLogin(42)).toBe('');
    expect(normalizeLogin(null)).toBe('');
    expect(Array.from(normalizeLogin('a'.repeat(300)))).toHaveLength(190);
  });
});

describe('formatRequestCode', () => {
  it('splits into two groups of three', () => expect(formatRequestCode('K7P4QX')).toBe('K7P 4QX'));
});

describe('requestCode', () => {
  it('is 6 characters from the alphabet, no look-alikes', () => {
    for (let i = 0; i < 200; i++) {
      const c = requestCode();
      expect(c).toMatch(/^[A-Z2-9]{6}$/);
      for (const ch of c) expect(REQUEST_CODE_ALPHABET).toContain(ch);
      expect(c).not.toMatch(/[O0I1]/);
    }
  });
});

describe('requestToken / parseRequestToken', () => {
  it('round-trips the expiry and the full token', () => {
    const expiresAt = later(24 * 60);
    const token = requestToken(expiresAt);
    expect(token).toMatch(/^[0-9a-z]+\.[0-9a-f]{64}$/);
    expect(parseRequestToken(token)).toEqual({ token, expiresAt });
  });
  it('makes a different secret each time', () => {
    expect(requestToken(now)).not.toBe(requestToken(now));
  });
  it('rejects malformed tokens', () => {
    for (const bad of [null, 42, '', 'garbage', 'abc.123', `zz.${'g'.repeat(64)}`, `.${'a'.repeat(64)}`, `${'z'.repeat(12)}.${'a'.repeat(64)}`]) {
      expect(parseRequestToken(bad)).toBeNull();
    }
  });
});

describe('requestState', () => {
  const base = { expiresAt: later(60), approvedUntil: null };
  it('pending before expiry is waiting; after, closed', () => {
    expect(requestState({ ...base, status: 'pending' }, now)).toBe('waiting');
    expect(requestState({ ...base, status: 'pending', expiresAt: later(-1) }, now)).toBe('closed');
  });
  it('approved inside the window is allowed; after, closed', () => {
    expect(requestState({ ...base, status: 'approved', approvedUntil: later(5) }, now)).toBe('allowed');
    expect(requestState({ ...base, status: 'approved', approvedUntil: later(-1) }, now)).toBe('closed');
  });
  it('every other status is closed', () => {
    for (const status of ['declined', 'used', 'cancelled', 'withdrawn'] as const) {
      expect(requestState({ ...base, status }, now)).toBe('closed');
    }
  });
});

describe('request limits', () => {
  // Students ask on campus Wi-Fi, often in the Registrar's queue, behind one public address; the per-ID limit and
  // unknown IDs saving nothing already keep the staff list short.
  it('let one campus address ask at least 50 times in 15 minutes', () => {
    expect(LIMITS.passwordRequestsPerIp).toBeGreaterThanOrEqual(50);
  });
});
