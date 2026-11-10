'use client';

import { Dialog, DueBadge, Icon, OfficeIcon, Pill, StatusPill } from '@/components/ui';
import { button, countBadge, kv, mono } from '@/components/ui/recipes';
import { SUBMISSION_BADGE } from '@/lib/constants';
import { dueLine } from '@/lib/deadline';
import type { StudentItem } from '@/lib/services/student';
import { formatDate, formatDateTime } from '@/lib/time';
import { fileKind, fileSize, nextStepText, submissionFileUrl, uploadLabel } from './format';

const BLOCK =
  'flex flex-col gap-2 py-4 border-t border-rule min-w-0 wrap-anywhere first:border-t-0 first:pt-0 last:pb-0';
const HEADING = 'text-12 font-medium text-muted';
const QUOTE = 'block mt-1 pl-2.5 border-l-2 border-border text-muted';
const CLUSTER = 'flex flex-wrap items-center gap-2';
const NOTE = 'text-muted text-12';

/**
 * Everything about one office's item: its status and remarks, what the office needs, the deadline,
 * the latest file sent and how to reach the office.
 */
export function OfficeDetailsDialog({
  item,
  serverNow,
  open,
  onClose,
  onUpload,
  onMessage,
}: {
  item: StudentItem;
  serverNow: string;
  open: boolean;
  onClose: () => void;
  onUpload: () => void;
  onMessage: () => void;
}) {
  const label = uploadLabel(item);
  const s = item.submission;
  const badge = s ? SUBMISSION_BADGE[s.status] : null;
  const unread = item.messages.unread;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="inline-flex items-center gap-2">
          <OfficeIcon icon={item.officeIcon} size={18} className="text-muted" />
          {item.officeName}
        </span>
      }
      description={item.task}
      footer={
        <>
          <button type="button" className={button()} onClick={onClose}>
            Close
          </button>
          <button type="button" className={button()} onClick={onMessage}>
            <Icon name="message" size={16} />
            Message office
            {unread > 0 ? (
              <span className={countBadge}>
                {unread}
                <span className="sr-only"> unread</span>
              </span>
            ) : null}
          </button>
          {label ? (
            <button type="button" className={button({ variant: 'primary' })} onClick={onUpload} data-autofocus>
              <Icon name="upload" size={16} />
              {label}
            </button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col">
        <section className={BLOCK} aria-labelledby={`stu-details-status-${item.itemId}`}>
          <h3 id={`stu-details-status-${item.itemId}`} className={HEADING}>
            Status
          </h3>
          <div className={CLUSTER}>
            <StatusPill status={item.status} />
            <span className={NOTE}>
              {item.status === 'approved' && item.approvedAt
                ? `Cleared ${formatDateTime(item.approvedAt)}`
                : `Updated ${formatDateTime(item.updatedAt)}`}
            </span>
          </div>
          {item.remarks ? <p>{item.remarks}</p> : null}
        </section>

        <section className={BLOCK} aria-labelledby={`stu-details-needs-${item.itemId}`}>
          <h3 id={`stu-details-needs-${item.itemId}`} className={HEADING}>
            What the office needs
          </h3>
          <p className="font-medium">{item.task}</p>
          {item.description ? <p className="text-muted">{item.description}</p> : null}
          {item.status !== 'approved' ? (
            <p className="flex items-start gap-1.5">
              <Icon name="arrow" size={14} className="mt-[3px] text-muted" />
              <span>
                <span className="sr-only">Next step: </span>
                {nextStepText(item)}
              </span>
            </p>
          ) : null}
        </section>

        <section className={BLOCK} aria-labelledby={`stu-details-due-${item.itemId}`}>
          <h3 id={`stu-details-due-${item.itemId}`} className={HEADING}>
            Deadline
          </h3>
          {item.dueAt ? (
            <>
              <p className={CLUSTER}>
                <span>{dueLine(item.dueAt)}</span>
                <DueBadge due={item.dueAt} status={item.status} serverNow={serverNow} />
              </p>
              {item.dueOwn ? (
                <p className={NOTE}>
                  {item.officeName} set this deadline for you.
                  {item.officeDueAt ? ` The office deadline for everyone is ${formatDateTime(item.officeDueAt)}.` : ''}
                </p>
              ) : (
                <p className={NOTE}>This is the {item.officeName} deadline for the term.</p>
              )}
              {!item.dueOwn && item.dueNote ? <p className={QUOTE}>{item.dueNote}</p> : null}
            </>
          ) : (
            <p className="text-muted">No deadline set.</p>
          )}
        </section>

        <section className={BLOCK} aria-labelledby={`stu-details-file-${item.itemId}`}>
          <h3 id={`stu-details-file-${item.itemId}`} className={HEADING}>
            Latest evidence
          </h3>
          {s && badge ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5 px-3 py-2.5 border border-border rounded-control max-sm:flex-wrap">
                <Icon name="paperclip" size={16} className="text-muted" />
                <div className="flex flex-col flex-auto min-w-0">
                  <a className="font-medium wrap-anywhere" href={submissionFileUrl(s.id)} target="_blank" rel="noopener noreferrer">
                    {s.fileName}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  <span className={NOTE}>
                    {fileKind(s.mimeType)} · {fileSize(s.fileSize)} · sent {formatDateTime(s.submittedAt)}
                  </span>
                </div>
                <a className={button({ variant: 'ghost', size: 'sm' })} href={submissionFileUrl(s.id, true)} download>
                  <Icon name="download" size={14} />
                  Download
                </a>
              </div>
              <dl className={kv}>
                <dt>Review</dt>
                <dd>
                  <Pill tone={badge.tone}>{badge.label}</Pill>
                </dd>
                {s.reference ? (
                  <>
                    <dt>Reference</dt>
                    <dd className={mono}>{s.reference}</dd>
                  </>
                ) : null}
                {s.note ? (
                  <>
                    <dt>Your note</dt>
                    <dd>{s.note}</dd>
                  </>
                ) : null}
                {s.status === 'returned' ? (
                  <>
                    <dt>Returned</dt>
                    <dd>
                      {s.reviewedAt ? formatDateTime(s.reviewedAt) : 'Returned'}
                      {s.returnCategory ? (
                        <span className="block mt-0.5 text-action-line font-medium">{s.returnCategory}</span>
                      ) : null}
                      {s.reviewNote ? <span className={QUOTE}>{s.reviewNote}</span> : null}
                    </dd>
                  </>
                ) : null}
                {s.status === 'approved' && s.reviewedAt ? (
                  <>
                    <dt>Approved</dt>
                    <dd>{formatDateTime(s.reviewedAt)}</dd>
                  </>
                ) : null}
              </dl>
            </div>
          ) : (
            <p className="text-muted">
              {item.status === 'approved' ? 'No file was needed.' : 'You have not sent a file for this office yet.'}
            </p>
          )}
        </section>

        <section className={BLOCK} aria-labelledby={`stu-details-contact-${item.itemId}`}>
          <h3 id={`stu-details-contact-${item.itemId}`} className={HEADING}>
            Contact
          </h3>
          <dl className={kv}>
            <dt>Email</dt>
            <dd>{item.email ? <a href={`mailto:${item.email}`}>{item.email}</a> : <span className="text-muted">Not listed</span>}</dd>
            <dt>Office hours</dt>
            <dd>{item.hours || <span className="text-muted">Not listed</span>}</dd>
            {item.status === 'approved' && item.approvedAt ? (
              <>
                <dt>Cleared on</dt>
                <dd>{formatDate(item.approvedAt)}</dd>
              </>
            ) : null}
          </dl>
        </section>
      </div>
    </Dialog>
  );
}
