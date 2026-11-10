'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { db } from '@/lib/db';
import { env, isDemoMode } from '@/lib/env';
import { fail, runAction, type Result } from '@/lib/result';
import { LIMITS } from '@/lib/constants';
import { bool, isEmail, oneOf, str } from '@/lib/input';
import { randomHex, sha256Hex } from '@/lib/ids';
import { clientIp } from '@/lib/request';
import { createSession, deleteUserSessions, destroySession, readSession } from '@/lib/auth/session';
import { portalHome, requireUser } from '@/lib/auth/guards';
import { sendPasswordReset } from '@/lib/mail';
import {
  askForPasswordChange,
  cancelPasswordRequest,
  completePasswordRequest,
  type AskReply,
} from '@/lib/services/passwordRequests';

// Sign-in, sign-out and passwords (HANDOFF §8.1; legacy routeLogin, routeLogout,
// routeChangePassword, routeForgot, routeReset).

const BCRYPT_COST = 12;
/** Compared against when the account doesn't exist, so the response time doesn't reveal which accounts are real. */
const DUMMY_HASH = '$2b$12$UYSsFdI1qTld3cBFlPKBf.a9Kjrm2Cd4OOfumz79RzD5DPwstRP3u';

const chars = (s: string) => Array.from(s).length;

/** Legacy PHP hashes start with $2y$; the algorithm is identical to $2b$. */
async function passwordMatches(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash.replace(/^\$2y\$/, '$2b$'));
  } catch {
    return false;
  }
}

function needsRehash(hash: string): boolean {
  if (!hash.startsWith('$2b$') && !hash.startsWith('$2a$')) return true;
  try {
    return bcrypt.getRounds(hash) < BCRYPT_COST;
  } catch {
    return true;
  }
}

const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);

const field = (v: unknown) => (typeof v === 'string' ? v : '');

/** Sign in on the student portal (`/`) or the staff portal (`/staff-login`). */
export async function signIn(input: {
  login: string;
  password: string;
  remember?: boolean;
  portal: 'student' | 'staff';
}): Promise<Result<{ redirectTo: string }>> {
  return runAction(async () => {
    const login = field(input?.login).trim();
    const password = field(input?.password);
    if (login === '' || chars(login) > 190 || password === '') {
      fail(400, 'missing_fields', 'Enter your student ID or email and your password.');
    }
    const lower = login.toLowerCase();
    const ip = await clientIp();

    // Lockout: 5 failures for this login or 20 from this IP within 15 minutes.
    const since = new Date(Date.now() - LIMITS.lockoutMinutes * 60_000);
    const [byLogin, byIp] = await Promise.all([
      db.loginAttempt.count({ where: { login: lower, succeeded: false, attemptedAt: { gt: since } } }),
      db.loginAttempt.count({ where: { ipAddress: ip, succeeded: false, attemptedAt: { gt: since } } }),
    ]);
    if (byLogin >= LIMITS.loginFailuresPerLogin || byIp >= LIMITS.loginFailuresPerIp) {
      fail(429, 'too_many_attempts', `Too many failed sign-ins. Try again in ${LIMITS.lockoutMinutes} minutes.`);
    }

    const user = await db.user.findFirst({
      where: { OR: [{ email: lower }, { student: { is: { studentNumber: login } } }] },
      select: { id: true, role: true, isActive: true, passwordHash: true, mustChangePassword: true },
    });

    // Always run the compare, against a dummy hash for unknown accounts.
    const matches = await passwordMatches(password, user?.passwordHash ?? DUMMY_HASH);
    const valid = Boolean(user && matches && user.isActive);

    await db.loginAttempt.create({ data: { login: lower, ipAddress: ip, succeeded: valid } });

    if (!valid || !user) fail(401, 'invalid_credentials', "That student ID/email and password don't match.");

    // Each sign-in page only lets its own kind of account in.
    const portal = oneOf(input?.portal, ['student', 'staff'] as const);
    if (portal === 'student' && user.role !== 'student') {
      fail(403, 'wrong_portal', 'This sign-in is for students. Office staff and admins, use the Staff sign-in page.');
    }
    if (portal === 'staff' && user.role === 'student') {
      fail(403, 'wrong_portal', 'This sign-in is for office staff and admins. Students, use the Student sign-in page.');
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(password) } : {}),
      },
    });

    // A new session (and a new token) on every sign-in.
    await createSession(user.id, bool(input?.remember));

    return { redirectTo: user.mustChangePassword ? '/change-password' : portalHome(user.role) };
  });
}

/**
 * Signs out and goes to the right sign-in page: `/` for students, `/staff-login` for staff and admins.
 * Works as a form action too. Without a session, an optional `portal` hint ('student' | 'staff') picks the page.
 */
