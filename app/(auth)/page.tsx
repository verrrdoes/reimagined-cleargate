import type { Metadata } from 'next';
import { SignInForm } from '@/components/shell/auth/SignInForm';
import { firstParam, redirectIfSignedIn, type SearchParams } from '@/components/shell/auth/signedInRedirect';

export const metadata: Metadata = { title: 'Student sign in' };

export default async function StudentSignInPage({ searchParams }: { searchParams: SearchParams }) {
  await redirectIfSignedIn();
  const sp = await searchParams;
  const login = firstParam(sp.login).trim().slice(0, 190);
  const reset = firstParam(sp.reset) === '1';
  return <SignInForm portal="student" initialLogin={login} notice={reset ? 'reset' : null} />;
}
