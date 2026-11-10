import type { Metadata } from 'next';
import { ForgotForm } from '@/components/shell/auth/ForgotForm';
import { firstParam, redirectIfSignedIn, type SearchParams } from '@/components/shell/auth/signedInRedirect';

export const metadata: Metadata = { title: 'Forgot password' };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  await redirectIfSignedIn();
  const sp = await searchParams;
  return <ForgotForm portal={firstParam(sp.portal) === 'staff' ? 'staff' : 'student'} />;
}
