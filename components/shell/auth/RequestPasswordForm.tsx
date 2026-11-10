'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { setPasswordFromRequest } from '@/lib/actions/auth';
import { formatTime } from '@/lib/time';
import { button, field, fieldError, fieldHint, fieldLabel, spinner } from '@/components/ui/recipes';
import { authCard } from '../AuthFrame';
import { FormAlert } from './FormAlert';
import { PasswordInput } from './PasswordInput';
import { forgetSavedRequest } from './savedRequest';

const chars = (s: string) => Array.from(s).length;

type Errors = { password?: string; confirm?: string; form?: string };

/** The Registrar allowed this device's request: set the new password while the approval is open. */
export function RequestPasswordForm({
  token,
  approvedUntil,
  onClosed,
}: {
  token: string;
  approvedUntil: string;
  onClosed: () => void;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
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
      const res = await setPasswordFromRequest({ token, password });
      if (res.ok) {
        forgetSavedRequest({ quiet: true });
        router.replace(res.data.redirectTo);
        return;
      }
      if (res.error.code === 'request_closed') {
        onClosed();
        return;
      }
      if (res.error.code === 'weak_password') {
        setErrors({ password: res.error.message });
        passwordRef.current?.focus();
        return;
      }
      setErrors({ form: res.error.message });
    });
  }

  return (
    <div className={authCard.root}>
      <div className={authCard.head}>
        <h1>Set a new password</h1>
        <p className={authCard.lead}>The Registrar allowed the change. Choose a new password and sign in with it.</p>
        <p className="text-12 text-muted">Open until {formatTime(approvedUntil)}</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {errors.form ? <FormAlert>{errors.form}</FormAlert> : null}

        <div className={field}>
          <label className={fieldLabel} htmlFor="request-password">
            New password
          </label>
          <PasswordInput
            id="request-password"
            name="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            inputRef={passwordRef}
            invalid={Boolean(errors.password)}
            describedBy={errors.password ? 'request-password-hint request-password-error' : 'request-password-hint'}
            autoFocus
          />
          <p id="request-password-hint" className={fieldHint}>
            Use at least 8 characters.
          </p>
          {errors.password ? (
            <p id="request-password-error" className={fieldError} role="alert">
              {errors.password}
            </p>
          ) : null}
        </div>

        <div className={field}>
          <label className={fieldLabel} htmlFor="request-confirm">
            Re-enter new password
          </label>
          <PasswordInput
            id="request-confirm"
            name="confirm"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            inputRef={confirmRef}
            invalid={Boolean(errors.confirm)}
            describedBy={errors.confirm ? 'request-confirm-error' : undefined}
          />
          {errors.confirm ? (
            <p id="request-confirm-error" className={fieldError} role="alert">
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
          <Link href="/">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
