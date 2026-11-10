import 'server-only';
import { db } from '@/lib/db';
import { fail } from '@/lib/result';
import { LIMITS } from '@/lib/constants';
import { cut, posInt } from '@/lib/input';
import { requestCode, requestToken, sha256Hex } from '@/lib/ids';
import { deleteUserSessions } from '@/lib/auth/session';
import { logAdmin } from '@/lib/services/adminLog';
import {
  normalizeLogin,
  parseRequestToken,
  PASSWORD_REQUEST_CLOSED,
  requestState,
  type RequestState,
} from '@/lib/passwordRequest';

// Password requests the Registrar approves in person (design: docs/superpowers/specs/2026-10-25-registrar-password-requests-design.md).
// A student asks on Forgot password; the device that asked keeps a secret (only its sha256 is stored) and checks
// back every 15 seconds. Nothing the student sees tells whether the student ID or email has an account.

export type AskReply = { code: string; token: string; expiresAt: string; login: string };
export type RequestStatusView = { state: RequestState; approvedUntil: string | null };
export type PasswordRequestRow = {
  id: number;
  name: string;
  studentNumber: string;
  code: string;
  createdAt: string;
  state: 'waiting' | 'allowed';
  approvedUntil: string | null;
};

const LOGIN_PREFIX = 'pwreq:';
const NOT_FOUND = 'Password request not found.';

const closed = (): never => fail(409, 'request_closed', PASSWORD_REQUEST_CLOSED);
const nameOf = (s: { lastName: string; firstName: string }) => `${s.lastName}, ${s.firstName}`;

/* ---------- the student ---------- */

/** Public: ask the Registrar for a password change. Unknown or inactive accounts get the same reply, and nothing is saved. */
export async function askForPasswordChange(input: { login?: unknown }, ip: string): Promise<AskReply> {
  const login = normalizeLogin(input?.login);
  if (login === '') fail(400, 'missing_login', 'Enter your student ID or school email.');

  const since = new Date(Date.now() - LIMITS.lockoutMinutes * 60_000);
  const [byLogin, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { login: cut(LOGIN_PREFIX + login, 190), attemptedAt: { gt: since } } }),
    db.loginAttempt.count({ where: { ipAddress: ip, login: { startsWith: LOGIN_PREFIX }, attemptedAt: { gt: since } } }),
  ]);
  if (byLogin >= LIMITS.passwordRequestsPerLogin || byIp >= LIMITS.passwordRequestsPerIp) {
    fail(429, 'too_many_requests', `Too many requests. Try again in ${LIMITS.lockoutMinutes} minutes.`);
  }
  // succeeded: true so these rows never count toward the sign-in lockout, which counts failures per IP
  // (a computer lab shares one IP).
  await db.loginAttempt.create({ data: { login: cut(LOGIN_PREFIX + login, 190), ipAddress: ip, succeeded: true } });

  const expiresAt = new Date(Date.now() + LIMITS.passwordRequestHours * 3_600_000);
  const token = requestToken(expiresAt);
  const code = requestCode();

  const user = await db.user.findFirst({
    where: { role: 'student', isActive: true, OR: [{ email: login }, { student: { is: { studentNumber: login } } }] },
    select: { id: true },
  });
  if (user) {
    await db.passwordRequest.create({ data: { userId: user.id, code, tokenHash: sha256Hex(token), expiresAt, ipAddress: ip } });
  }
  return { code, token, expiresAt: expiresAt.toISOString(), login };
}

/** Public: the state of a request, by the device's secret. An unknown secret reads like a real request no one has decided. */
export async function getPasswordRequestStatus(token: unknown): Promise<RequestStatusView> {
  const parsed = parseRequestToken(token);
  if (!parsed) return { state: 'closed', approvedUntil: null };
  const now = new Date();

  const row = await db.passwordRequest.findUnique({
    where: { tokenHash: sha256Hex(parsed.token) },
    select: { status: true, expiresAt: true, approvedUntil: true, user: { select: { role: true, isActive: true } } },
  });
  if (!row) return { state: parsed.expiresAt > now ? 'waiting' : 'closed', approvedUntil: null };

  const active = row.user.role === 'student' && row.user.isActive;
  const state = active ? requestState(row, now) : 'closed';
  return { state, approvedUntil: state === 'allowed' && row.approvedUntil ? row.approvedUntil.toISOString() : null };
}

/** Public: the student cancels their request. Unknown secrets are ignored, so the reply is always the same. */
export async function cancelPasswordRequest(token: unknown): Promise<void> {
  const parsed = parseRequestToken(token);
  if (!parsed) return;
  await db.passwordRequest.updateMany({
    where: { tokenHash: sha256Hex(parsed.token), status: { in: ['pending', 'approved'] } },
    data: { status: 'cancelled' },
  });
}

/**
 * Public: set the new password on the device that asked, while the Registrar's approval is open. Signs the account out
 * everywhere. `hashPassword` runs only once the secret matches an open approval: this is public and unthrottled, so a
 * junk secret must cost no bcrypt work.
 */
