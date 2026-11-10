import type { Metadata } from 'next';
import { anyPageUser } from '@/lib/auth/guards';
import { getProfileView } from '@/lib/services/profile';
import { ProfilePage } from '@/components/profile/ProfilePage';

export const metadata: Metadata = { title: 'My profile' };

/** My profile: the account, the student's or staff member's details, the picture and the password. */
export default async function Page() {
  const user = await anyPageUser();
  const view = await getProfileView(user);
  return <ProfilePage view={view} />;
}
