import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestToken, sha256Hex } from '@/lib/ids';

// setPasswordFromRequest is public and unthrottled, so a secret that matches no open approval must cost no bcrypt work.
// The database is a one-row fake: findUnique by secret hash, and the claim applies the same condition as the real update.

type Row = {
  id: number;
  userId: number;
  tokenHash: string;
  status: 'pending' | 'approved' | 'used';
  expiresAt: Date;
  approvedUntil: Date | null;
  usedAt: Date | null;
};

const store = vi.hoisted(() => ({ row: null as Row | null, passwordHash: '', sessionsDeleted: false }));

vi.mock('@/lib/env', () => ({ env: {}, isDemoMode: () => false }));
vi.mock('@/lib/db', () => {
  const tx = {
    passwordRequest: {
      updateMany: async ({ where, data }: { where: { id: number; status: string; approvedUntil: { gt: Date } }; data: Partial<Row> }) => {
        const r = store.row;
        if (!r || r.id !== where.id || r.status !== where.status || !r.approvedUntil || !(r.approvedUntil > where.approvedUntil.gt)) {
          return { count: 0 };
        }
        Object.assign(r, data);
        return { count: 1 };
      },
    },
    user: {
      update: async ({ data }: { data: { passwordHash: string } }) => {
        store.passwordHash = data.passwordHash;
      },
    },
    application: { updateMany: async () => ({ count: 0 }) },
    session: {
      deleteMany: async () => {
        store.sessionsDeleted = true;
      },
    },
    adminAction: { create: async () => ({}) },
  };
  return {
    db: {
      passwordRequest: {
        findUnique: async ({ where }: { where: { tokenHash: string } }) => {
          const r = store.row;
          if (!r || r.tokenHash !== where.tokenHash) return null;
          return {
            ...r,
            user: { role: 'student', isActive: true, student: { firstName: 'Ana', lastName: 'Reyes', studentNumber: '2026-99001' } },
          };
        },
      },
      $transaction: async (run: (t: typeof tx) => Promise<unknown>) => run(tx),
    },
  };
});

const { setPasswordFromRequest } = await import('@/lib/actions/auth');

const PASSWORD = 'a-new-password-1';
const minutes = (n: number) => new Date(Date.now() + n * 60_000);

function seed(status: Row['status'], approvedUntil: Date | null) {
  const token = requestToken(minutes(60));
  store.row = { id: 1, userId: 7, tokenHash: sha256Hex(token), status, expiresAt: minutes(60), approvedUntil, usedAt: null };
  return token;
}

describe('setPasswordFromRequest', () => {
  let hash: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    store.row = null;
    store.passwordHash = '';
    store.sessionsDeleted = false;
    hash = vi.spyOn(bcrypt, 'hash');
  });
  afterEach(() => hash.mockRestore());

  it('spends no bcrypt work on a malformed secret', async () => {
    const res = await setPasswordFromRequest({ token: 'x', password: PASSWORD });
    expect(res).toMatchObject({ ok: false, error: { code: 'request_closed' } });
    expect(hash).not.toHaveBeenCalled();
  });

  it('spends no bcrypt work on a secret that matches no request', async () => {
    const res = await setPasswordFromRequest({ token: requestToken(minutes(60)), password: PASSWORD });
    expect(res).toMatchObject({ ok: false, error: { code: 'request_closed' } });
    expect(hash).not.toHaveBeenCalled();
  });

  it('spends no bcrypt work while the request is still waiting', async () => {
    const token = seed('pending', null);
    const res = await setPasswordFromRequest({ token, password: PASSWORD });
    expect(res).toMatchObject({ ok: false, error: { code: 'request_closed' } });
    expect(hash).not.toHaveBeenCalled();
    expect(store.row?.status).toBe('pending');
  });

  it('spends no bcrypt work once the 15 minutes ran out', async () => {
    const token = seed('approved', minutes(-1));
    const res = await setPasswordFromRequest({ token, password: PASSWORD });
    expect(res).toMatchObject({ ok: false, error: { code: 'request_closed' } });
    expect(hash).not.toHaveBeenCalled();
    expect(store.row?.status).toBe('approved');
  });

  it('sets the password while the approval is open, once', async () => {
    const token = seed('approved', minutes(10));
    const res = await setPasswordFromRequest({ token, password: PASSWORD });
    expect(res).toEqual({ ok: true, data: { redirectTo: '/?reset=1' } });
    expect(await bcrypt.compare(PASSWORD, store.passwordHash)).toBe(true);
    expect(store.row?.status).toBe('used');
    expect(store.sessionsDeleted).toBe(true);

    const again = await setPasswordFromRequest({ token, password: 'another-password-2' });
    expect(again).toMatchObject({ ok: false, error: { code: 'request_closed' } });
    expect(await bcrypt.compare(PASSWORD, store.passwordHash)).toBe(true);
  });
});
