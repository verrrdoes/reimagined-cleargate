import { DueBadge } from '@/components/ui/DueBadge';
import { Icon } from '@/components/ui/Icon';
import { dueLine } from '@/lib/deadline';
import type { StudentItem } from '@/lib/services/student';

/**
 * "Due Mon, Oct 26, 5:00 PM" with the live deadline badge (§10.5), plus the office's note when the
 * deadline is the office one rather than the student's own. Nothing when no deadline applies.
 */
export function DueLine({
  item,
  serverNow,
  showNote = true,
}: {
  item: Pick<StudentItem, 'dueAt' | 'dueOwn' | 'dueNote' | 'status'>;
  serverNow: string;
  showNote?: boolean;
}) {
  if (!item.dueAt) return null;
  const note = showNote && !item.dueOwn && item.dueNote ? item.dueNote : null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-13 text-muted">
      <Icon name="clock" size={14} className="text-muted" />
      <span className="text-text">{dueLine(item.dueAt)}</span>
      <DueBadge due={item.dueAt} status={item.status} serverNow={serverNow} />
      {note ? <span className="basis-full pl-[22px] text-12">{note}</span> : null}
    </p>
  );
}
