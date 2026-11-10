'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { reviewSubmission } from '@/lib/actions/review';
import { RETURN_REASONS, SUBMISSION_BADGE } from '@/lib/constants';
import { formatDateTime } from '@/lib/time';
import type { ItemStatus } from '@/lib/types';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import {
  alert,
  alertBody,
  backLink,
  button,
  check,
  field,
  fieldHint,
  fieldLabel,
  formActions,
  iconButton,
  kv,
  mono,
  pageHead,
  pageHeadActions,
  pageHeadSub,
  panel,
  panelSub,
  select,
  spinner,
  tableSecondary,
  textarea,
  textTone,
} from '@/components/ui/recipes';
import { ChatButton } from '@/components/chat/ChatButton';
import { fileKind, fileSize, isImage, ordinal, submissionFileUrl } from './format';
import type { ReviewOutcome, SubmissionDetail } from './types';

type Mode = 'review' | 'approve' | 'return' | 'done';

const NEXT_STEP = 'Fix the issue, then upload a corrected file from your clearance page.';

/** Item status words on the decision record (legacy LABEL). */
const ITEM_LABEL: Record<ItemStatus, string> = { needs_action: 'Needs action', pending: 'Pending review', approved: 'Approved' };

const SECTION_TITLE = 'text-16 font-semibold leading-[1.4]';
const FINE = 'flex items-center gap-1.5 text-12 text-muted';
const PANEL_STACK = cn(panel(), 'flex flex-col gap-4');
const REVIEW_GRID = 'grid grid-cols-[minmax(0,1fr)_360px] gap-6 items-start max-lg:grid-cols-[minmax(0,1fr)]';
const LIST_COLUMN = 'm-0 p-0 list-none flex flex-col gap-2.5';
const CHECK_LABEL = cn(check, 'items-start leading-[1.4]');
const TICK_ICON = cn('flex-none mt-0.5', textTone.approved);
const ACTIVITY_ITEM = 'flex items-start gap-2.5';
const ACTIVITY_ICON = 'flex-none mt-0.5 text-muted';

const NOTIF_PREVIEW = cn(panel(), 'flex flex-col gap-3');
const NOTIF_PREVIEW_SUB = cn(panelSub, '-mt-2');
const NOTIF_BOX = 'flex flex-col gap-1 p-3 border border-border rounded-card bg-raised wrap-anywhere';
const NOTIF_TITLE: Record<'approve' | 'return', string> = {
  approve: 'font-semibold text-positive',
  return: 'font-semibold text-action-line',
};
const NOTIF_LABEL = 'mt-1.5 text-12 font-semibold text-muted';

function SubmissionPill({ status, resubmitted }: { status: SubmissionDetail['status']; resubmitted?: boolean }) {
  const badge = status === 'submitted' && resubmitted ? SUBMISSION_BADGE.resubmitted : SUBMISSION_BADGE[status];
  return <Pill tone={badge.tone}>{badge.label}</Pill>;
}

