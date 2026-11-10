import type { ReactNode } from 'react';
import { pageUser } from '@/lib/auth/guards';
import { getShellData } from '@/lib/services/shell';
import { AppShell } from '@/components/shell/AppShell';

/** Student pages: signed-in students only (others are redirected by pageUser), inside the app shell. */
export default async function StudentLayout({ children }: { children: ReactNode }) {
  const user = await pageUser('student');
  const data = await getShellData(user, 'student');
  return <AppShell data={data}>{children}</AppShell>;
}
