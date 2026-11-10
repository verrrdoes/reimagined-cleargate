'use client';

import { useSyncExternalStore } from 'react';

/** sessionStorage key: which sign-in page the visitor came from, for the "Back to sign in" links. */
export const PORTAL_KEY = 'cg_portal';

const noSubscribe = () => () => {};

function storedSignInPage(): string {
  try {
    return sessionStorage.getItem(PORTAL_KEY) === 'staff' ? '/staff-login' : '/';
  } catch {
    return '/';
  }
}

/** The sign-in page to go back to: `/staff-login` when the visitor came from there, otherwise `/`. */
export function useSignInPage(): string {
  return useSyncExternalStore(noSubscribe, storedSignInPage, () => '/');
}
