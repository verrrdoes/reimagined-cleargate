import Link from 'next/link';
import { STATUS } from '@/lib/constants';
import { formatDate } from '@/lib/time';
import type { ItemStatus } from '@/lib/types';
import { cn } from './cn';
import { Icon } from './Icon';
import { OfficeIcon } from './OfficeIcon';

export type SlipItem = {
  officeCode: string;
  officeName: string;
  icon: string;
  status: ItemStatus;
  /** ISO time the office approved; shown in the stamp. */
  approvedAt?: string | null;
  /** Optional link for the cell (e.g. to that requirement). Full size only. */
  href?: string;
};

const SHORT_NAMES: Record<string, string> = {
  library: 'Library',
  accounting: 'Accounting',
  registrar: 'Registrar',
  guidance: 'Guidance',
  dean: "Dean's Office",
  property: 'Property',
};

/** The slip's layout, also used by the route loading skeleton. `cell` is the base cell, without a status tone. */
export const slipClasses = {
  root: '@container',
  grid: 'grid grid-cols-2 gap-2 m-0 p-0 list-none @min-[480px]:grid-cols-3 @min-[860px]:grid-cols-6',
  item: 'flex min-w-0',
  cell:
    'relative flex flex-auto flex-col gap-2 min-w-0 min-h-32 p-3 border border-border rounded-card bg-surface text-text',
  foot: 'mt-auto',
};

const CELL_TONE: Record<ItemStatus, string> = {
  approved: '',
  pending: 'border-dashed border-control bg-transparent',
  needs_action: 'border-[1.5px] border-action-line',
};

const MINI_CELL_TONE: Record<ItemStatus, string> = {
  approved: 'border-positive bg-positive',
  pending: 'border-dashed',
  needs_action: 'border-[1.5px] border-action-line bg-pill-action-bg',
};

/** The short office name used on the slip ("Guidance Office" → "Guidance"). */
export function slipName(officeCode: string, officeName: string): string {
  return SHORT_NAMES[officeCode] ?? officeName.replace(/\s+Office$/i, '');
}

function slipSummary(items: SlipItem[]): string {
  const approved = items.filter((i) => i.status === 'approved').length;
  const parts = items.map((i) => `${i.officeName} ${STATUS[i.status]?.label.toLowerCase() ?? i.status}`);
  return `${approved} of ${items.length} offices approved. ${parts.join(', ')}.`;
}

function CellBody({ item }: { item: SlipItem }) {
  const name = slipName(item.officeCode, item.officeName);
  return (
    <>
      <span className="flex items-center gap-2 min-w-0 pr-4">
        <OfficeIcon icon={item.icon} size={16} className="text-muted" />
        <span className="font-semibold truncate" title={item.officeName}>
          {name}
        </span>
      </span>
      {item.status === 'needs_action' ? (
        <span className="absolute top-[9px] right-3 text-action-line text-16 font-bold leading-[1.2]" aria-hidden="true">
          !
        </span>
      ) : null}
      <span className={slipClasses.foot}>
        {item.status === 'approved' ? (
          <span
            className={
              'inline-flex flex-col items-start gap-px px-2 py-1 border-[1.5px] border-positive rounded-control ' +
              'text-positive text-12 font-semibold leading-[1.25] -rotate-3 origin-bottom-left'
            }
          >
            <span className="inline-flex items-center gap-1">
              <Icon name="check" size={12} strokeWidth={2.5} />
              Cleared
            </span>
            {item.approvedAt ? (
              <time className="font-medium tabular-nums" dateTime={item.approvedAt}>
                {formatDate(item.approvedAt)}
              </time>
            ) : null}
          </span>
        ) : (
          <span className={cn('text-12 text-muted', item.status === 'needs_action' && 'text-pill-action-fg font-medium')}>
            {STATUS[item.status]?.label ?? 'Pending'}
          </span>
        )}
      </span>
    </>
  );
}

/**
 * The clearance slip: one cell per office. Approved offices carry a stamp with the date, pending ones
 * are a dashed empty cell, and one that needs action is outlined in orange with a "!".
 * `size="mini"` draws six small squares for table rows.
 */
export function ClearanceSlip({
  items,
  size = 'full',
  label = 'Clearance slip',
  className,
}: {
  items: SlipItem[];
  size?: 'full' | 'mini';
  label?: string;
  className?: string;
}) {
  if (size === 'mini') {
    return (
      <span className={cn('inline-flex items-center gap-[3px] align-middle', className)} role="img" aria-label={`${label}: ${slipSummary(items)}`}>
        {items.map((item) => (
          <span
            key={item.officeCode}
            className={cn('size-3.5 border border-control rounded-[3px] bg-transparent', MINI_CELL_TONE[item.status])}
            title={`${item.officeName}: ${STATUS[item.status]?.label ?? item.status}`}
          />
        ))}
      </span>
    );
  }

  return (
    <div className={cn(slipClasses.root, className)}>
      <ol className={slipClasses.grid} aria-label={label}>
        {items.map((item) => (
          <li key={item.officeCode} className={slipClasses.item}>
            {item.href ? (
              <Link href={item.href} className={cn(slipClasses.cell, CELL_TONE[item.status], 'hover:border-muted hover:no-underline')}>
                <CellBody item={item} />
              </Link>
            ) : (
              <div className={cn(slipClasses.cell, CELL_TONE[item.status])}>
                <CellBody item={item} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
