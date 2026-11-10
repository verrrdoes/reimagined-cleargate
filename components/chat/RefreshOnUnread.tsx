'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useShell } from '@/components/shell/ShellContext';

/**
 * Re-renders the current page when the shell's unread-message count changes (its 60 s poll),
 * so a list of conversations picks up new messages without its own polling.
 */
export function RefreshOnUnread() {
  const { unreadMessages } = useShell();
  const router = useRouter();
  const seen = useRef(unreadMessages);

  useEffect(() => {
    if (seen.current === unreadMessages) return;
    seen.current = unreadMessages;
    router.refresh();
  }, [unreadMessages, router]);

  return null;
}
