'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { button, fieldError, textarea } from '@/components/ui/recipes';
import { formatDateTime, formatTime, manilaYmd } from '@/lib/time';
import type { ChatViewer } from './types';
import type { LiveMessage } from './useConversation';

const LOG =
  'flex-auto min-h-[200px] overflow-y-auto overscroll-contain flex flex-col gap-3 pt-1 px-0.5 pb-3 ' +
  'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 focus-visible:rounded-control';
const EMPTY = 'mx-0 my-auto px-4 py-6 text-muted text-center max-w-[52ch] self-center';
const BUBBLE = 'max-w-[min(78%,520px)] self-start px-3 py-2 rounded-card bg-raised text-text max-sm:max-w-[88%]';
const INPUT = cn(textarea, 'flex-auto min-h-14 max-h-40 resize-none');
const SEND = cn(button({ variant: 'primary' }), 'flex-none max-sm:px-2.5');

function when(iso: string): string {
  return manilaYmd(iso) === manilaYmd(new Date()) ? formatTime(iso) : formatDateTime(iso);
}

/**
 * The message log and composer, shared by the chat dialog and the Messages page.
 * Bubbles from your side sit on the right; "Seen" shows under your side's latest message once it is read.
 * Enter sends, Shift+Enter adds a new line.
 */
export function ChatThread({
  viewer,
  messages,
  loading,
  error,
  sending,
  sendError,
  emptyText,
  onSend,
  autoFocus = false,
  className,
}: {
  viewer: ChatViewer;
  messages: LiveMessage[];
  loading: boolean;
  error: string | null;
  sending: boolean;
  sendError: string | null;
  emptyText: string;
  onSend: (text: string) => Promise<boolean>;
  autoFocus?: boolean;
  className?: string;
}) {
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(-1);
  const inputId = useId();
  const errorId = useId();

  // Stay at the bottom when a message arrives, or when the reader was already near it.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    if (messages.length !== lastCount.current || nearBottom) log.scrollTop = log.scrollHeight;
    lastCount.current = messages.length;
  }, [messages]);

  let lastOwn = -1;
  messages.forEach((m, i) => {
    if (m.from === viewer) lastOwn = i;
  });

  async function submit() {
    const value = text.trim();
    if (!value || sending) return;
    setText('');
    const sent = await onSend(value);
    if (!sent) setText((current) => (current === '' ? value : current));
  }

  return (
    <div className={cn('flex flex-col min-h-0 h-full', className)}>
      <div ref={logRef} className={LOG} role="log" aria-live="polite" aria-label="Messages" tabIndex={0}>
        {loading && messages.length === 0 ? (
          <p className={EMPTY}>Loading messages…</p>
        ) : error && messages.length === 0 ? (
          <p className={EMPTY} role="alert">
            {error}
          </p>
        ) : messages.length === 0 ? (
          <p className={EMPTY}>{emptyText}</p>
        ) : (
          messages.map((m, i) => {
            const own = m.from === viewer;
            return (
              <div key={m.id} className={cn(BUBBLE, own && 'self-end bg-pill-info-bg', m.sending && 'opacity-70')}>
                <p className="text-12 text-muted mb-0.5">
                  <span className="font-medium text-text">{m.mine ? 'You' : m.senderName}</span>
                  <span aria-hidden="true"> · </span>
                  {m.sending ? <span>Sending…</span> : <time dateTime={m.createdAt}>{when(m.createdAt)}</time>}
                </p>
                <p className="whitespace-pre-wrap wrap-anywhere leading-normal">{m.body}</p>
                {i === lastOwn && m.readAt ? <p className="mt-1 text-12 text-muted text-right">Seen</p> : null}
              </div>
            );
          })
        )}
      </div>

      <form
        className="flex-none pt-3 border-t border-rule"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {sendError ? (
          <p id={errorId} className={cn(fieldError, 'mb-2')} role="alert">
            {sendError}
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <label htmlFor={inputId} className="sr-only">
            Your message
          </label>
          <textarea
            id={inputId}
            className={INPUT}
            rows={2}
            maxLength={1000}
            placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
            value={text}
            data-autofocus={autoFocus ? true : undefined}
            aria-describedby={sendError ? errorId : undefined}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <button type="submit" className={SEND} disabled={sending || text.trim() === ''}>
            <Icon name="send" size={16} />
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
