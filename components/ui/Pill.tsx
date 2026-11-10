import type { ReactNode } from 'react';
import { STATUS } from '@/lib/constants';
import type { ItemStatus } from '@/lib/types';
import { cn } from './cn';
import { pill } from './recipes';

export type PillTone = 'action' | 'pending' | 'approved' | 'overdue' | 'info' | 'muted';

const TONES: readonly string[] = ['action', 'pending', 'approved', 'overdue', 'info', 'muted'];

/** Normalises a tone string (also accepts the SUBMISSION_BADGE tones) to a pill tone. */
export function pillTone(tone: string | null | undefined): PillTone {
  return tone && TONES.includes(tone) ? (tone as PillTone) : 'muted';
}

export function Pill({
  tone = 'muted',
  children,
  className,
  title,
}: {
  tone?: PillTone | string;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cn(pill(pillTone(tone)), className)} title={title}>
      {children}
    </span>
  );
}

/** The item status pill: Needs action (orange), Pending (amber), Approved (green). */
export function StatusPill({ status, className }: { status: ItemStatus; className?: string }) {
  const s = STATUS[status] ?? STATUS.pending;
  return (
    <Pill tone={s.tone} className={className}>
      {s.label}
    </Pill>
  );
}
