'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, type MouseEvent } from 'react';
import { cn } from '@/components/ui/cn';
import { Icon, type IconName } from '@/components/ui/Icon';
import { OfficeIcon } from '@/components/ui/OfficeIcon';
import { useNow } from '@/components/ui/clock';
import { iconButton, linkButton, popover, popoverAnchor, popoverHead, textTone } from '@/components/ui/recipes';
import { timeAgo } from '@/lib/time';
import type { NotificationView, Tone } from '@/lib/types';
import { useShell } from './ShellContext';
import { usePopover } from './usePopover';

const TONE_CLASS: Record<Tone, string> = {
  needs_action: textTone.action,
  pending: textTone.pending,
  approved: textTone.approved,
  info: textTone.info,
};

const NOTIF =
  'grid grid-cols-[16px_minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 w-full px-3 py-2.5 border-0 rounded-control ' +
  'bg-transparent text-text [font:inherit] text-left no-underline';
/** Links and buttons (not the plain read rows) react to the pointer. */
const NOTIF_ACTIVE = 'cursor-pointer hover:bg-raised hover:no-underline';

/** §8.7: by link first, then the office's icon, then the title. */
function NotificationIcon({ n }: { n: NotificationView }) {
  const cls = cn('row-[1/span_2] mt-0.5', TONE_CLASS[n.tone] ?? textTone.muted);
  const link = n.link ?? '';
  let name: IconName | null = null;
  if (link.startsWith('/review')) name = 'upload';
  else if (link.startsWith('/messages')) name = 'message';
  else if (link.startsWith('/applications')) name = 'user';
  else if (link.startsWith('/deadlines')) name = 'clock';
  if (!name && n.officeIcon) return <OfficeIcon icon={n.officeIcon} size={16} className={cls} />;
  if (!name) name = /deadline|due|overdue/i.test(n.title) ? 'clock' : 'shield';
  return <Icon name={name} size={16} className={cls} />;
}

export function Bell() {
  const { notifications, serverNow, markRead, pausePolling } = useShell();
  const { open, setOpen, wrapRef, buttonRef } = usePopover();
  const router = useRouter();
  const panelId = useId();
  const now = useNow(30_000, serverNow);
  const unread = notifications.filter((n) => n.unread).length;

  useEffect(() => {
    pausePolling(open);
  }, [open, pausePolling]);

  function follow(e: MouseEvent<HTMLAnchorElement>, n: NotificationView) {
    const link = n.link;
    if (!link) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      // Opening in a new tab: mark it read and let the browser follow the link.
      if (n.unread) void markRead(n.id);
      return;
    }
    e.preventDefault();
    setOpen(false);
    // Navigate even when marking it read fails.
    void (n.unread ? markRead(n.id) : Promise.resolve()).finally(() => router.push(link));
  }

  return (
    <div className={popoverAnchor} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={iconButton()}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" size={18} />
        {unread > 0 ? (
          <span
            className={
              'absolute top-0.5 right-px min-w-4 h-4 px-1 rounded-full bg-negative text-on-negative text-10 font-semibold ' +
              'leading-4 text-center tabular-nums'
            }
            aria-hidden="true"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div id={panelId} className={popover} role="region" aria-label="Notifications">
          <div className={popoverHead}>
            <h2>Notifications</h2>
            {unread > 0 ? (
              <button type="button" className={linkButton} onClick={() => void markRead()}>
                Mark all read
              </button>
            ) : null}
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-muted">No notifications yet.</p>
          ) : (
            <ul className="max-h-[min(480px,70svh)] m-0 p-1 overflow-y-auto list-none">
              {notifications.map((n) => {
                const inner = (
                  <>
                    <NotificationIcon n={n} />
                    <span className={cn('min-w-0', n.unread ? 'font-semibold' : 'font-normal')}>
                      {n.title}
                      {n.unread ? (
                        <>
                          <span className="inline-block size-1.5 ml-1.5 rounded-full bg-accent align-middle" aria-hidden="true" />
                          <span className="sr-only"> (unread)</span>
                        </>
                      ) : null}
                    </span>
                    <time className="text-12 text-muted whitespace-nowrap" dateTime={n.createdAt}>
                      {timeAgo(n.createdAt, now)}
                    </time>
                    {n.body ? <span className="col-[2/span_2] text-13 text-muted wrap-anywhere">{n.body}</span> : null}
                  </>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <a href={n.link} className={cn(NOTIF, NOTIF_ACTIVE)} onClick={(e) => follow(e, n)}>
                        {inner}
                      </a>
                    ) : n.unread ? (
                      <button type="button" className={cn(NOTIF, NOTIF_ACTIVE)} onClick={() => void markRead(n.id)}>
                        {inner}
                      </button>
                    ) : (
                      <div className={NOTIF}>{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
