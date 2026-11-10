'use client';

import { dueLine, dueState } from '@/lib/deadline';
import type { ItemStatus } from '@/lib/types';
import { useNow } from './clock';
import { cn } from './cn';
import { pill } from './recipes';

/**
 * The deadline pill (§10.5): "Overdue by 2 hrs", "Due in 45 min", "3 days left", "Cleared before Mon, Oct 26".
 * Refreshes every 30 seconds. Renders nothing without a due date.
 */
export function DueBadge({
  due,
  status,
  serverNow,
  className,
}: {
  due: string | null | undefined;
  status: ItemStatus;
  serverNow: string;
  className?: string;
}) {
  const now = useNow(30_000, serverNow);
  if (!due) return null;
  const state = dueState(due, status, now);
  return (
    <span className={cn(pill(state.tone), className)} title={dueLine(due)}>
      {state.text}
    </span>
  );
}
