import 'server-only';
import { db } from '@/lib/db';
import { avatarUrl } from '@/lib/services/shell';

/* ---------- §8.13 Staff accounts (admins) ---------- */

export type StaffAccount = {
  id: number;
  name: string;
  email: string;
  role: 'staff' | 'admin';
  isActive: boolean;
  /** Still on a temporary password (never signed in since it was issued). */
  mustChangePassword: boolean;
  /** ISO time of the last sign-in, or null for never. */
  lastLoginAt: string | null;
  position: string | null;
  officeCode: string | null;
  officeName: string | null;
  avatarUrl: string | null;
  /** The name typed into the form: office_staff.full_name for staff, users.full_name for admins. */
  formName: string;
};

export type StaffOfficeOption = { code: string; name: string; isActive: boolean };

/**
 * Every staff and admin account: administrators first, then by office order (accounts without an office
 * first), then by name.
 */
export async function listStaffAccounts(): Promise<StaffAccount[]> {
  const users = await db.user.findMany({
    where: { role: { in: ['staff', 'admin'] } },
    include: { staffProfile: { include: { office: { select: { code: true, name: true, sortOrder: true } } } } },
  });

  const rows = users.map((u) => {
    const staffName = u.staffProfile?.fullName ?? null;
    const name = staffName ?? u.fullName ?? (u.role === 'admin' ? 'System Administrator' : u.email);
    return {
      sortOffice: u.role === 'admin' ? -2 : (u.staffProfile?.office.sortOrder ?? -1),
      account: {
        id: u.id,
        name,
        email: u.email,
        role: u.role === 'admin' ? 'admin' : 'staff',
        isActive: u.isActive,
        mustChangePassword: u.mustChangePassword,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        position: u.role === 'admin' ? null : (u.staffProfile?.position ?? null),
        officeCode: u.role === 'admin' ? null : (u.staffProfile?.office.code ?? null),
        officeName: u.role === 'admin' ? null : (u.staffProfile?.office.name ?? null),
        avatarUrl: avatarUrl(u),
        formName: (u.role === 'admin' ? u.fullName : staffName) ?? staffName ?? u.fullName ?? '',
      } satisfies StaffAccount,
    };
  });

  rows.sort(
    (a, b) =>
      a.sortOffice - b.sortOffice ||
      (a.account.officeName ?? '').localeCompare(b.account.officeName ?? '') ||
      a.account.name.localeCompare(b.account.name, 'en', { sensitivity: 'base' }),
  );
  return rows.map((r) => r.account);
}

/** Offices for the account form: active ones, plus any inactive office an account still belongs to. */
export async function staffOfficeOptions(): Promise<StaffOfficeOption[]> {
  const offices = await db.office.findMany({
    where: { OR: [{ isActive: true }, { staff: { some: {} } }] },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { code: true, name: true, isActive: true },
  });
  return offices;
}

/** Case-insensitive match over name, email, office, position and role. */
export function matchesStaff(a: StaffAccount, q: string): boolean {
  if (!q) return true;
  const role = a.role === 'admin' ? 'administrator admin' : 'office staff';
  const hay = [a.name, a.email, a.officeName ?? '', a.officeCode ?? '', a.position ?? '', role].join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}
