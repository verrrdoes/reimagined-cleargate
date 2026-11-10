import type { ReactNode } from 'react';

export type BarRow = {
  key: string;
  label: ReactNode;
  /** Shown as a tooltip on the label (e.g. a program's full name). */
  title?: string;
  clearances: number;
  cleared: number;
  /** Average clearance progress in percent; null when there are no clearances. */
  avgPercent: number | null;
};

/**
 * One row per group: the label, "N of M cleared", the average progress as text, and a bar under it.
 * The text carries the numbers, so the bar is decorative. A group at 0% shows an empty track.
 */
export function ProgressBars({ rows, empty }: { rows: BarRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col gap-3.5 m-0 p-0 list-none">
      {rows.map((r) => {
        const pct = Math.min(100, Math.max(0, r.avgPercent ?? 0));
        return (
          <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5">
            <span className="min-w-0 font-medium">
              <span title={r.title}>{r.label}</span>
              <span className="ml-2 text-12 font-normal text-muted">{r.clearances > 0 ? `${r.cleared} of ${r.clearances} cleared` : 'No clearances'}</span>
            </span>
            <span className="font-medium tabular-nums">{r.avgPercent === null ? '\u2014' : `${r.avgPercent}%`}</span>
            <span className="col-span-full h-2 rounded-full bg-active overflow-hidden" aria-hidden="true">
              {pct > 0 ? <span className="block h-full rounded-[inherit] bg-accent" style={{ width: `${pct}%` }} /> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
