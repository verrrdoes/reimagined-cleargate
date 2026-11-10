'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { isEmail } from '@/lib/input';
import { formatDate, formatTime, parseYmd } from '@/lib/time';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/components/ui/cn';
import { button, field, fieldError, fieldLabel, input, linkButton, mono, spinner } from '@/components/ui/recipes';
import { FormAlert } from '@/components/shell/auth/FormAlert';
import { PageLoading } from '@/components/shell/PageLoading';
import { SAVED_APPLICATION_KEY, type ApplicationStatusName, type ApplicationStatusView, type SavedApplication } from './types';

// The applicant's status page (HANDOFF §8.3, legacy application-status.html). The browser that applied keeps
// { reference, token } in localStorage and checks with it; anyone can look an application up by reference,
// personal email and birthday. While the application is pending the page asks again every 15 seconds
// (30 seconds after an error), and not while the tab is hidden.

type Creds = { reference: string; token: string } | { reference: string; personalEmail: string; birthday: string };
type Shown = { view: ApplicationStatusView; via: Creds; checkedAt: number };
type Reply = { ok: true; data: ApplicationStatusView } | { ok: false; status: number; message: string };
type Envelope = { ok: true; data: ApplicationStatusView } | { ok: false; error: { code: string; message: string } };

const POLL_MS = 15_000;
const RETRY_MS = 30_000;

const CARD = 'flex flex-col gap-6 w-full max-w-[400px] mx-auto';
const CARD_HEAD = 'flex flex-col gap-1.5';
const CARD_LINKS = 'flex flex-col gap-1.5 pt-4 border-t border-rule text-muted';
const INPUT = cn(input, 'h-10');

const STATE = 'flex items-start gap-3 p-4 rounded-card';
const STATE_TONE: Record<ApplicationStatusName, string> = {
  pending: 'bg-pill-pending-bg text-pill-pending-fg',
  approved: 'bg-pill-approved-bg text-pill-approved-fg',
  rejected: 'bg-pill-overdue-bg text-pill-overdue-fg',
};
const STATE_TEXT = 'flex flex-col gap-1 min-w-0';

/** Student ID, school email and temporary password, one per row. */
const CREDS =
  'flex flex-col border border-border rounded-card ' +
  '[&>div]:flex [&>div]:flex-col [&>div]:gap-0.5 [&>div]:px-3 [&>div]:py-2.5 [&>div+div]:border-t [&>div+div]:border-rule ' +
  '[&_dt]:text-12 [&_dt]:text-muted [&_dd]:font-medium [&_dd]:wrap-anywhere [&_code]:text-15 [&_code]:select-all';

async function fetchStatus(creds: Creds): Promise<Reply> {
  try {
    const res = await fetch('/api/applications/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(creds),
    });
    const body = (await res.json().catch(() => null)) as Envelope | null;
    if (body?.ok) return { ok: true, data: body.data };
    if (body && !body.ok) return { ok: false, status: res.status, message: body.error.message };
    return { ok: false, status: res.status, message: 'The server sent an unexpected reply.' };
  } catch {
    return { ok: false, status: 0, message: 'Could not reach ClearGate. Check your connection.' };
  }
}

/* The saved application, read from localStorage as a string so the snapshot compares by value. */
function subscribeStorage(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}
function readSaved(): string {
  try {
    return localStorage.getItem(SAVED_APPLICATION_KEY) ?? '';
  } catch {
    return '';
  }
}
function forgetSaved() {
  try {
    localStorage.removeItem(SAVED_APPLICATION_KEY);
  } catch {
    // Storage is blocked; nothing was saved.
  }
}
function parseSaved(raw: string | null): SavedApplication | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SavedApplication> | null;
    if (v && typeof v.reference === 'string' && typeof v.token === 'string' && v.reference && v.token) {
      return { reference: v.reference.toUpperCase(), token: v.token };
    }
  } catch {
    // A damaged entry is treated as none.
  }
  return null;
}

function subscribeHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function ApplicationStatus({ initialReference, year }: { initialReference: string; year: number }) {
  const raw = useSyncExternalStore(subscribeStorage, readSaved, () => null);
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => '');
  const saved = useMemo(() => parseSaved(raw), [raw]);

  const [shown, setShown] = useState<Shown | null>(null);
  const [lookupOnly, setLookupOnly] = useState(false);
  const [lookupNotice, setLookupNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // The saved token is used when it belongs to the application in ?ref= (or there is no ?ref=).
  const tokenCreds = useMemo<Creds | null>(
    () =>
      saved && !lookupOnly && (!initialReference || initialReference === saved.reference)
        ? { reference: saved.reference, token: saved.token }
        : null,
    [saved, lookupOnly, initialReference],
  );
  const target = shown ? shown.via : tokenCreds;
  const watching = target !== null && (shown === null || shown.view.status === 'pending');
  const delay = failure ? RETRY_MS : shown ? POLL_MS : 0;

  useEffect(() => {
    if (!watching || !target) return;
    let live = true;
    const timer = window.setTimeout(async () => {
      // A hidden tab skips this round and waits for the next one.
      if (delay > 0 && document.visibilityState === 'hidden') {
        if (live) setAttempt((a) => a + 1);
        return;
      }
      const reply = await fetchStatus(target);
      if (!live) return;
      if (reply.ok) {
        setFailure(null);
        setShown({ view: reply.data, via: target, checkedAt: Date.now() });
        if (reply.data.status === 'rejected' && 'token' in target) forgetSaved();
      } else if (reply.status === 404) {
        // The token (or the details) no longer match: show the lookup form.
        if ('token' in target) forgetSaved();
        else setLookupNotice(reply.message);
        setFailure(null);
        setShown(null);
        setLookupOnly(true);
      } else {
        setFailure(reply.message);
      }
      setAttempt((a) => a + 1);
    }, delay);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [watching, target, delay, attempt]);

  function lookAgain() {
    setShown(null);
    setFailure(null);
    setLookupNotice(null);
    setLookupOnly(true);
  }

  if (raw === null) return <PageLoading />;

  if (shown) {
    return (
      <StatusCard
        shown={shown}
        isNew={hash === '#new' && 'token' in shown.via}
        failure={failure}
        onLookAgain={lookAgain}
      />
    );
  }

  if (tokenCreds) {
    if (!failure) return <PageLoading label="Checking your application…" />;
    return (
      <div className={CARD}>
        <div className={CARD_HEAD}>
          <h1>Application status</h1>
          <p className="text-muted">Your application could not be checked just now.</p>
        </div>
        <FormAlert tone="warning">
          <p>{failure}</p>
          <p>This page tries again in 30 seconds.</p>
        </FormAlert>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={button()} onClick={() => setFailure(null)}>
            <Icon name="refresh" size={16} />
            Try now
          </button>
          <button type="button" className={linkButton} onClick={lookAgain}>
            Look up with your details instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <LookupForm
      initialReference={initialReference}
      year={year}
      notice={lookupNotice}
      onFound={(view, via) => {
        setLookupNotice(null);
        setFailure(null);
        setShown({ view, via, checkedAt: Date.now() });
      }}
    />
  );
}

function StatusCard({
  shown,
  isNew,
  failure,
  onLookAgain,
}: {
  shown: Shown;
  isNew: boolean;
  failure: string | null;
  onLookAgain: () => void;
}) {
  const v = shown.view;
  const lead =
    v.status === 'pending'
      ? isNew
        ? 'Application submitted. Keep this page open, or come back to it later.'
        : 'Your application is with the Registrar.'
      : v.status === 'approved'
        ? 'Your account is ready.'
        : 'Your application was not approved.';

  return (
    <div className={CARD}>
      <div className={CARD_HEAD}>
        <h1>Application status</h1>
        <p className="text-muted" aria-live="polite">
          {lead}
        </p>
      </div>

      {failure && v.status === 'pending' ? (
        <FormAlert tone="warning">
          <p>{failure}</p>
          <p>This page tries again in 30 seconds.</p>
        </FormAlert>
      ) : null}

      <div className="flex flex-col gap-4">
        <p className="text-muted">
          <span className={mono}>{v.reference}</span>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, </span>
          {v.name}
        </p>

        {v.status === 'pending' ? (
          <>
            <div className={cn(STATE, STATE_TONE.pending)}>
              <span className={cn(spinner, 'mt-0.5')} aria-hidden="true" />
              <div className={STATE_TEXT}>
                <p className="font-semibold">Waiting for the Registrar</p>
                <p>Submitted {formatDate(v.submittedAt)}. This page updates by itself when your account is ready.</p>
                <p className="text-12">Last checked {formatTime(shown.checkedAt)}</p>
              </div>
            </div>
            <p className="text-muted">
              Save your reference number <strong className={mono}>{v.reference}</strong>. With it, your personal email and
              birthday you can check this page from any device.
            </p>
          </>
        ) : null}

        {v.status === 'approved' ? (
          <>
            <div className={cn(STATE, STATE_TONE.approved)}>
              <Icon name="check-circle" size={20} className="mt-0.5" />
              <div className={STATE_TEXT}>
                <p className="font-semibold">Approved</p>
                {v.reviewedAt ? <p>Approved {formatDate(v.reviewedAt)}.</p> : null}
              </div>
            </div>
            <dl className={CREDS}>
              <div>
                <dt>Student ID</dt>
                <dd className={mono}>{v.studentNumber ?? 'Not set'}</dd>
              </div>
              <div>
                <dt>School email</dt>
                <dd className={mono}>{v.studentEmail ?? 'Not set'}</dd>
              </div>
              {v.tempPassword ? (
                <div>
                  <dt>Temporary password</dt>
                  <dd>
                    <code className={mono}>{v.tempPassword}</code>
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className="text-muted">
              {v.tempPassword
                ? 'Write these down. Sign in with your student ID and the temporary password; you’ll be asked to set your own password right away.'
                : 'You have already set your own password. Forgot it? Use Forgot password on the sign-in page, or ask the Registrar.'}
            </p>
            <Link
              className={button({ variant: 'primary', size: 'lg', block: true })}
              href={v.studentNumber ? `/?login=${encodeURIComponent(v.studentNumber)}` : '/'}
            >
              Go to sign in
            </Link>
          </>
        ) : null}

        {v.status === 'rejected' ? (
          <>
            <div className={cn(STATE, STATE_TONE.rejected)}>
              <Icon name="x-circle" size={20} className="mt-0.5" />
              <div className={STATE_TEXT}>
                <p className="font-semibold">Not approved</p>
                <p className="whitespace-pre-line wrap-anywhere">{v.rejectReason || 'Contact the Registrar for details.'}</p>
              </div>
            </div>
            <Link className={button({ variant: 'primary', size: 'lg', block: true })} href="/signup">
              Start a new application
            </Link>
          </>
        ) : null}
      </div>

      <div className={CARD_LINKS}>
        <p>
          Checking someone else&rsquo;s?{' '}
          <button type="button" className={linkButton} onClick={onLookAgain}>
            Look up a different application
          </button>
        </p>
        <p>
          <Link href="/">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

type LookupErrors = { reference?: string; personalEmail?: string; birthday?: string; form?: string };

function LookupForm({
  initialReference,
  year,
  notice,
  onFound,
}: {
  initialReference: string;
  year: number;
  notice: string | null;
  onFound: (view: ApplicationStatusView, via: Creds) => void;
}) {
  const [reference, setReference] = useState(initialReference);
  const [personalEmail, setPersonalEmail] = useState('');
  const [birthday, setBirthday] = useState('');
  const [errors, setErrors] = useState<LookupErrors>(notice ? { form: notice } : {});
  const [busy, setBusy] = useState(false);
  const refInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const birthdayInput = useRef<HTMLInputElement>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const ref = reference.trim().toUpperCase();
    const email = personalEmail.trim().toLowerCase();
    const next: LookupErrors = {};
    if (!ref) next.reference = 'Enter the reference number from your application.';
    if (!isEmail(email)) next.personalEmail = 'Enter the personal email you applied with.';
    if (!parseYmd(birthday)) next.birthday = 'Enter your birthday.';
    if (next.reference || next.personalEmail || next.birthday) {
      setErrors(next);
      (next.reference ? refInput : next.personalEmail ? emailInput : birthdayInput).current?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    const creds: Creds = { reference: ref, personalEmail: email, birthday };
    const reply = await fetchStatus(creds);
    setBusy(false);
    if (reply.ok) {
      onFound(reply.data, creds);
      return;
    }
    setErrors({ form: reply.message });
  }

  const describe = (id: string, hasError: boolean) => (hasError ? `${id}-error` : undefined);

  return (
    <div className={CARD}>
      <div className={CARD_HEAD}>
        <h1>Application status</h1>
        <p className="text-muted">
          Enter the reference number from your application, with the personal email and birthday you used.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate aria-busy={busy || undefined}>
        {errors.form ? <FormAlert id="lookup-error">{errors.form}</FormAlert> : null}

        <div className={field}>
          <label className={fieldLabel} htmlFor="lookup-reference">
            Reference number
          </label>
          <input
            ref={refInput}
            id="lookup-reference"
            className={cn(INPUT, 'font-code tabular-nums')}
            type="text"
            placeholder={`APP-${year}-0001`}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={20}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={busy}
            aria-invalid={errors.reference ? true : undefined}
            aria-describedby={describe('lookup-reference', !!errors.reference)}
          />
          {errors.reference ? (
            <p id="lookup-reference-error" className={fieldError}>
              {errors.reference}
            </p>
          ) : null}
        </div>

        <div className={field}>
          <label className={fieldLabel} htmlFor="lookup-email">
            Personal email
          </label>
          <input
            ref={emailInput}
            id="lookup-email"
            className={INPUT}
            type="email"
            inputMode="email"
            value={personalEmail}
            onChange={(e) => setPersonalEmail(e.target.value)}
            maxLength={190}
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
            aria-invalid={errors.personalEmail ? true : undefined}
            aria-describedby={describe('lookup-email', !!errors.personalEmail)}
          />
          {errors.personalEmail ? (
            <p id="lookup-email-error" className={fieldError}>
              {errors.personalEmail}
            </p>
          ) : null}
        </div>

        <div className={field}>
          <label className={fieldLabel} htmlFor="lookup-birthday">
            Birthday
          </label>
          <input
            ref={birthdayInput}
            id="lookup-birthday"
            className={INPUT}
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            autoComplete="bday"
            disabled={busy}
            aria-invalid={errors.birthday ? true : undefined}
            aria-describedby={describe('lookup-birthday', !!errors.birthday)}
          />
          {errors.birthday ? (
            <p id="lookup-birthday-error" className={fieldError}>
              {errors.birthday}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          className={button({ variant: 'primary', size: 'lg', block: true })}
          disabled={busy}
          aria-disabled={busy || undefined}
        >
          {busy ? (
            <>
              <span className={spinner} aria-hidden="true" />
              Checking…
            </>
          ) : (
            'Check status'
          )}
        </button>
      </form>

      <div className={CARD_LINKS}>
        <p>
          No application yet? <Link href="/signup">Apply for an account</Link>
        </p>
        <p>
          <Link href="/">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
