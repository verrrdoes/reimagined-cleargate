import 'server-only';
import { redirect } from 'next/navigation';
import { readSession, type SessionUser } from '@/lib/auth/session';
import { fail } from '@/lib/result';
import type { Prisma, Role } from '@/generated/prisma/client';

export type { SessionUser };

export const currentUser = readSession;

/* ---------- Server Actions and Route Handlers: throw the envelope errors ---------- */

export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const user = await readSession();
  if (!user) fail(401, 'not_signed_in', 'Please sign in.');
  if (roles && !roles.includes(user.role)) fail(403, 'forbidden', 'Your account cannot do that.');
  return user;
}

export const requireStaff = () => requireUser(['staff', 'admin']);
export const requireAdmin = () => requireUser(['admin']);

export function isRegistrar(user: SessionUser): boolean {
  return user.role === 'admin' || (user.role === 'staff' && user.staffProfile?.office.code === 'registrar');
}

export async function requireRegistrar(): Promise<SessionUser> {
  const user = await requireStaff();
  if (!isRegistrar(user)) fail(403, 'forbidden', 'Only the Registrar and admins can manage applications.');
  return user;
}

/** Staff → their office id (or 403 no_office). Admins → null (every office). */
export function staffOfficeId(user: SessionUser): number | null {
  if (user.role === 'admin') return null;
  if (!user.staffProfile) fail(403, 'no_office', 'Your staff account is not linked to an office.');
  return user.staffProfile.officeId;
}

/**
 * Clearance-item filter: staff are pinned to their own office; admins may pass an office code,
 * and see every office without one.
 */
export function itemOfficeWhere(user: SessionUser, officeCode?: string | null): Prisma.ClearanceItemWhereInput {
  const own = staffOfficeId(user);
  if (own !== null) return { officeId: own };
  return officeCode ? { office: { code: officeCode } } : {};
}

/** The actor passed to updateClearanceItem(). */
export function actorOf(user: SessionUser) {
  return { id: user.id, role: user.role, officeId: user.staffProfile?.officeId ?? null };
}

/** Staff full name → student "First Last" → users.full_name → "System Administrator" → email. */
export function displayName(user: SessionUser): string {
  if (user.staffProfile?.fullName) return user.staffProfile.fullName;
  if (user.student) return `${user.student.firstName} ${user.student.lastName}`;
  if (user.fullName) return user.fullName;
  if (user.role === 'admin') return 'System Administrator';
  return user.email;
}

/* ---------- Pages: redirect instead of throwing (legacy loadProfile) ---------- */

export async function pageUser(portal: 'student' | 'staff'): Promise<SessionUser> {
  const user = await readSession();
  if (!user) redirect(portal === 'student' ? '/' : '/staff-login');
  if (user.mustChangePassword) redirect('/change-password');
  if (portal === 'student' && user.role !== 'student') redirect('/overview');
  if (portal === 'staff' && user.role === 'student') redirect('/dashboard');
  return user;
}

/** Any signed-in role (My Profile). */
export async function anyPageUser(): Promise<SessionUser> {
  const user = await readSession();
  if (!user) redirect('/');
  if (user.mustChangePassword) redirect('/change-password');
  return user;
}

export async function registrarPage(): Promise<SessionUser> {
  const user = await pageUser('staff');
  if (!isRegistrar(user)) redirect('/overview');
  return user;
}

export async function adminPage(): Promise<SessionUser> {
  const user = await pageUser('staff');
  if (user.role !== 'admin') redirect('/overview');
  return user;
}

export const portalHome = (role: Role) => (role === 'student' ? '/dashboard' : '/overview');
