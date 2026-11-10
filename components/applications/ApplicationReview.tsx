'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useRef, useState, useTransition, type ReactNode } from 'react';
import { resetTempPassword, reviewApplication } from '@/lib/actions/applications';
import { formatDate, formatDateTime } from '@/lib/time';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { useToast } from '@/components/ui/Toast';
import { initialsOf } from '@/components/ui/initials';
import { cn } from '@/components/ui/cn';
import {
  backLink,
  button,
  field,
  fieldError,
  fieldLabel,
  fieldRow,
  kv,
  mono,
  pageHead,
  pageHeadActions,
  pageHeadSub,
  panel,
  spinner,
  split,
  textarea,
} from '@/components/ui/recipes';
import { FormAlert } from '@/components/shell/auth/FormAlert';
import { APPLICATION_STATUS, ordinal, type ApplicationDetail } from './types';

// The Registrar's view of one application (HANDOFF §8.3, legacy applications.html?id=): every field and the
// photo on the left, the decision on the right. Approving creates the account and shows its credentials.

const REASON_MAX = 255;
const REASON_SHORT = 'Write a reason for the applicant first (at least 5 characters).';

const PHOTO = 'shrink-0 size-36 border border-border rounded-card bg-raised object-cover max-sm:size-28';
const SECTION = 'pt-6';
const SECTION_NEXT = 'pt-6 mt-6 border-t border-rule';
const SECTION_TITLE = 'mb-3 text-16 font-semibold';
const DECIDE = cn(panel(), 'flex flex-col gap-4');
const DECIDE_TITLE = 'text-16 font-semibold';
// The decision panel is narrow: a smaller label column, kept beside the value on phones too.
const DECIDE_KV = cn(
  kv,
  'grid-cols-[minmax(96px,max-content)_minmax(0,1fr)] max-sm:grid-cols-[minmax(96px,max-content)_minmax(0,1fr)]',
);
const TICK = 'flex items-start gap-2 wrap-anywhere';

/** Student ID, school email and temporary password, one per row. */
const CREDS =
  'flex flex-col border border-border rounded-card ' +
  '[&>div]:flex [&>div]:flex-col [&>div]:gap-0.5 [&>div]:px-3 [&>div]:py-2.5 [&>div+div]:border-t [&>div+div]:border-rule ' +
  '[&_dt]:text-12 [&_dt]:text-muted [&_dd]:font-medium [&_dd]:wrap-anywhere [&_code]:text-15 [&_code]:select-all';

const chars = (s: string) => Array.from(s).length;
const joinName = (...parts: (string | null)[]) => parts.filter(Boolean).join(' ');

