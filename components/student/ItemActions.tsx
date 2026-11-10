'use client';

import { Icon } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import { button, countBadge } from '@/components/ui/recipes';
import { useStudentItem } from './StudentDialogs';
import { uploadLabel } from './format';

type Action = 'upload' | 'chat' | 'details';

/** Below 640px the buttons share the row. */
const GROW = 'max-sm:flex-auto';
const COUNT = cn(countBadge, 'min-w-[18px] h-[18px] px-[5px] text-11');

/**
 * The buttons for one item: upload (labelled per §8.4, hidden once approved), message the office
 * (with the unread count) and the office details. Needs <StudentDialogs> above it.
 */
export function ItemActions({
  itemId,
  show = ['upload', 'chat', 'details'],
  size = 'sm',
  className,
}: {
  itemId: number;
  show?: Action[];
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { item, open } = useStudentItem(itemId);
  if (!item) return null;

  const label = show.includes('upload') ? uploadLabel(item) : null;
  const unread = item.messages.unread;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {label ? (
        <button
          type="button"
          className={cn(button({ variant: item.status === 'needs_action' ? 'primary' : 'default', size }), GROW)}
          onClick={() => open('upload', item.itemId)}
        >
          <Icon name="upload" size={14} />
          {label}
          <span className="sr-only"> for {item.officeName}</span>
        </button>
      ) : null}
      {show.includes('chat') ? (
        <button type="button" className={cn(button({ size }), GROW)} onClick={() => open('chat', item.itemId)}>
          <Icon name="message" size={14} />
          Message office
          <span className="sr-only"> ({item.officeName})</span>
          {unread > 0 ? (
            <span className={COUNT}>
              {unread}
              <span className="sr-only"> unread</span>
            </span>
          ) : null}
        </button>
      ) : null}
      {show.includes('details') ? (
        <button
          type="button"
          className={cn(button({ variant: 'ghost', size }), GROW)}
          onClick={() => open('details', item.itemId)}
        >
          <Icon name="info" size={14} />
          Details
          <span className="sr-only"> for {item.officeName}</span>
        </button>
      ) : null}
    </div>
  );
}
