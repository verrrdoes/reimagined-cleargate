import { parseRequestToken, REQUEST_CODE_LENGTH } from '@/lib/passwordRequest';

// The password request this device made, kept in localStorage so Forgot password picks it up again.
// Read as a string so useSyncExternalStore compares snapshots by value.

export const SAVED_REQUEST_KEY = 'cg_password_request';

export type SavedRequest = { token: string; code: string; login: string; expiresAt: string };

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function subscribeSavedRequest(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function parseSavedRequest(raw: string): SavedRequest | null {
  try {
    const v = JSON.parse(raw) as Partial<SavedRequest> | null;
    if (
      v &&
      parseRequestToken(v.token) &&
      typeof v.code === 'string' &&
      v.code.length === REQUEST_CODE_LENGTH &&
      typeof v.login === 'string' &&
      v.login !== '' &&
      typeof v.expiresAt === 'string' &&
      Number.isFinite(Date.parse(v.expiresAt))
    ) {
      return { token: v.token as string, code: v.code, login: v.login, expiresAt: v.expiresAt };
    }
  } catch {
    // A damaged entry is treated as none.
  }
  return null;
}

/** The saved request, or '' for none. A damaged entry is removed here, so every read agrees. */
export function readSavedRequest(): string {
  try {
    const raw = localStorage.getItem(SAVED_REQUEST_KEY) ?? '';
    if (raw && !parseSavedRequest(raw)) {
      localStorage.removeItem(SAVED_REQUEST_KEY);
      return '';
    }
    return raw;
  } catch {
    return '';
  }
}

/** False when storage is blocked; the caller then keeps the request in memory. */
export function saveRequest(saved: SavedRequest): boolean {
  try {
    localStorage.setItem(SAVED_REQUEST_KEY, JSON.stringify(saved));
  } catch {
    return false;
  }
  notify();
  return true;
}

/** `quiet` when the page is leaving anyway, so the ask form doesn't flash before the next page. */
export function forgetSavedRequest({ quiet = false }: { quiet?: boolean } = {}) {
  try {
    localStorage.removeItem(SAVED_REQUEST_KEY);
  } catch {
    // Storage is blocked; nothing was saved.
  }
  if (!quiet) notify();
}
