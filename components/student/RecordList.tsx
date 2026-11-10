import type { StudentRecord } from '@/lib/services/officeRecords';
import { formatDate } from '@/lib/time';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { textTone } from '@/components/ui/recipes';

/**
 * What the office has on record against the student (borrowed books, balances, incomplete grades...): the open ones
 * to settle, then the settled ones, struck through with when.
 */
export function RecordList({ records, className }: { records: StudentRecord[]; className?: string }) {
  if (!records.length) return null;
  return (
    <ul className={cn('flex flex-col gap-1 m-0 p-0 list-none text-13', className)} aria-label="On record with this office">
      {records.map((r) => {
        const settled = r.settledAt !== null;
        return (
          <li key={r.id} className="flex items-start gap-2">
            <Icon
              name={settled ? 'check' : 'alert'}
              size={14}
              className={cn('mt-[3px] shrink-0', settled ? textTone.approved : textTone.action)}
            />
            <span className="min-w-0 wrap-anywhere">
              <span className={settled ? 'text-muted line-through decoration-1' : 'font-medium'}>{r.main}</span>
              {r.details.length ? <span className="text-muted"> · {r.details.join(' · ')}</span> : null}
              {settled ? (
                <span className={textTone.approved}>
                  {' '}
                  · {r.settledWord} {formatDate(r.settledAt!)}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
