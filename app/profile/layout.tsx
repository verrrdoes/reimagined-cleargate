import type { ReactNode } from 'react';
import { anyPageUser } from '@/lib/auth/guards';
import { getShellData } from '@/lib/services/shell';
import { AppShell } from '@/components/shell/AppShell';

/** My profile is shared by every role, so it picks the student or staff shell from the account. */
export default async function ProfileLayout({ children }: { children: ReactNode }) {
  const user = await anyPageUser();
  const data = await getShellData(user, user.role === 'student' ? 'student' : 'staff');
  return <AppShell data={data}>{children}</AppShell>;
}