export async function completePasswordRequest(token: unknown, hashPassword: () => Promise<string>): Promise<{ redirectTo: string }> {
  const parsed = parseRequestToken(token);
  if (!parsed) return closed();

  const row = await db.passwordRequest.findUnique({
    where: { tokenHash: sha256Hex(parsed.token) },
    select: {
      id: true,
      userId: true,
      status: true,
      expiresAt: true,
      approvedUntil: true,
      user: { select: { role: true, isActive: true, student: { select: { firstName: true, lastName: true, studentNumber: true } } } },
    },
  });
  const student = row?.user.student;
  if (!row || row.user.role !== 'student' || !row.user.isActive || !student) return closed();
  if (requestState(row, new Date()) !== 'allowed') return closed();

  const passwordHash = await hashPassword();
  const now = new Date();
  await db.$transaction(async (tx) => {
    // Claim the approval so it works once, and only inside its window.
    const claimed = await tx.passwordRequest.updateMany({
      where: { id: row.id, status: 'approved', approvedUntil: { gt: now } },
      data: { status: 'used', usedAt: now },
    });
    if (claimed.count !== 1) closed();
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash, mustChangePassword: false } });
    await tx.application.updateMany({ where: { userId: row.userId }, data: { tempPassword: null } });
    await deleteUserSessions(row.userId, tx);
    await logAdmin(
      tx,
      row.userId,
      'password_request.used',
      `${nameOf(student)} (${student.studentNumber}) set a new password after the Registrar allowed it`,
    );
  });
  return { redirectTo: '/?reset=1' };
}

/* ---------- the Registrar and admins ---------- */

/** Requests that are waiting, or allowed and not used yet, newest first. */
export async function listPasswordRequests(): Promise<PasswordRequestRow[]> {
  const now = new Date();
  const rows = await db.passwordRequest.findMany({
    where: {
      OR: [
        { status: 'pending', expiresAt: { gt: now } },
        { status: 'approved', approvedUntil: { gt: now } },
      ],
      user: { is: { role: 'student', isActive: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: LIMITS.passwordRequestsList,
    select: {
      id: true,
      code: true,
      status: true,
      createdAt: true,
      approvedUntil: true,
      user: { select: { student: { select: { firstName: true, lastName: true, studentNumber: true } } } },
    },
  });
  return rows.flatMap((r) => {
    const s = r.user.student;
    if (!s) return [];
    const allowed = r.status === 'approved';
    return [
      {
        id: r.id,
        name: nameOf(s),
        studentNumber: s.studentNumber,
        code: r.code,
        createdAt: r.createdAt.toISOString(),
        state: allowed ? ('allowed' as const) : ('waiting' as const),
        approvedUntil: allowed && r.approvedUntil ? r.approvedUntil.toISOString() : null,
      },
    ];
  });
}

/**
 * Allow, decline or withdraw one request. Each is a conditional update, so two staff deciding at once
 * cannot both win. Allowing one request closes the student's other open requests.
 */
export async function decidePasswordRequest(
  actorId: number,
  input: { id?: unknown },
  decision: 'allow' | 'decline' | 'withdraw',
): Promise<void> {
  const id = posInt(input?.id);
  if (!id) fail(404, 'not_found', NOT_FOUND);
  const row = await db.passwordRequest.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      expiresAt: true,
      user: { select: { role: true, isActive: true, student: { select: { firstName: true, lastName: true, studentNumber: true } } } },
    },
  });
  const student = row?.user.student;
  if (!row || row.user.role !== 'student' || !row.user.isActive || !student) fail(404, 'not_found', NOT_FOUND);
  const who = `${nameOf(student)} (${student.studentNumber})`;

  const now = new Date();
  const notWaiting = (): never =>
    row.status === 'pending' && row.expiresAt <= now
      ? fail(409, 'request_expired', 'This request has expired.')
      : fail(409, 'already_decided', 'This request was already decided.');
  const decided = { decidedById: actorId, decidedAt: now };

  await db.$transaction(async (tx) => {
    if (decision === 'withdraw') {
      const res = await tx.passwordRequest.updateMany({
        where: { id, status: 'approved', approvedUntil: { gt: now } },
        data: { status: 'withdrawn', ...decided },
      });
      if (res.count !== 1) fail(409, 'already_closed', 'This approval was already used or has run out.');
      await logAdmin(tx, actorId, 'password_request.withdraw', `Withdrew the password approval of ${who}`);
      return;
    }

    const allow = decision === 'allow';
    const res = await tx.passwordRequest.updateMany({
      where: { id, status: 'pending', expiresAt: { gt: now } },
      data: allow
        ? { status: 'approved', ...decided, approvedUntil: new Date(now.getTime() + LIMITS.passwordRequestAllowMinutes * 60_000) }
        : { status: 'declined', ...decided },
    });
    if (res.count !== 1) notWaiting();

    if (allow) {
      await tx.passwordRequest.updateMany({
        where: { userId: row.userId, id: { not: id }, status: { in: ['pending', 'approved'] } },
        data: { status: 'cancelled' },
      });
      await logAdmin(tx, actorId, 'password_request.allow', `Allowed ${who} to set a new password`);
    } else {
      await logAdmin(tx, actorId, 'password_request.decline', `Declined the password request of ${who}`);
    }
  });
}
