'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useShell } from '@/components/shell/ShellContext';
import type { ChatMessage, ChatViewer, Conversation } from './types';

const POLL_MS = 10_000;

/** A message on screen: the server's, or one still being sent. */
export type LiveMessage = ChatMessage & { sending?: boolean };

type Envelope = { ok: true; data: Conversation } | { ok: false; error: { code: string; message: string } };

async function call(input: RequestInfo, init?: RequestInit): Promise<Conversation> {
  let res: Response;
  try {
    res = await fetch(input, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
      headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}) },
    });
  } catch {
    throw new Error('You appear to be offline. Check your connection and try again.');
  }
  let body: Envelope | null = null;
  try {
    body = (await res.json()) as Envelope;
  } catch {
    body = null;
  }
  if (body && body.ok) return body.data;
  throw new Error(body && !body.ok ? body.error.message : 'Something went wrong.');
}

type State = { key: number | null; data: Conversation | null; error: string | null };

/**
 * One item's office conversation (§8.6). While `itemId` is set it loads GET /api/messages, then polls every
 * 10 s while the tab is visible. `send()` appends the message at once and replaces it with the server's
 * thread when the POST returns. When a load marks messages read, the shell's badge is refreshed and
 * `onActivity` runs (the Messages page uses it to refresh its list).
 */
export function useConversation(itemId: number | null, viewer: ChatViewer, onActivity?: () => void) {
  const { refresh } = useShell();
  const [state, setState] = useState<State>({ key: null, data: null, error: null });
  const [outbox, setOutbox] = useState<{ key: number; message: LiveMessage }[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<{ key: number; message: string } | null>(null);

  const keyRef = useRef(itemId);
  const activityRef = useRef(onActivity);
  const seqRef = useRef(0);
  useEffect(() => {
    keyRef.current = itemId;
    activityRef.current = onActivity;
  });

  const accept = useCallback(
    (key: number, data: Conversation) => {
      if (keyRef.current !== key) return;
      setState({ key, data, error: null });
      if (data.markedRead > 0) {
        void refresh();
        activityRef.current?.();
      }
    },
    [refresh],
  );

  const load = useCallback(
    async (key: number) => {
      const seq = ++seqRef.current;
      try {
        const data = await call(`/api/messages?itemId=${key}`);
        if (seq === seqRef.current) accept(key, data);
      } catch (e) {
        if (seq !== seqRef.current || keyRef.current !== key) return;
        const message = e instanceof Error ? e.message : 'Something went wrong.';
        // Keep showing the last good thread; the next poll tries again.
        setState((s) => (s.key === key && s.data ? s : { key, data: null, error: message }));
      }
    },
    [accept],
  );

  useEffect(() => {
    if (itemId === null) return;
    void load(itemId);
    const timer = setInterval(() => {
      if (!document.hidden) void load(itemId);
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void load(itemId);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [itemId, load]);

  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const key = keyRef.current;
      const body = text.trim();
      if (key === null || body === '') return false;
      const temp: LiveMessage = {
        id: -Date.now(),
        from: viewer,
        senderName: 'You',
        mine: true,
        body,
        createdAt: new Date().toISOString(),
        readAt: null,
        sending: true,
      };
      setOutbox((o) => [...o, { key, message: temp }]);
      setSending(true);
      setSendError(null);
      try {
        const data = await call('/api/messages', { method: 'POST', body: JSON.stringify({ itemId: key, body }) });
        seqRef.current++; // a poll that started before the send must not overwrite this newer thread
        accept(key, data);
        activityRef.current?.();
        return true;
      } catch (e) {
        setSendError({ key, message: e instanceof Error ? e.message : 'Something went wrong.' });
        return false;
      } finally {
        setOutbox((o) => o.filter((m) => m.message.id !== temp.id));
        setSending(false);
      }
    },
    [accept, viewer],
  );

  const current = state.key === itemId ? state : null;
  const messages: LiveMessage[] = [
    ...(current?.data?.messages ?? []),
    ...outbox.filter((m) => m.key === itemId).map((m) => m.message),
  ];

  return {
    data: current?.data ?? null,
    messages,
    loading: itemId !== null && !current,
    error: current?.error ?? null,
    sending,
    sendError: sendError && sendError.key === itemId ? sendError.message : null,
    send,
    reload: () => (itemId === null ? Promise.resolve() : load(itemId)),
  };
}
