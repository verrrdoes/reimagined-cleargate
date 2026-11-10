'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from 'react';
import { resetPassword } from '@/lib/actions/auth';
import { button, field, fieldError, fieldHint, fieldLabel, spinner } from '@/components/ui/recipes';
import { authCard } from '../AuthFrame';
import { PageLoading } from '../PageLoading';
import { FormAlert } from './FormAlert';
import { PasswordInput } from './PasswordInput';
import { useSignInPage } from './portal';

/*
 * The reset token arrives in the URL fragment (/reset-password#token=...), so it never reaches server logs.
 * It is read once, then removed from the address bar and kept in memory for this page.
 */
let capturedToken: string | null = null;

function tokenInHash(): string {
  const match = /(?:^#|&)token=([0-9a-fA-F]{32,128})(?:&|$)/.exec(window.location.hash);
  return match ? match[1] : '';
}

function subscribeToken(onChange: () => void) {
  const take = () => {
    const token = tokenInHash();
    if (!token) return;
    capturedToken = token;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    onChange();
  };
  take();
  window.addEventListener('hashchange', take);
  return () => window.removeEventListener('hashchange', take);
}

const clientToken = () => capturedToken ?? tokenInHash();
const serverToken = () => null;

const chars = (s: string) => Array.from(s).length;

type Errors = { password?: string; confirm?: string; form?: { code: string; message: string } };

export function ResetForm() {
  const router = useRouter();
  const token = useSyncExternalStore(subscribeToken, clientToken, serverToken);
  const signInPage = useSignInPage();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  if (token === null) return <PageLoading />;

  if (!token) {
    return (
      <div className={authCard.root}>
        <div className={authCard.head}>
          <h1>Set a new password</h1>
        </div>
        <FormAlert>
          <span>Your reset link is missing its code. Go back and request a new link.</span>
          <Link href="/forgot-password">Request a new link</Link>
        </FormAlert>
        <div className={authCard.links}>
          <p>
            <Link href={signInPage}>Back to sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || !token) return;
    const length = chars(password);
    if (length < 8 || length > 128) {
      setErrors({ password: 'Your new password needs 8 to 128 characters.' });
      passwordRef.current?.focus();
      return;
    }
    if (password !== confirm) {
      setErrors({ confirm: 'Passwords do not match.' });
      confirmRef.current?.focus();
      return;
    }
    setErrors({});
    startTransition(async () => {
      const res = await resetPassword({ token, password });
      if (res.ok) {
        capturedToken = null;
        router.replace(res.data.redirectTo);
        return;
      }
      if (res.error.code === 'weak_password') {
        setErrors({ password: res.error.message });
        passwordRef.current?.focus();
        return;
      }
      if (res.error.code === 'invalid_token') capturedToken = null;
      setErrors({ form: res.error });
    });
  }

  return (
    <div className={authCard.root}>
      <div className={authCard.head}>
        <h1>Set a new password</h1>
        <p className={authCard.lead}>Choose a new password for your account. You will sign in with it next.</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {errors.form ? (
          <FormAlert>
            <span>{errors.form.message}</span>
            {errors.form.code === 'invalid_token' ? <Link href="/forgot-password">Request a new link</Link> : null}
          </FormAlert>
        ) : null}

        <div className={field}>
          <label className={fieldLabel} htmlFor="reset-password">
            New password
          </label>
          <PasswordInput
            id="reset-password"
            name="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            inputRef={passwordRef}
            invalid={Boolean(errors.password)}
            describedBy={errors.password ? 'reset-password-hint reset-password-error' : 'reset-password-hint'}
            autoFocus
          />
          <p id="reset-password-hint" className={fieldHint}>
            Use at least 8 characters.
          </p>
          {errors.password ? (
            <p id="reset-password-error" className={fieldError} role="alert">
              {errors.password}
            </p>
          ) : null}
        </div>

        <div className={field}>
          <label className={fieldLabel} htmlFor="reset-confirm">
            Re-enter new password
          </label>
          <PasswordInput
            id="reset-confirm"
            name="confirm"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            inputRef={confirmRef}
            invalid={Boolean(errors.confirm)}
            describedBy={errors.confirm ? 'reset-confirm-error' : undefined}
          />
          {errors.confirm ? (
            <p id="reset-confirm-error" className={fieldError} role="alert">
              {errors.confirm}
            </p>
          ) : null}
        </div>

        <button type="submit" className={button({ variant: 'primary', size: 'lg', block: true })} disabled={pending} aria-disabled={pending || undefined}>
          {pending ? (
            <>
              <span className={spinner} aria-hidden="true" />
              Saving…
            </>
          ) : (
            'Save new password'
          )}
        </button>
      </form>

      <div className={authCard.links}>
        <p>
          <Link href={signInPage}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
