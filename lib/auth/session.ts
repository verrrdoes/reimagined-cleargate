import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { LIMITS } from '@/lib/constants';
import { db } from '@/lib/db';
import { randomHex, sha256Hex } from '@/lib/ids';
import type { Prisma } from '@/generated/prisma/client';

export const SESSION_COOKIE = 'cleargate_session';
const IDLE_MS = LIMITS.idleTimeoutMinutes * 60_000;
const REMEMBER_MS = LIMITS.rememberDays * 86_400_000;

export const sessionUserInclude = {
  staffProfile: { include: { office: true } },
  student: { include: { program: true } },
} satisfies Prisma.UserInclude;

export type SessionUser = Prisma.UserGetPayload<{ include: typeof sessionUserInclude }>;

/** Starts a new session (never reuses a token) and sets the cookie. Server Actions only. */
export async function createSession(userId: number, remember: boolean): Promise<void> {
  const token = randomHex(32);
  const now = Date.now();
  await db.session.create({
    data: { id: sha256Hex(token), userId, remember, expiresAt: new Date(now + (remember ? REMEMBER_MS : IDLE_MS)) },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(remember ? { maxAge: REMEMBER_MS / 1000 } : {}),
  });
}

/**
 * The signed-in user for this request, or null. Expired, idle (120 min without "remember me"),
 * orphaned or turned-off sessions are deleted.
 */
export const readSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const id = sha256Hex(token);
  const session = await db.session.findUnique({ where: { id }, include: { user: { include: sessionUserInclude } } });
  if (!session) return null;

  const now = Date.now();
  const idle = !session.remember && session.lastSeenAt.getTime() + IDLE_MS < now;
  if (session.expiresAt.getTime() < now || idle || !session.user.isActive) {
    await db.session.deleteMany({ where: { id } });
    return null;
  }
  // Touch at most once a minute.
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await db.session.update({
      where: { id },
      data: { lastSeenAt: new Date(now), ...(session.remember ? {} : { expiresAt: new Date(now + IDLE_MS) }) },
    });
  }
  return session.user;
});

/** Signs out: deletes the session row and the cookie. Server Actions and Route Handlers only. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256Hex(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Signs a user out everywhere (account turned off, password reset). */
export async function deleteUserSessions(userId: number, tx: Pick<typeof db, 'session'> = db): Promise<void> {
  await tx.session.deleteMany({ where: { userId } });
}
