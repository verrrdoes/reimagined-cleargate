import 'server-only';
import { redirect } from 'next/navigation';
import { currentUser, portalHome } from '@/lib/auth/guards';

/** Sign-in and password-reset pages send a signed-in visitor to their portal (or to set their password first). */
export async function redirectIfSignedIn(): Promise<void> {
  const user = await currentUser();
  if (user) redirect(user.mustChangePassword ? '/change-password' : portalHome(user.role));
}

/** The first value of a search param. */
export function firstParam(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
