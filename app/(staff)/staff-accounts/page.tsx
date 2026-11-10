import type { Metadata } from 'next';
import { adminPage } from '@/lib/auth/guards';
import { listStaffAccounts, matchesStaff, staffOfficeOptions } from '@/lib/services/staff';
import { StaffAccountsView, type StaffCounts, type StaffShow } from '@/components/admin/StaffAccountsView';

export const metadata: Metadata = { title: 'Staff accounts' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function StaffAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await adminPage();
  const sp = await searchParams;
  const q = (one(sp.q) ?? '').trim().slice(0, 100);
  const showParam = one(sp.show);
  const show: StaffShow = showParam === 'active' || showParam === 'off' ? showParam : 'all';

  const [accounts, offices] = await Promise.all([listStaffAccounts(), staffOfficeOptions()]);
  const searched = q ? accounts.filter((a) => matchesStaff(a, q)) : accounts;
  const rows = show === 'all' ? searched : searched.filter((a) => (show === 'active' ? a.isActive : !a.isActive));

  const counts: StaffCounts = {
    total: accounts.length,
    admins: accounts.filter((a) => a.role === 'admin').length,
    activeTotal: accounts.filter((a) => a.isActive).length,
    offTotal: accounts.filter((a) => !a.isActive).length,
    all: searched.length,
    active: searched.filter((a) => a.isActive).length,
    off: searched.filter((a) => !a.isActive).length,
  };

  return <StaffAccountsView accounts={rows} offices={offices} meId={me.id} show={show} q={q} counts={counts} />;
}
