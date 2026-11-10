'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { syncServerClock } from '@/components/ui/clock';
import type { MePoll, NotificationView, ShellData } from '@/lib/types';

const POLL_MS = 60_000;

export type ShellState = {
  data: ShellData;
  unreadMessages: number;
  notifications: NotificationView[];
  serverNow: string;
  /** Fetches GET /api/me now. */
  refresh: () => Promise<void>;
  /** Marks one notification read. Never rejects. */
  markRead: (id: number) => Promise<void>;
  /** Marks every notification up to `upTo` read: the bell, when it opens. Never rejects. */
  markShownRead: (upTo: number) => Promise<void>;
  /** The bell pauses polling while it is open, so the list does not move under the pointer. */
  pausePolling: (paused: boolean) => void;
};

const ShellContext = createContext<ShellState | null>(null);

export function useShell(): ShellState {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell() is only available inside the app shell.');
  return ctx;
}

/**
 * Holds the shell's live data: the server render's values until GET /api/me (every 60 s, skipped while the tab
 * is hidden or the bell is open) brings newer ones. A fresh server render (router.refresh) wins again.
 */
export function ShellProvider({ data, children }: { data: ShellData; children: ReactNode }) {
  const [polled, setPolled] = useState<{ base: string; value: MePoll } | null>(null);
  const live: MePoll =
    polled && polled.base === data.serverNow
      ? polled.value
      : { unreadMessages: data.unreadMessages, notifications: data.notifications, serverNow: data.serverNow };

  const baseRef = useRef(data.serverNow);
  const liveRef = useRef(live);
  const pausedRef = useRef(false);
  const lastPollRef = useRef(0);

  useEffect(() => {
    baseRef.current = data.serverNow;
    liveRef.current = live;
  });

  useEffect(() => {
    syncServerClock(data.serverNow);
  }, [data.serverNow]);

  const signInPage = data.portal === 'student' ? '/' : '/staff-login';

  const refresh = useCallback(async () => {
    lastPollRef.current = Date.now();
    try {
      const res = await fetch('/api/me', { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (res.status === 401) {
        // The session ended (idle timeout or signed out elsewhere).
        window.location.assign(signInPage);
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as { ok?: boolean; data?: MePoll };
      if (!body.ok || !body.data) return;
      syncServerClock(body.data.serverNow);
      setPolled({ base: baseRef.current, value: body.data });
    } catch {
      // Offline or the server is restarting: the next poll tries again.
    }
  }, [signInPage]);

  useEffect(() => {
    lastPollRef.current = Date.now();
    const timer = setInterval(() => {
      if (document.hidden || pausedRef.current) return;
      void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden && !pausedRef.current && Date.now() - lastPollRef.current >= POLL_MS) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  /** Shows the matching notifications as read at once, then tells the server. */
  const send = useCallback(async (body: { id: number } | { upTo: number }, read: (n: NotificationView) => boolean) => {
    const current = liveRef.current;
    setPolled({
      base: baseRef.current,
      value: { ...current, notifications: current.notifications.map((n) => (read(n) ? { ...n, unread: false } : n)) },
    });
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      // Shown as read here; the next poll brings the server's view back if the request did not land.
    }
  }, []);

  const markRead = useCallback((id: number) => send({ id }, (n) => n.id === id), [send]);
  const markShownRead = useCallback((upTo: number) => send({ upTo }, (n) => n.id <= upTo), [send]);

  const pausePolling = useCallback((paused: boolean) => {
    pausedRef.current = paused;
  }, []);

  const value: ShellState = {
    data,
    unreadMessages: live.unreadMessages,
    notifications: live.notifications,
    serverNow: live.serverNow,
    refresh,
    markRead,
    markShownRead,
    pausePolling,
  };

  return <ShellContext value={value}>{children}</ShellContext>;
}