function Person({ s }: { s: SubmissionDetail }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar name={s.student.name} size={40} />
      <div className="min-w-0">
        <p className="font-semibold">{s.student.name}</p>
        <p className="text-muted text-13">
          <span className={mono}>{s.student.number}</span> · {s.student.programName} · {ordinal(s.student.yearLevel)} year
        </p>
      </div>
    </div>
  );
}

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-2">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-12 text-muted">{label}</dt>
          <dd className="wrap-anywhere">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Evidence({ s }: { s: SubmissionDetail }) {
  const url = submissionFileUrl(s.id);
  return (
    <section className={cn(panel(), 'min-w-0')} aria-labelledby="evidence-title">
      <h2 id="evidence-title" className={SECTION_TITLE}>
        Submitted evidence
      </h2>
      <div className="flex items-center gap-3 mt-3">
        <Icon name={isImage(s.mimeType) ? 'image' : 'file'} size={20} className="flex-none text-muted" />
        <div className="flex-auto min-w-0">
          <p className="font-medium wrap-anywhere">{s.fileName}</p>
          <p className="text-12 text-muted">
            {fileKind(s.mimeType)} · {fileSize(s.fileSize)} · Uploaded {formatDateTime(s.submittedAt)}
          </p>
        </div>
        <a className={iconButton()} href={submissionFileUrl(s.id, true)} aria-label={`Download ${s.fileName}`} title="Download">
          <Icon name="download" size={16} />
        </a>
        <a className={iconButton()} href={url} target="_blank" rel="noopener" aria-label={`Open ${s.fileName} in a new tab`} title="Open in a new tab">
          <Icon name="link-out" size={16} />
        </a>
      </div>
      {s.note ? (
        <p className="mt-3 px-3 py-2.5 rounded-card bg-raised wrap-anywhere whitespace-pre-wrap">
          <span className="font-semibold">Student note:</span> {s.note}
        </p>
      ) : null}
      <div className="mt-3 border border-border rounded-card bg-raised overflow-hidden">
        {isImage(s.mimeType) ? (
          // An authenticated file route, so the image optimiser (which has no session) cannot fetch it.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="block max-w-full max-h-[min(72svh,760px)] mx-auto object-contain" src={url} alt={`Evidence uploaded by ${s.student.name}`} />
        ) : (
          <iframe className="block w-full h-[min(72svh,760px)] border-0 bg-surface max-sm:h-[60svh]" src={`${url}#toolbar=0&view=FitH`} title={`Preview of ${s.fileName}`} />
        )}
      </div>

      {s.history.length ? (
        <div className="mt-6">
          <h3 className="text-14 font-semibold mb-1">Earlier submissions for this requirement</h3>
          <ul className="m-0 p-0 list-none">
            {s.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 border-t border-rule">
                <div className="flex-[1_1_240px] min-w-0 wrap-anywhere">
                  <p>
                    <span className={mono}>{h.reference}</span> · {h.fileName}
                  </p>
                  <p className={tableSecondary}>
                    {formatDateTime(h.submittedAt)}
                    {h.reviewer ? ` · ${h.reviewer}` : ''}
                  </p>
                  {h.reviewNote ? (
                    <p className="mt-1 text-muted text-13">
                      {h.returnCategory ? `${h.returnCategory}: ` : ''}
                      {h.reviewNote}
                    </p>
                  ) : null}
                </div>
                <SubmissionPill status={h.status} />
                <Link href={`/review/${h.id}`} className="font-medium">
                  View<span className="sr-only"> {h.reference}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function NotificationPreview({ kind, s, reason }: { kind: 'approve' | 'return'; s: SubmissionDetail; reason: string }) {
  const office = s.office.name;
  return (
    <aside className={NOTIF_PREVIEW} aria-labelledby="preview-title">
      <h2 id="preview-title" className={SECTION_TITLE}>
        Student notification preview
      </h2>
      <p className={NOTIF_PREVIEW_SUB}>{kind === 'approve' ? 'Sent after you confirm approval' : 'Sent after you confirm the return'}</p>
      <div className={NOTIF_BOX}>
        <p className={NOTIF_TITLE[kind]}>{kind === 'approve' ? `${office} cleared you` : `${office} needs action`}</p>
        {kind === 'approve' ? (
          <p>{office} has cleared your account.</p>
        ) : (
          <>
            <p className={NOTIF_LABEL}>What to fix</p>
            <p className="whitespace-pre-wrap">{reason.trim() || 'Your reason will appear here.'}</p>
            <p className={NOTIF_LABEL}>Their next step</p>
            <p>{NEXT_STEP}</p>
          </>
        )}
        <p className={tableSecondary}>
          {office} · <span className={mono}>{s.reference}</span>
        </p>
      </div>
      <p className={FINE}>
        <Icon name="bell" size={14} /> Delivered under the bell on the student’s pages.
      </p>
      <p className={FINE}>Your name, office and decision time are saved in review history.</p>
    </aside>
  );
}

export function ReviewWorkspace({ detail, checklist, reviewer }: { detail: SubmissionDetail; checklist: readonly string[]; reviewer: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('review');
  const [checked, setChecked] = useState<string[]>([]);
  const [category, setCategory] = useState<string>(RETURN_REASONS[0]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReviewOutcome | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const firstRender = useRef(true);
  const reasonId = useId();
  const categoryId = useId();
  const errorId = useId();

  const s = detail;
  const office = s.office.name;
  const decided = s.status !== 'submitted';
  const allTicked = checklist.every((c) => checked.includes(c));

  // Each step is a new screen: start at the top and move focus to its title.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [mode]);

  function go(next: Mode) {
    setError(null);
    setMode(next);
  }

  async function confirm(decision: 'approve' | 'return') {
    if (busy) return;
    if (decision === 'return' && Array.from(reason.trim()).length < 10) {
      setError('Explain what the student needs to fix (at least 10 characters).');
      reasonRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    let res: Awaited<ReturnType<typeof reviewSubmission>>;
    try {
      res = await reviewSubmission({
        submissionId: s.id,
        decision,
        checklist: checklist.filter((c) => checked.includes(c)),
        ...(decision === 'return' ? { returnCategory: category, reason: reason.trim() } : {}),
      });
    } catch {
      setBusy(false);
      setError('The decision could not be sent. Check your connection and try again.');
      return;
    }
    setBusy(false);
    if (res.ok) {
      setResult(res.data);
      setMode('done');
      return;
    }
    setError(res.error.message);
    if (res.error.code === 'already_reviewed') router.refresh();
  }

  const msgButton = <ChatButton itemId={s.item.id} viewer="office" label="Message student" />;

  /* ---------- done: "Student updated" ---------- */
  if (mode === 'done' && result) {
    const approved = result.status === 'approved';
    const n = result.notification;
    return (
      <>
        <div className={pageHead}>
          <h1 ref={headingRef} tabIndex={-1}>
            Student updated
          </h1>
          <p className={pageHeadSub}>Your office decision is saved and the student has been notified.</p>
        </div>

        <div className={cn(alert(approved ? 'success' : 'action'), 'mb-6')} role="status">
          <Icon name={approved ? 'check-circle' : 'undo'} size={18} />
          <div className={alertBody}>
            <strong>
              {result.office.name} clearance {approved ? 'approved' : 'returned'}
            </strong>
            <span>
              {result.student.name}’s record was updated on {result.reviewedAt ? formatDateTime(result.reviewedAt) : 'just now'}.
            </span>
          </div>
        </div>

        <div className={REVIEW_GRID}>
          <section className={PANEL_STACK} aria-labelledby="record-title">
            <h2 id="record-title" className={SECTION_TITLE}>
              Decision record
            </h2>
            <Person s={result} />
            <Facts
              items={[
                ['Requirement', `${result.office.name} clearance`],
                ['Reference', <span className={mono} key="ref">{result.reference}</span>],
                ['Submitted', formatDateTime(result.submittedAt)],
                ['Previous status', ITEM_LABEL[result.previousItemStatus]],
                ['New status', ITEM_LABEL[result.item.status]],
                ['Reviewed by', result.reviewer ?? reviewer],
              ]}
            />
            <div>
              <h3 className="text-14 font-semibold mb-2">Activity</h3>
              <ul className="m-0 p-0 list-none flex flex-col gap-3">
                <li className={ACTIVITY_ITEM}>
                  <Icon name="file" size={16} className={ACTIVITY_ICON} />
                  <div>
                    <p>{approved ? 'Approval' : 'Return'} saved to the student record</p>
                    <p className={tableSecondary}>
                      {result.office.name} · {result.reviewer ?? reviewer}
                      {result.reviewedAt ? ` · ${formatDateTime(result.reviewedAt)}` : ''}
                    </p>
                  </div>
                </li>
                {n ? (
                  <li className={ACTIVITY_ITEM}>
                    <Icon name="bell" size={16} className={ACTIVITY_ICON} />
                    <div>
                      <p>ClearGate notification delivered</p>
                      <p className={tableSecondary}>
                        “{n.title}” · {formatDateTime(n.createdAt)}
                      </p>
                    </div>
                  </li>
                ) : null}
                <li className={ACTIVITY_ITEM}>
                  <Icon name="history" size={16} className={ACTIVITY_ICON} />
                  <div>
                    <p>Added to review history</p>
                    <p className={tableSecondary}>With your checklist{approved ? '' : ' and return reason'}</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className={alert()}>
              <Icon name="info" size={16} />
              <div className={alertBody}>
                <strong>{approved ? `No further action for the ${result.office.name}` : 'Waiting for the student'}</strong>
                <span>
                  {approved
                    ? 'This item has left your pending list. The full record is in review history.'
                    : 'When the student uploads a corrected file it will come back to your pending list, marked Resubmitted.'}
                </span>
              </div>
            </div>
          </section>

          <aside className={NOTIF_PREVIEW} aria-labelledby="sees-title">
            <h2 id="sees-title" className={SECTION_TITLE}>
              What the student sees
            </h2>
            <p className={NOTIF_PREVIEW_SUB}>On their clearance pages and under the bell</p>
            <div className={NOTIF_BOX}>
              <p className={NOTIF_TITLE[approved ? 'approve' : 'return']}>{n ? n.title : result.office.name}</p>
              {approved ? (
                <p>{n ? n.body : `${result.office.name} has cleared your account.`}</p>
              ) : (
                <>
                  <p className={NOTIF_LABEL}>What to fix</p>
                  <p className="whitespace-pre-wrap">
                    {result.returnCategory ? `${result.returnCategory}: ` : ''}
                    {result.reviewNote}
                  </p>
                  <p className={NOTIF_LABEL}>Their next step</p>
                  <p>{NEXT_STEP}</p>
                </>
              )}
              <p className={tableSecondary}>
                {result.office.name} · <span className={mono}>{result.reference}</span>
              </p>
            </div>
          </aside>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 mt-6 pt-4 border-t border-rule">
          <span className="text-muted">Continue reviewing your office’s remaining submissions.</span>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/history" className={button()}>
              View review history
            </Link>
            <Link href="/staff" className={button({ variant: 'primary' })}>
              <Icon name="arrow-left" size={16} />
              Back to pending list
            </Link>
          </div>
        </div>
      </>
    );
  }

  /* ---------- approve: confirm step ---------- */
  if (mode === 'approve' && !decided) {
    return (
      <>
        <div className={pageHead}>
          <h1 ref={headingRef} tabIndex={-1}>
            Approve this item?
          </h1>
          <p className={pageHeadSub}>Confirm your review before updating the student’s {office.toLowerCase()} clearance record.</p>
        </div>
        <div className={REVIEW_GRID}>
          <section className={PANEL_STACK} aria-labelledby="confirm-title">
            <div>
              <h2 id="confirm-title" className={SECTION_TITLE}>
                Confirm {office} approval
              </h2>
              <p className={panelSub}>This submission has passed your office review.</p>
            </div>
            <Person s={s} />
            <Facts
              items={[
                ['Requirement', `${office} clearance`],
                ['Reference', <span className={mono} key="ref">{s.reference}</span>],
                ['Submitted', formatDateTime(s.submittedAt)],
              ]}
            />
            <ul className={LIST_COLUMN} aria-label="Checks ticked">
              {checklist.map((c) => (
                <li key={c} className="flex items-start gap-2">
                  <Icon name="check" size={16} className={TICK_ICON} />
                  {c}
                </li>
              ))}
            </ul>
            <div className={alert('success')}>
              <Icon name="check-circle" size={16} />
              <div className={alertBody}>
                <strong>{office} status will change to Approved</strong>
                <span>The student gets a ClearGate notification. Other offices’ clearance decisions will not change.</span>
              </div>
            </div>
            <Facts
              items={[
                ['Reviewed by', reviewer],
                ['Assigned office', office],
              ]}
            />
            {error ? (
              <p className={alert('error')} role="alert">
                {error}
              </p>
            ) : null}
            <div className={formActions}>
              <button type="button" className={button()} onClick={() => go('review')} disabled={busy}>
                Back to review
              </button>
              <button type="button" className={button({ variant: 'primary' })} onClick={() => void confirm('approve')} disabled={busy} aria-busy={busy}>
                {busy ? <span className={spinner} aria-hidden="true" /> : <Icon name="check" size={16} />}
                {busy ? 'Saving…' : 'Confirm approval'}
              </button>
            </div>
          </section>
          <NotificationPreview kind="approve" s={s} reason="" />
        </div>
      </>
    );
  }

  /* ---------- return: reason form ---------- */
  if (mode === 'return' && !decided) {
    return (
      <>
        <div className={pageHead}>
          <h1 ref={headingRef} tabIndex={-1}>
            Return item
          </h1>
          <p className={pageHeadSub}>Tell the student what needs to be corrected before this item can be approved.</p>
        </div>
        <div className={REVIEW_GRID}>
          <form
            className={PANEL_STACK}
            aria-labelledby="return-title"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void confirm('return');
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="return-title" className={SECTION_TITLE}>
                Return for correction
              </h2>
              <Pill tone="pending">Decision not yet sent</Pill>
            </div>
            <Person s={s} />
            <div className={field}>
              <label htmlFor={categoryId} className={fieldLabel}>
                Reason category
              </label>
              <select id={categoryId} className={select} value={category} onChange={(e) => setCategory(e.target.value)}>
                {RETURN_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className={field}>
              <label htmlFor={reasonId} className={fieldLabel}>
                Reason for return
              </label>
              <textarea
                ref={reasonRef}
                id={reasonId}
                className={textarea}
                rows={4}
                maxLength={500}
                required
                placeholder="e.g. Please upload a book return slip signed by the library circulation desk."
                value={reason}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : `${reasonId}-hint`}
                onChange={(e) => setReason(e.target.value)}
              />
              <p id={`${reasonId}-hint`} className={fieldHint}>
                Required, 10 to 500 characters. Be specific and respectful: the student sees this reason.
              </p>
            </div>
            <div className={alert('warning')}>
              <Icon name="alert" size={16} />
              <div className={alertBody}>
                <strong>The student will be asked to resubmit</strong>
                <span>{office} clearance changes to Needs action. The reason and next step are sent as a ClearGate notification.</span>
              </div>
            </div>
            <p className={FINE}>
              <Icon name="user" size={14} /> Returning as {reviewer} · {office}
            </p>
            {error ? (
              <p id={errorId} className={alert('error')} role="alert">
                {error}
              </p>
            ) : null}
            <div className={formActions}>
              <button type="button" className={button()} onClick={() => go('review')} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className={button({ variant: 'primary' })} disabled={busy} aria-busy={busy}>
                {busy ? <span className={spinner} aria-hidden="true" /> : <Icon name="send" size={16} />}
                {busy ? 'Saving…' : 'Return and notify student'}
              </button>
            </div>
          </form>
          <NotificationPreview kind="return" s={s} reason={reason} />
        </div>
      </>
    );
  }

  /* ---------- review (or read-only once decided) ---------- */
  return (
    <>
      <Link href="/staff" className={backLink}>
        <Icon name="arrow-left" size={16} />
        Pending list
      </Link>
      <div className={pageHead}>
        <h1 ref={headingRef} tabIndex={-1}>
          Review item
        </h1>
        <p className={pageHeadSub}>Verify the evidence before approving or returning this {office.toLowerCase()} requirement.</p>
        <div className={pageHeadActions}>
          <SubmissionPill status={s.status} resubmitted={s.resubmitted} />
          {msgButton}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 py-4 mb-6 border-y border-rule max-sm:flex-col max-sm:items-start">
        <Person s={s} />
        <Facts
          items={[
            ['Requirement', `${office} clearance`],
            ['Reference', <span className={mono} key="ref">{s.reference}</span>],
            ['Submitted', formatDateTime(s.submittedAt)],
            ['Term', `${s.term}, A.Y ${s.academicYear}`],
          ]}
        />
      </div>

      {error ? (
        <p className={cn(alert('error'), 'mb-4')} role="alert">
          {error}
        </p>
      ) : null}

      <div className={REVIEW_GRID}>
        <Evidence s={s} />

        {decided ? (
          <section className={PANEL_STACK} aria-labelledby="decision-title">
            <h2 id="decision-title" className={SECTION_TITLE}>
              Decision
            </h2>
            <dl className={kv}>
              <dt>Status</dt>
              <dd>
                <SubmissionPill status={s.status} />
              </dd>
              {s.reviewer ? (
                <>
                  <dt>Reviewed by</dt>
                  <dd>{s.reviewer}</dd>
                </>
              ) : null}
              {s.reviewedAt ? (
                <>
                  <dt>Reviewed</dt>
                  <dd>{formatDateTime(s.reviewedAt)}</dd>
                </>
              ) : null}
              {s.returnCategory || s.reviewNote ? (
                <>
                  <dt>Reason</dt>
                  <dd>
                    {s.returnCategory ? `${s.returnCategory}: ` : ''}
                    {s.reviewNote}
                  </dd>
                </>
              ) : null}
              {s.checklist.length ? (
                <>
                  <dt>Checks ticked</dt>
                  <dd>{s.checklist.join(', ')}</dd>
                </>
              ) : null}
            </dl>
            {s.status === 'replaced' ? <p className="text-muted">The student uploaded a newer file, so this one was not reviewed.</p> : null}
            <Link href="/history" className={button({ block: true })}>
              View review history
            </Link>
          </section>
        ) : (
          <section className={PANEL_STACK} aria-labelledby="checklist-title">
            <div>
              <h2 id="checklist-title" className={SECTION_TITLE}>
                Review checklist
              </h2>
              <p className={panelSub}>{office} requirements</p>
            </div>
            <ul className={LIST_COLUMN}>
              {checklist.map((c) => (
                <li key={c}>
                  <label className={CHECK_LABEL}>
                    <input
                      type="checkbox"
                      className="mt-0.5! flex-none"
                      checked={checked.includes(c)}
                      onChange={(e) => setChecked((list) => (e.target.checked ? [...list.filter((x) => x !== c), c] : list.filter((x) => x !== c)))}
                    />
                    <span>{c}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="p-3 rounded-card bg-raised wrap-anywhere">
              <p className="text-12 font-semibold text-muted mb-1">Office record</p>
              <p>{s.item.task}</p>
              <p className="text-muted">{s.item.remarks}</p>
              <p className={tableSecondary}>Last updated {formatDateTime(s.item.updatedAt)}</p>
            </div>
            <div className="flex flex-col gap-2">
              <button type="button" className={button({ variant: 'primary', block: true })} disabled={!allTicked} onClick={() => go('approve')} aria-describedby={allTicked ? undefined : 'tick-hint'}>
                <Icon name="check" size={16} />
                Approve item
              </button>
              {allTicked ? null : (
                <p id="tick-hint" className={fieldHint}>
                  Tick every check to approve.
                </p>
              )}
              <button type="button" className={button({ block: true })} onClick={() => go('return')}>
                <Icon name="undo" size={16} />
                Return for correction
              </button>
            </div>
            <p className={FINE}>Approval confirms this office’s requirement only. Returns require a student-visible reason.</p>
          </section>
        )}
      </div>
    </>
  );
}
