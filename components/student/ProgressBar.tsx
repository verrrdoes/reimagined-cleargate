import { cn } from '@/components/ui/cn';
import { progress, progressBar } from '@/components/ui/recipes';
import type { StudentClearanceSummary } from '@/lib/services/student';

/** The clearance progress bar: the share of offices that have cleared the student. */
export function ProgressBar({ clearance, className }: { clearance: StudentClearanceSummary; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(clearance.percentComplete)));
  return (
    <div
      className={cn(progress, 'w-full', className)}
      role="progressbar"
      aria-label="Clearance progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${clearance.approvedCount} of ${clearance.totalOffices} offices cleared (${pct}%)`}
    >
      <div className={progressBar} style={{ width: `${pct}%` }} />
    </div>
  );
}
