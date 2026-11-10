import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { formatDateTime } from '@/lib/time';
import type { StudentSubmission } from '@/lib/services/student';
import { submissionFileUrl } from './format';

const LINE = 'flex items-start gap-1.5 text-13 text-muted wrap-anywhere';
const ICON = 'mt-[3px]';

/**
 * One line about the latest file for an item (legacy evidenceLine): sent and waiting, returned with
 * the reason, or approved. Nothing when no file has been sent.
 */
export function EvidenceLine({ submission }: { submission: StudentSubmission | null }) {
  if (!submission) return null;
  const s = submission;

  if (s.status === 'returned') {
    const reason = [s.returnCategory, s.reviewNote].filter(Boolean).join('. ');
    return (
      <p className={cn(LINE, 'text-action-line')}>
        <Icon name="alert" size={14} className={ICON} />
        <span>
          Returned{s.reviewedAt ? ` ${formatDateTime(s.reviewedAt)}` : ''}
          {reason ? `: ${reason}` : ''}
        </span>
      </p>
    );
  }

  if (s.status === 'approved') {
    return (
      <p className={LINE}>
        <Icon name="check" size={14} className={cn(ICON, 'text-positive')} />
        <span>
          Evidence{' '}
          <a href={submissionFileUrl(s.id)} target="_blank" rel="noopener noreferrer">
            {s.fileName}
          </a>{' '}
          approved{s.reviewedAt ? ` ${formatDateTime(s.reviewedAt)}` : ''}
        </span>
      </p>
    );
  }

  if (s.status === 'submitted') {
    return (
      <p className={LINE}>
        <Icon name="paperclip" size={14} className={ICON} />
        <span>
          Evidence{' '}
          <a href={submissionFileUrl(s.id)} target="_blank" rel="noopener noreferrer">
            {s.fileName}
          </a>{' '}
          sent {formatDateTime(s.submittedAt)} · waiting for review
        </span>
      </p>
    );
  }

  return null;
}
