import { cn } from '@/components/ui/cn';

/**
 * The student pages' layout, shared by the pages and their loading skeleton. Base look only: the per-status
 * tones are separate maps next to where they are used.
 */
export const studentLayout = {
  /** Dashboard progress panel (with panel()): the figures beside the slip; stacked below 1024px. */
  summary: 'grid grid-cols-[minmax(220px,280px)_minmax(0,1fr)] gap-6 items-center p-5 max-lg:grid-cols-1 max-sm:p-4',
  summaryFigures: 'flex flex-col gap-2 min-w-0',
  summarySlip: 'min-w-0',
  /** The current task beside the next deadline; one column below 1024px. */
  now: 'grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 items-stretch mt-6 max-lg:grid-cols-1',
  /** Three across, so the six offices make two even rows instead of five and a straggler. */
  tiles: 'grid grid-cols-3 gap-4 m-0 p-0 list-none max-lg:grid-cols-2 max-sm:grid-cols-1',
  tile: 'flex flex-col gap-2 min-w-0 p-4 border border-border rounded-card bg-surface',
  tileHead: 'flex items-center gap-2.5 min-w-0',
  tileIcon: 'inline-grid place-items-center size-8 rounded-control bg-raised text-muted shrink-0',
  checklist: 'm-0 p-0 list-none',
  check: 'grid grid-cols-[24px_minmax(0,1fr)] gap-3 py-4 border-t border-rule first:border-t-0 first:pt-1',
  checkMark:
    'inline-grid place-items-center size-[22px] mt-px rounded-full border-[1.5px] border-dashed border-control ' +
    'text-13 font-bold leading-none',
  checkBody: 'flex flex-col gap-1.5 min-w-0',
};

const DOT_TONE = {
  approved: 'bg-positive',
  pending: 'bg-warning',
  action: 'bg-action-line',
} as const;

/** The small coloured dot before each status count. */
export function statusDot(tone: keyof typeof DOT_TONE): string {
  return cn('inline-block size-2 rounded-full bg-control shrink-0', DOT_TONE[tone]);
}
