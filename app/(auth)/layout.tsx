import type { ReactNode } from 'react';
import { AuthFrame } from '@/components/shell/AuthFrame';

/** Sign-in, password and sign-up pages: the auth frame, no app shell. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthFrame>{children}</AuthFrame>;
}
