import type { Metadata } from 'next';
import { SignupForm } from '@/components/applications/SignupForm';
import { programOptions } from '@/lib/services/applications';
import { manilaYmd } from '@/lib/time';

export const metadata: Metadata = { title: 'Student application' };

// The program list comes from the database on every request.
export const dynamic = 'force-dynamic';

/** Public: the student sign-up form (HANDOFF §8.3). */
export default async function SignupPage() {
  const programs = await programOptions();
  return <SignupForm programs={programs} today={manilaYmd()} />;
}
