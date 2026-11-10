import type { Metadata } from 'next';
import { ResetForm } from '@/components/shell/auth/ResetForm';

export const metadata: Metadata = { title: 'Set a new password', referrer: 'no-referrer' };

// No signed-in redirect here: someone who is signed in may still follow a reset link from their email.
export default function ResetPasswordPage() {
  return <ResetForm />;
}
