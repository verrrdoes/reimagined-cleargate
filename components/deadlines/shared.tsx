'use client';

import { useNow } from '@/components/ui/clock';
import { cn } from '@/components/ui/cn';
import { textTone } from '@/components/ui/recipes';
import { dueLine, dueState } from '@/lib/deadline';
import { toLocalInputValue } from '@/lib/time';
import type { ItemStatus } from '@/lib/types';

/** "1 student" / "3 students" */
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** The earliest value a deadline or send-at picker offers: five minutes from now, in Manila time, kept current. */
export function useInputMin(serverNow: string): string {
  const now = useNow(60_000, serverNow);
  return toLocalInputValue(now + 5 * 60_000);
}

/** A datetime-local value for a stored date, or '' when there is none or it has already passed. */
export function futureInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const at = Date.parse(iso);
  return Number.isFinite(at) && at > Date.now() ? toLocalInputValue(at) : '';
}

/**
 * The live deadline state as coloured text ("Overdue by 2 hrs", "3 days left"), for rows that already carry
 * a status pill. Refreshes every 30 seconds.
 */
export function DueText({ due, status, serverNow }: { due: string; status: ItemStatus; serverNow: string }) {
  const now = useNow(30_000, serverNow);
  const state = dueState(due, status, now);
  return (
    <span className={cn('text-12', textTone[state.tone])} title={dueLine(due)}>
      {state.text}
    </span>
  );
}
