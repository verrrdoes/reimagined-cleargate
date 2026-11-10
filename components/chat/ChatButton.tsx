'use client';

import { useState } from 'react';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { button, countBadge } from '@/components/ui/recipes';
import { ChatDialog } from './ChatDialog';
import type { ChatViewer } from './types';

/**
 * A button that opens the conversation for one requirement.
 * With `iconOnly` it shows just the message icon and uses `label` as its accessible name.
 */
export function ChatButton({
  itemId,
  viewer,
  label,
  className,
  iconOnly = false,
  unread = 0,
}: {
  itemId: number;
  viewer: ChatViewer;
  label: string;
  className?: string;
  iconOnly?: boolean;
  unread?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={cn(button({ size: 'sm' }), className)}
        onClick={() => setOpen(true)}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
      >
        <Icon name="message" size={16} />
        {iconOnly ? null : label}
        {unread > 0 ? (
          <span className={countBadge}>
            {unread}
            <span className="sr-only"> unread</span>
          </span>
        ) : null}
      </button>
      <ChatDialog itemId={itemId} open={open} onClose={() => setOpen(false)} viewer={viewer} />
    </>
  );
}