function Value({ children }: { children: ReactNode }) {
  return children === null || children === undefined || children === '' ? <span className="text-muted">Not given</span> : <>{children}</>;
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className={kv}>
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <dt>{label}</dt>
          <dd>
            <Value>{value}</Value>
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** The 2x2 photo, or the applicant's initials when there is none (or it fails to load). */
function ApplicantPhoto({ detail }: { detail: ApplicationDetail }) {
  const [failed, setFailed] = useState(false);
  const name = `${detail.firstName} ${detail.lastName}`;
  if (detail.hasPhoto && !failed) {
    return (
      // An authenticated file route, so the image optimiser (which has no session) cannot fetch it.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={PHOTO}
        src={`/api/files/application-photo/${detail.id}`}
        alt={`2x2 photo of ${name}`}
        width={144}
        height={144}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className={cn(PHOTO, 'grid place-items-center text-muted text-32 font-semibold select-none')}
      role="img"
      aria-label={detail.hasPhoto ? `The photo of ${name} could not load` : 'No photo uploaded'}
    >
      {initialsOf(name)}
    </span>
  );
}

function credentialsText(d: ApplicationDetail): string {
  const a = d.account;
  return [
    `Name: ${d.firstName} ${d.lastName}`,
    `Student ID: ${a?.studentNumber ?? ''}`,
    `School email: ${a?.studentEmail ?? ''}`,
    ...(a?.tempPassword ? [`Temporary password: ${a.tempPassword}`] : []),
  ].join('\n');
}

function Credentials({ detail }: { detail: ApplicationDetail }) {
  const a = detail.account;
  return (
    <dl className={CREDS}>
      <div>
        <dt>Student ID</dt>
        <dd className={mono}>{a?.studentNumber ?? 'Not set'}</dd>
      </div>
      <div>
        <dt>School email</dt>
        <dd className={mono}>{a?.studentEmail ?? 'Not set'}</dd>
      </div>
      <div>
        <dt>Temporary password</dt>
        <dd>{a?.tempPassword ? <code className={mono}>{a.tempPassword}</code> : <span className="text-muted">Already changed by the student</span>}</dd>
      </div>
    </dl>
  );
}

export function ApplicationReview({ detail: initial }: { detail: ApplicationDetail }) {
  const router = useRouter();
  const toast = useToast();
  // The action's reply is the newest copy; the page props catch up when the route revalidates.
  const [latest, setLatest] = useState<ApplicationDetail | null>(null);
  const detail = latest ?? initial;
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'approve' | 'reset' | null>(null);
  const [shownCreds, setShownCreds] = useState<{ title: string; detail: ApplicationDetail } | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | 'reset' | null>(null);
  const [, startTransition] = useTransition();
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const name = `${detail.firstName} ${detail.lastName}`;
  const status = APPLICATION_STATUS[detail.status];

  function failed(err: { code: string; message: string }) {
    setError(err.message);
    if (err.code === 'already_reviewed' || err.code === 'not_found') {
      // Someone else decided first: show what the application looks like now.
      setLatest(null);
      startTransition(() => router.refresh());
    }
  }

  async function approve() {
    if (busy) return;
    setBusy('approve');
    setError(null);
    try {
      const res = await reviewApplication({ id: detail.id, decision: 'approve' });
      setConfirm(null);
      if (!res.ok) {
        failed(res.error);
        return;
      }
      setLatest(res.data);
      setShownCreds({ title: 'Account created', detail: res.data });
    } catch {
      setConfirm(null);
      setError('Could not reach ClearGate. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (busy) return;
    const text = reason.trim();
    if (chars(text) < 5) {
      setReasonError(REASON_SHORT);
      reasonRef.current?.focus();
      return;
    }
    setReasonError(null);
    setError(null);
    setBusy('reject');
    try {
      const res = await reviewApplication({ id: detail.id, decision: 'reject', reason: text });
      if (!res.ok) {
        if (res.error.code === 'reason_required') {
          setReasonError(res.error.message);
          reasonRef.current?.focus();
        } else {
          failed(res.error);
        }
        return;
      }
      setLatest(res.data);
      setReason('');
      toast.success('Application rejected. The applicant sees your reason on their status page.');
    } catch {
      setError('Could not reach ClearGate. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (busy) return;
    setBusy('reset');
    setError(null);
    try {
      const res = await resetTempPassword({ id: detail.id });
      setConfirm(null);
      if (!res.ok) {
        failed(res.error);
        return;
      }
      setLatest(res.data);
      setShownCreds({ title: 'New temporary password', detail: res.data });
    } catch {
      setConfirm(null);
      setError('Could not reach ClearGate. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function copy(d: ApplicationDetail) {
    try {
      await navigator.clipboard.writeText(credentialsText(d));
      toast.success('Copied the account details.');
    } catch {
      toast.error('Could not copy. Select the details and copy them instead.');
    }
  }

  const reviewed = detail.reviewedAt ? formatDateTime(detail.reviewedAt) : null;

  return (
    <>
      <Link href="/applications" className={backLink}>
        <Icon name="arrow-left" size={16} />
        Applications
      </Link>

      <div className={pageHead}>
        <h1>
          Application <span className={mono}>{detail.reference}</span>
        </h1>
        <p className={pageHeadSub}>Check the details (and photo, if any) before deciding.</p>
        <div className={pageHeadActions}>
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
      </div>

      <div className={split}>
        <div>
          <div className="flex items-center gap-4 pb-6 border-b border-rule max-sm:flex-col max-sm:items-start">
            <ApplicantPhoto detail={detail} />
            <div className="flex flex-col gap-0.5 min-w-0 wrap-anywhere">
              <p className="text-16 font-semibold">{detail.name}</p>
              <p className="text-muted">
                {detail.personalEmail} · {detail.contactNumber}
              </p>
              <p className="text-muted">Submitted {formatDateTime(detail.submittedAt)}</p>
            </div>
          </div>

          <section className={SECTION} aria-labelledby="apps-student">
            <h2 id="apps-student" className={SECTION_TITLE}>
              Student information
            </h2>
            <Rows
              rows={[
                ['Admission type', detail.admissionType],
                ['Program', `${detail.program} – ${detail.programName}`],
                ['Academic level', `${ordinal(detail.yearLevel)} year`],
                ['Sex', detail.sex],
                ['Civil status', detail.civilStatus],
                ['Birthday', formatDate(`${detail.birthday}T00:00:00+08:00`)],
                ['Place of birth', detail.placeOfBirth],
                ['Personal email', detail.personalEmail],
                ['Contact number', detail.contactNumber],
                ['Religion', detail.religion],
                ['Permanent address', detail.permanentAddress],
              ]}
            />
          </section>

          <section className={SECTION_NEXT} aria-labelledby="apps-address">
            <h2 id="apps-address" className={SECTION_TITLE}>
              Current address
            </h2>
            <Rows
              rows={[
                ['Region', detail.region],
                ['Province', detail.province],
                ['City / Municipality', detail.city],
                ['Barangay', detail.barangay],
                ['House no. / Street', detail.street],
                ['Postal code', detail.postalCode],
              ]}
            />
          </section>

          <section className={SECTION_NEXT} aria-labelledby="apps-family">
            <h2 id="apps-family" className={SECTION_TITLE}>
              Parent&rsquo;s / guardian&rsquo;s information
            </h2>
            <Rows
              rows={[
                ['Father', `${joinName(detail.fatherFirst, detail.fatherMiddle, detail.fatherLast)} · ${detail.fatherOccupation}`],
                ['Mother', `${joinName(detail.motherFirst, detail.motherMiddle, detail.motherLast)} · ${detail.motherOccupation}`],
                ['Guardian', `${joinName(detail.guardianFirst, detail.guardianMiddle, detail.guardianLast)} · ${detail.guardianRelationship}`],
                ['Guardian contact', detail.guardianContact],
              ]}
            />
          </section>
        </div>

        <aside className="sticky top-4 max-lg:static" aria-label="Decision">
          {detail.status === 'pending' ? (
            <section className={DECIDE} aria-labelledby="apps-decide-title">
              <h2 id="apps-decide-title" className={DECIDE_TITLE}>
                Decision
              </h2>
              <p>Approving creates the account right away:</p>
              <ul className="flex flex-col gap-2 m-0 p-0 list-none">
                <li className={TICK}>
                  <Icon name="check" size={16} className="mt-0.5 text-positive" />A new student ID
                </li>
                <li className={TICK}>
                  <Icon name="check" size={16} className="mt-0.5 text-positive" />
                  <span>
                    School email: <span className={mono}>{detail.schoolEmailPreview ?? 'set on approval'}</span>
                  </span>
                </li>
                <li className={TICK}>
                  <Icon name="check" size={16} className="mt-0.5 text-positive" />A temporary password
                </li>
                <li className={TICK}>
                  <Icon name="check" size={16} className="mt-0.5 text-positive" />
                  This term&rsquo;s clearance, every office pending
                </li>
              </ul>

              {error ? <FormAlert>{error}</FormAlert> : null}

              <button
                type="button"
                className={button({ variant: 'primary', block: true })}
                onClick={() => setConfirm('approve')}
                disabled={busy !== null}
              >
                <Icon name="user-check" size={16} />
                Approve &amp; create account
              </button>

              <div className="flex flex-col gap-3 pt-4 border-t border-rule">
                <div className={field}>
                  <div className={fieldRow}>
                    <label className={fieldLabel} htmlFor="apps-reason">
                      Reason, if rejecting
                    </label>
                    <span className="text-12 text-muted tabular-nums" aria-hidden="true">
                      {chars(reason)}/{REASON_MAX}
                    </span>
                  </div>
                  <textarea
                    ref={reasonRef}
                    id="apps-reason"
                    className={textarea}
                    rows={3}
                    maxLength={REASON_MAX}
                    placeholder="e.g. The photo is not a 2x2 ID photo. Please apply again with a clear photo."
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      if (reasonError) setReasonError(null);
                    }}
                    disabled={busy !== null}
                    aria-invalid={reasonError ? true : undefined}
                    aria-describedby={reasonError ? 'apps-reason-error' : undefined}
                  />
                  {reasonError ? (
                    <p id="apps-reason-error" className={fieldError} role="alert">
                      {reasonError}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={button({ variant: 'danger', block: true })}
                  onClick={reject}
                  disabled={busy !== null}
                >
                  {busy === 'reject' ? (
                    <>
                      <span className={spinner} aria-hidden="true" />
                      Rejecting…
                    </>
                  ) : (
                    <>
                      <Icon name="x" size={16} />
                      Reject application
                    </>
                  )}
                </button>
              </div>
              <p className="text-12 text-muted">The applicant sees the result on their application status page.</p>
            </section>
          ) : null}

          {detail.status === 'approved' ? (
            <section className={DECIDE} aria-labelledby="apps-account-title">
              <h2 id="apps-account-title" className={DECIDE_TITLE}>
                Account created
              </h2>
              <Credentials detail={detail} />
              <dl className={DECIDE_KV}>
                <dt>Approved by</dt>
                <dd>
                  <Value>{detail.reviewer}</Value>
                </dd>
                <dt>Approved</dt>
                <dd>
                  <Value>{reviewed}</Value>
                </dd>
              </dl>
              <p className="text-12 text-muted">The student also sees these on their status page. Give them in person if they ask.</p>
              {error ? <FormAlert>{error}</FormAlert> : null}
              {detail.account?.tempPassword ? (
                <button type="button" className={button({ block: true })} onClick={() => copy(detail)}>
                  Copy account details
                </button>
              ) : null}
              <button type="button" className={button({ block: true })} onClick={() => setConfirm('reset')} disabled={busy !== null}>
                <Icon name="undo" size={16} />
                Issue a new temporary password
              </button>
            </section>
          ) : null}

          {detail.status === 'rejected' ? (
            <section className={DECIDE} aria-labelledby="apps-rejected-title">
              <h2 id="apps-rejected-title" className={DECIDE_TITLE}>
                Rejected
              </h2>
              <dl className={DECIDE_KV}>
                <dt>Reason</dt>
                <dd>
                  <Value>{detail.rejectReason}</Value>
                </dd>
                <dt>Rejected by</dt>
                <dd>
                  <Value>{detail.reviewer}</Value>
                </dd>
                <dt>Rejected</dt>
                <dd>
                  <Value>{reviewed}</Value>
                </dd>
              </dl>
              <p className="text-12 text-muted">The applicant sees this reason on their application status page and can apply again.</p>
            </section>
          ) : null}
        </aside>
      </div>

      <Dialog
        open={confirm === 'approve'}
        onClose={() => (busy ? undefined : setConfirm(null))}
        size="sm"
        title="Approve this application?"
        description={`This creates the student account for ${name} and opens this term's clearance. It can't be undone.`}
        footer={
          <>
            <button type="button" className={button()} onClick={() => setConfirm(null)} disabled={busy !== null} data-autofocus>
              Cancel
            </button>
            <button type="button" className={button({ variant: 'primary' })} onClick={approve} disabled={busy !== null}>
              {busy === 'approve' ? (
                <>
                  <span className={spinner} aria-hidden="true" />
                  Creating account…
                </>
              ) : (
                'Approve & create account'
              )}
            </button>
          </>
        }
      />

      <Dialog
        open={confirm === 'reset'}
        onClose={() => (busy ? undefined : setConfirm(null))}
        size="sm"
        title="Issue a new temporary password?"
        description={`The current password for ${name} stops working right away. They sign in with the new one and then set their own.`}
        footer={
          <>
            <button type="button" className={button()} onClick={() => setConfirm(null)} disabled={busy !== null} data-autofocus>
              Cancel
            </button>
            <button type="button" className={button({ variant: 'primary' })} onClick={reset} disabled={busy !== null}>
              {busy === 'reset' ? (
                <>
                  <span className={spinner} aria-hidden="true" />
                  Issuing…
                </>
              ) : (
                'Issue new password'
              )}
            </button>
          </>
        }
      />

      <Dialog
        open={shownCreds !== null}
        onClose={() => setShownCreds(null)}
        size="sm"
        title={shownCreds?.title ?? 'Account details'}
        description="Give these to the student. They also see them on their application status page until they set their own password."
        footer={
          shownCreds ? (
            <>
              <button type="button" className={button()} onClick={() => copy(shownCreds.detail)}>
                Copy details
              </button>
              <button type="button" className={button({ variant: 'primary' })} onClick={() => setShownCreds(null)} data-autofocus>
                Done
              </button>
            </>
          ) : null
        }
      >
        {shownCreds ? <Credentials detail={shownCreds.detail} /> : null}
      </Dialog>
    </>
  );
}
