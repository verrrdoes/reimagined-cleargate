'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from 'react';
import { cancelPasswordChange, requestPasswordChange } from '@/lib/actions/auth';
import { SCHOOL_DOMAIN } from '@/lib/constants';
import { formatRequestCode, PASSWORD_REQUEST_CLOSED } from '@/lib/passwordRequest';
import type { RequestStatusView } from '@/lib/services/passwordRequests';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/components/ui/cn';
import { button, field, fieldError, fieldLabel, input, linkButton, mono, spinner } from '@/components/ui/recipes';
import { authCard } from '../AuthFrame';
import { PageLoading } from '../PageLoading';
import { FormAlert } from './FormAlert';
import { RequestPasswordForm } from './RequestPasswordForm';
import {
  forgetSavedRequest,
  parseSavedRequest,
  readSavedRequest,
  saveRequest,
  subscribeSavedRequest,
  type SavedRequest,
} from './savedRequest';

// Forgot password for students: ask the Registrar, who checks the school ID in person and allows the change.
// The device that asked keeps the request and checks every 15 seconds (30 after an error, never while the tab
// is hidden) until the Registrar allows it, then the student sets the new password right here.

type Reply = { ok: true; data: RequestStatusView } | { ok: false; message: string };
type Envelope = { ok: true; data: RequestStatusView } | { ok: false; error: { code: string; message: string } };

const POLL_MS = 15_000;
const RETRY_MS = 30_000;
/** setTimeout fires at once past this many milliseconds. */
const MAX_DELAY = 2_147_483_647;

const CODE = 'py-4 px-2 border-2 border-dashed border-border rounded-card text-center text-32 font-bold tracking-[0.12em] select-all';
const SIGN_IN = '/';

async function fetchStatus(token: string): Promise<Reply> {
  try {
    const res = await fetch('/api/password-requests/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ token }),
    });
    const body = (await res.json().catch(() => null)) as Envelope | null;
    if (body?.ok) return { ok: true, data: body.data };
    if (body && !body.ok) return { ok: false, message: body.error.message };
    return { ok: false, message: 'The server sent an unexpected reply.' };
  } catch {
    return { ok: false, message: 'Could not reach ClearGate. Check your connection.' };
  }
}

export function RegistrarRequest({ onUseEmail }: { onUseEmail: () => void }) {
  const raw = useSyncExternalStore(subscribeSavedRequest, readSavedRequest, () => null);
  const stored = useMemo(() => (raw ? parseSavedRequest(raw) : null), [raw]);
  // When storage is blocked the request lives here, for as long as this page stays open.
  const [held, setHeld] = useState<SavedRequest | null>(null);
  // The request asked on this page is known to be waiting, so its first check can wait 15 seconds.
  const [fresh, setFresh] = useState<string | null>(null);

  if (raw === null) return <PageLoading />;

  const saved = held ?? stored;
  if (!saved) {
    return (
      <AskForm
        onUseEmail={onUseEmail}
        onAsked={(request) => {
          setFresh(request.token);
          if (!saveRequest(request)) setHeld(request);
        }}
      />
    );
  }

  return (
    <OpenRequest
      key={saved.token}
      saved={saved}
      fresh={saved.token === fresh}
      held={held !== null}
      onDone={() => {
        setHeld(null);
        forgetSavedRequest();
      }}
    />
  );
}

