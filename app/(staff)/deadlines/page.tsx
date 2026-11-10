import type { Metadata } from 'next';
import { pageUser } from '@/lib/auth/guards';
import { getDeadlinesView } from '@/lib/services/deadlines';
import { DeadlinesPage } from '@/components/deadlines/DeadlinesPage';

export const metadata: Metadata = { title: 'Deadlines and reminders' };

/** Deadlines and reminders: office deadlines for the current term, students' own deadlines, and reminders. */
export default async function Page() {
  const user = await pageUser('staff');
  const view = await getDeadlinesView(user);
  return <DeadlinesPage view={view} />;
}
