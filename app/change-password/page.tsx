import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser, portalHome } from '@/lib/auth/guards';
import { AuthFrame } from '@/components/shell/AuthFrame';
import { ChangePasswordForm } from '@/components/shell/auth/ChangePasswordForm';

export const metadata: Metadata = { title: 'Set your password' };

/** Signed-in password change; every page sends accounts with a temporary password here first. */
export default async function ChangePasswordPage() {
  const user = await currentUser();
  if (!user) redirect('/');
  return (
    <AuthFrame>
      <ChangePasswordForm
        mustChange={user.mustChangePassword}
        homeHref={portalHome(user.role)}
        portal={user.role === 'student' ? 'student' : 'staff'}
        username={user.email}
      />
    </AuthFrame>
  );
}