function AskForm({ onAsked, onUseEmail }: { onAsked: (request: SavedRequest) => void; onUseEmail: () => void }) {
  const [login, setLogin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const value = login.trim();
    if (value === '') {
      setError('Enter your student ID or school email.');
      inputRef.current?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await requestPasswordChange({ login: value });
      if (res.ok) {
        const { token, code, login: asked, expiresAt } = res.data;
        onAsked({ token, code, login: asked, expiresAt });
        return;
      }
      setError(res.error.message);
      inputRef.current?.focus();
    });
  }

  return (
    <div className={authCard.root}>
      <div className={authCard.head}>
        <h1>Forgot password</h1>
        <p className={authCard.lead}>
          Ask the Registrar to let you set a new password. You&apos;ll show your school ID at the Registrar&apos;s office.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div className={field}>
          <label className={fieldLabel} htmlFor="request-login">
            Student ID or school email
          </label>
          <input
            ref={inputRef}
            id="request-login"
            name="login"
            type="text"
            className={input}
            placeholder={`2026-00042 or name@${SCHOOL_DOMAIN}`}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={190}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'request-login-error' : undefined}
            autoFocus
          />
          {error ? (
            <p id="request-login-error" className={fieldError} role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <button type="submit" className={button({ variant: 'primary', size: 'lg', block: true })} disabled={pending} aria-disabled={pending || undefined}>
          {pending ? (
            <>
              <span className={spinner} aria-hidden="true" />
              Sending…
            </>
          ) : (
            'Ask the Registrar'
          )}
        </button>
      </form>

      <div className={authCard.links}>
        <p>
          Can you open your email?{' '}
          <button type="button" className={linkButton} onClick={onUseEmail}>
            Send a reset link instead
          </button>
        </p>
        <p>
          Remembered it? <Link href={SIGN_IN}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

function OpenRequest({
  saved,
  fresh,
  held,
  onDone,
}: {
  saved: SavedRequest;
  fresh: boolean;
  held: boolean;
  onDone: () => void;
}) {
  const expiresAt = useMemo(() => Date.parse(saved.expiresAt), [saved.expiresAt]);
  const [view, setView] = useState<RequestStatusView | null>(fresh ? { state: 'waiting', approvedUntil: null } : null);
  const [failure, setFailure] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [round, setRound] = useState(0);
  const [cancelling, startCancel] = useTransition();

  const approvedUntil = view?.state === 'allowed' ? view.approvedUntil : null;
  // An approval can outlast the request's 24 hours by up to 15 minutes; the server decides when it ends.
  const closed = view?.state === 'closed' || (expired && !approvedUntil);
  const known = view !== null;

  useEffect(() => {
    const timer = window.setTimeout(() => setExpired(true), Math.min(Math.max(expiresAt - Date.now(), 0), MAX_DELAY));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  useEffect(() => {
    if (closed) return;
    let live = true;
    let busy = false;
    async function check() {
      // A hidden tab waits; the check runs when it is shown again.
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      window.clearTimeout(timer);
      const reply = await fetchStatus(saved.token);
      if (!live) return;
      if (reply.ok) {
        setFailure(null);
        setView(reply.data);
      } else {
        setFailure(reply.message);
      }
      setRound((r) => r + 1);
    }
    const timer = window.setTimeout(() => void check(), failure ? RETRY_MS : known ? POLL_MS : 0);
    const onVisibility = () => void check();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      live = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [saved.token, closed, known, failure, round]);

  function cancel() {
    startCancel(async () => {
      try {
        await cancelPasswordChange({ token: saved.token });
      } catch {
        // The request is forgotten here either way; one nobody can use closes on its own after 24 hours.
      }
      onDone();
    });
  }

  if (closed) {
    return (
      <div className={authCard.root}>
        <div className={authCard.head}>
          <h1>Request closed</h1>
        </div>
        <FormAlert tone="info">{PASSWORD_REQUEST_CLOSED}</FormAlert>
        <button type="button" className={button({ variant: 'primary', size: 'lg', block: true })} onClick={onDone}>
          Ask again
        </button>
        <div className={authCard.links}>
          <p>
            Remembered it? <Link href={SIGN_IN}>Back to sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  if (approvedUntil) {
    return (
      <RequestPasswordForm
        token={saved.token}
        approvedUntil={approvedUntil}
        onClosed={() => setView({ state: 'closed', approvedUntil: null })}
      />
    );
  }

  if (!known && !failure) return <PageLoading label="Checking your request…" />;

  return (
    <div className={authCard.root}>
      <div className={authCard.head}>
        <h1>Go to the Registrar&apos;s office</h1>
        <p className={authCard.lead}>Bring your school ID and show this code to the Registrar.</p>
      </div>

      {failure ? (
        <FormAlert tone="warning">
          <p>{failure}</p>
          <p>This page tries again in 30 seconds.</p>
        </FormAlert>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className={cn(mono, CODE)}>{formatRequestCode(saved.code)}</p>
        <p className="text-12 text-muted text-center wrap-anywhere">
          Request for {saved.login}
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, </span>
          Open until {formatDateTime(saved.expiresAt)}
        </p>
      </div>

      <FormAlert tone="info">
        {held
          ? 'Keep this page open until the Registrar allows the change.'
          : 'This page changes by itself when the Registrar allows the change. Keep it open, or come back to Forgot password on this device.'}
      </FormAlert>

      <button type="button" className={button({ size: 'lg', block: true })} onClick={cancel} disabled={cancelling} aria-disabled={cancelling || undefined}>
        {cancelling ? (
          <>
            <span className={spinner} aria-hidden="true" />
            Cancelling…
          </>
        ) : (
          'Cancel request'
        )}
      </button>

      <div className={authCard.links}>
        <p>
          Remembered it? <Link href={SIGN_IN}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