export async function signOut(hint?: unknown): Promise<never> {
  const user = await readSession();
  await destroySession();
  let portal: unknown = null;
  if (hint instanceof FormData) portal = hint.get('portal');
  else if (hint && typeof hint === 'object') portal = (hint as { portal?: unknown }).portal;
  const staff = user ? user.role !== 'student' : portal === 'staff';
  redirect(staff ? '/staff-login' : '/');
}

/** Signed in: change the password (also the forced first change after a temporary password). */
export async function changePassword(input: { current: string; next: string }): Promise<Result<{ redirectTo: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const current = field(input?.current);
    const next = field(input?.next);
    if (current === '' || !(await passwordMatches(current, user.passwordHash))) {
      fail(400, 'wrong_password', 'Your current password is not correct.');
    }
    const length = chars(next);
    if (length < 8 || length > 128) fail(400, 'weak_password', 'Your new password needs 8 to 128 characters.');
    if (next === current) fail(400, 'same_password', 'Choose a password different from your current one.');

    const passwordHash = await hashPassword(next);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
      // The application status page stops showing the temporary password (§17 item 1).
      await tx.application.updateMany({ where: { userId: user.id }, data: { tempPassword: null } });
    });
    return { redirectTo: portalHome(user.role) };
  });
}

/** Public: start a password reset. The reply is the same whether or not the email has an account. */
export async function forgotPassword(input: { email: string }): Promise<Result<{ message: string; demoToken?: string }>> {
  return runAction(async () => {
    const email = field(input?.email).trim().toLowerCase();
    if (!isEmail(email)) fail(400, 'invalid_email', 'Enter a valid email address.');

    const data: { message: string; demoToken?: string } = {
      message: 'If that email has an account, a reset link is on its way.',
    };
    const user = await db.user.findFirst({
      where: { isActive: true, OR: [{ email }, { personalEmail: email }] },
      select: { id: true },
    });
    if (user) {
      const token = randomHex(32);
      await db.$transaction(async (tx) => {
        // Earlier links stop working when a new one is issued.
        await tx.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
        await tx.passwordReset.create({
          data: {
            userId: user.id,
            tokenHash: sha256Hex(token),
            expiresAt: new Date(Date.now() + LIMITS.resetTokenMinutes * 60_000),
          },
        });
      });
      const link = `${env().APP_URL.replace(/\/+$/, '')}/reset-password#token=${token}`;
      // Sent after the response, so the reply time doesn't depend on the email provider.
      after(async () => {
        await sendPasswordReset(email, link);
      });
      if (isDemoMode()) data.demoToken = token;
    }
    return data;
  });
}

/** Public: finish a password reset with the emailed token. Signs the account out everywhere. */
export async function resetPassword(input: { token: string; password: string }): Promise<Result<{ redirectTo: string }>> {
  return runAction(async () => {
    const token = str(input?.token, 128);
    const password = field(input?.password);
    const length = chars(password);
    if (length < 8 || length > 128) fail(400, 'weak_password', 'Your new password needs 8 to 128 characters.');

    const invalid = (): never => fail(400, 'invalid_token', 'This reset link is invalid or has expired. Request a new one.');
    if (token === '') invalid();

    const reset = await db.passwordReset.findFirst({
      where: { tokenHash: sha256Hex(token), usedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userId: true, user: { select: { role: true } } },
    });
    if (!reset) return invalid();

    const passwordHash = await hashPassword(password);
    await db.$transaction(async (tx) => {
      // Claim the token so it works only once, even with two tabs racing.
      const claimed = await tx.passwordReset.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) invalid();
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash, mustChangePassword: false } });
      await tx.application.updateMany({ where: { userId: reset.userId }, data: { tempPassword: null } });
      await deleteUserSessions(reset.userId, tx);
    });
    return { redirectTo: reset.user.role === 'student' ? '/?reset=1' : '/staff-login?reset=1' };
  });
}

/* ---------- password requests the Registrar approves in person ---------- */

/** Public: ask the Registrar for a password change. The reply is the same whether or not the ID or email has an account. */
export async function requestPasswordChange(input: { login: string }): Promise<Result<AskReply>> {
  return runAction(async () => askForPasswordChange({ login: input?.login }, await clientIp()));
}

/** Public: cancel the request this device made. */
export async function cancelPasswordChange(input: { token: string }): Promise<Result> {
  return runAction(async () => {
    await cancelPasswordRequest(input?.token);
    return null;
  });
}

/** Public: set the new password once the Registrar has allowed this device's request. Signs the account out everywhere. */
export async function setPasswordFromRequest(input: { token: string; password: string }): Promise<Result<{ redirectTo: string }>> {
  return runAction(async () => {
    const password = field(input?.password);
    const length = chars(password);
    if (length < 8 || length > 128) fail(400, 'weak_password', 'Your new password needs 8 to 128 characters.');
    return completePasswordRequest(input?.token, () => hashPassword(password));
  });
}
