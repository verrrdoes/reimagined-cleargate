'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { deleteUserSessions } from '@/lib/auth/session';
import { db, type Tx } from '@/lib/db';
import { tempPassword } from '@/lib/ids';
import { bool, isEmail, oneOf, optStr, posInt, str } from '@/lib/input';
import { fail, isUniqueViolation, runAction, type Result } from '@/lib/result';
import { logAdmin } from '@/lib/services/adminLog';

// Staff accounts (HANDOFF §8.13). Admins only; every change is logged. Passwords are never logged or stored in plain text.

const BCRYPT_COST = 12;
const ROLES = ['staff', 'admin'] as const;
type StaffRole = (typeof ROLES)[number];

const done = () => revalidatePath('/staff-accounts');

const emailTaken = () => fail(409, 'email_taken', 'Another account already uses that email.');

/** The name shown for an account: staff full name, then users.full_name, then "System Administrator" or the email. */
function accountName(u: { email: string; role: string; fullName: string | null; staffProfile: { fullName: string } | null }): string {
  return u.staffProfile?.fullName ?? u.fullName ?? (u.role === 'admin' ? 'System Administrator' : u.email);
}

/** A staff or admin account (never a student) by id, or 404. */
async function loadAccount(tx: Tx, id: number) {
  const u = await tx.user.findUnique({ where: { id }, include: { staffProfile: { include: { office: true } } } });
  if (!u || u.role === 'student') fail(404, 'not_found', 'Staff account not found.');
  return u;
}

/** Staff sign for one office (office_staff row); admins have no office row. */
async function syncProfile(tx: Tx, userId: number, role: StaffRole, officeId: number | null, fullName: string, position: string | null) {
  if (role === 'staff' && officeId !== null) {
    await tx.officeStaff.upsert({
      where: { userId },
      create: { userId, officeId, fullName, position },
      update: { officeId, fullName, position },
    });
  } else {
    await tx.officeStaff.deleteMany({ where: { userId } });
  }
}

export type StaffInput = {
  /** Set when editing; omitted to create an account. */
  id?: number | null;
  fullName?: string;
  email?: string;
  role?: string;
  /** Staff only: the office code they sign for. */
  officeCode?: string;
  /** Staff only, optional. */
  position?: string;
};

/**
 * Creates or edits a staff or admin account. A new account gets a temporary password, returned once
 * here and never stored in plain text; the person must choose their own when they first sign in.
 */
export async function saveStaff(input: StaffInput): Promise<Result<{ userId: number; tempPassword: string | null }>> {
  return runAction(async () => {
    const user = await requireAdmin();
    const i = (input ?? {}) as Record<string, unknown>;

    const id = posInt(i.id);
    const fullName = str(i.fullName, 120);
    const email = str(i.email, 190).toLowerCase();
    const role = oneOf(i.role, ROLES);
    if (!fullName) fail(400, 'missing_fields', 'Enter the full name.');
    if (!isEmail(email)) fail(400, 'invalid_email', 'Enter a valid email.');
    if (!role) fail(400, 'invalid_role', 'Role must be staff or admin.');
    if (id && id === user.id && role !== 'admin') fail(400, 'self', "You can't remove your own admin role.");

    let officeId: number | null = null;
    let officeName = '';
    if (role === 'staff') {
      const code = str(i.officeCode, 20).toLowerCase();
      const office = code ? await db.office.findUnique({ where: { code }, select: { id: true, name: true } }) : null;
      if (!office) fail(400, 'invalid_office', 'Choose the office this staff member signs for.');
      officeId = office.id;
      officeName = office.name;
    }
    const position = role === 'staff' ? optStr(i.position, 80) : null;

    // Hashing is slow on purpose, so it happens before the transaction opens.
    const temp = id ? null : tempPassword();
    const hash = temp ? await bcrypt.hash(temp, BCRYPT_COST) : null;

    try {
      const out = await db.$transaction(async (tx) => {
        const dup = await tx.user.findFirst({
          where: { OR: [{ email }, { personalEmail: email }], ...(id ? { NOT: { id } } : {}) },
          select: { id: true },
        });
        if (dup) emailTaken();

        if (id) {
          await loadAccount(tx, id);
          await tx.user.update({ where: { id }, data: { email, role, fullName: role === 'admin' ? fullName : null } });
          await syncProfile(tx, id, role, officeId, fullName, position);
          await logAdmin(tx, user.id, 'staff.update', `Updated ${fullName} (${email})`);
          return { userId: id, tempPassword: null };
        }

        if (!hash) fail(500, 'server_error', 'Something went wrong.');
        const created = await tx.user.create({
          data: { email, passwordHash: hash, role, fullName: role === 'admin' ? fullName : null, mustChangePassword: true, isActive: true },
        });
        await syncProfile(tx, created.id, role, officeId, fullName, position);
        const kind = role === 'admin' ? 'admin' : `${officeName} staff`;
        await logAdmin(tx, user.id, 'staff.create', `Created ${kind} account for ${fullName} (${email})`);
        return { userId: created.id, tempPassword: temp };
      });
      done();
      return out;
    } catch (e) {
      if (isUniqueViolation(e)) emailTaken();
      throw e;
    }
  });
}

/** Turns an account off (signing it out everywhere) or back on. You can't turn off your own account. */
export async function setStaffStatus(input: { id: number; active: boolean }): Promise<Result<{ name: string; active: boolean }>> {
  return runAction(async () => {
    const user = await requireAdmin();
    const i = (input ?? {}) as Record<string, unknown>;
    const id = posInt(i.id);
    const active = bool(i.active);
    if (!id) fail(404, 'not_found', 'Staff account not found.');
    if (id === user.id) fail(400, 'self', "You can't turn off your own account.");

    const name = await db.$transaction(async (tx) => {
      const target = await loadAccount(tx, id);
      const n = accountName(target);
      await tx.user.update({ where: { id }, data: { isActive: active } });
      if (!active) await deleteUserSessions(id, tx);
      await logAdmin(
        tx,
        user.id,
        active ? 'staff.enable' : 'staff.disable',
        `${active ? 'Turned on' : 'Turned off'} the account of ${n} (${target.email})`,
      );
      return n;
    });
    done();
    return { name, active };
  });
}

/**
 * Issues a new temporary password, shown once. The old password stops working and the person must choose
 * a new one at their next sign-in; anyone else is also signed out everywhere. Resetting your own password
 * keeps your session, and the next page load asks you to choose a new one.
 */
export async function resetStaffPassword(input: { id: number }): Promise<Result<{ tempPassword: string; name: string; email: string; self: boolean }>> {
  return runAction(async () => {
    const user = await requireAdmin();
    const id = posInt((input as Record<string, unknown> | null)?.id);
    if (!id) fail(404, 'not_found', 'Staff account not found.');
    const self = id === user.id;

    const temp = tempPassword();
    const hash = await bcrypt.hash(temp, BCRYPT_COST);

    const target = await db.$transaction(async (tx) => {
      const t = await loadAccount(tx, id);
      await tx.user.update({ where: { id }, data: { passwordHash: hash, mustChangePassword: true } });
      if (!self) await deleteUserSessions(id, tx);
      await logAdmin(tx, user.id, 'staff.reset_password', `Issued a temporary password to ${accountName(t)} (${t.email})`);
      return { name: accountName(t), email: t.email };
    });
    // Your own reset: the page refreshes after the dialog closes (and then asks for a new password).
    if (!self) done();
    return { tempPassword: temp, name: target.name, email: target.email, self };
  });
}
