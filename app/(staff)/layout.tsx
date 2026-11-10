import type { ReactNode } from 'react';
import { pageUser } from '@/lib/auth/guards';
import { getShellData } from '@/lib/services/shell';
import { AppShell } from '@/components/shell/AppShell';

/** Staff and admin pages, inside the app shell. Page-level guards (registrar, admin) narrow this further. */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const user = await pageUser('staff');
  const data = await getShellData(user, 'staff');
  return <AppShell data={data}>{children}</AppShell>;
}
