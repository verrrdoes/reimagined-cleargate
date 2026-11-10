'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { changePassword, signOut } from '@/lib/actions/auth';
import { button, field, fieldError, fieldHint, fieldLabel, linkButton, spinner } from '@/components/ui/recipes';
import { authCard } from '../AuthFrame';
import { FormAlert } from './FormAlert';
import { PasswordInput } from './PasswordInput';

const chars = (s: string) => Array.from(s).length;

type Errors = { current?: string; next?: string; confirm?: string; form?: string };

/**
 * Change the password while signed in. With `mustChange` (a temporary password from the Registrar or an admin)
 * the only ways out are saving a new password or signing out.
 */
export function ChangePasswordForm({
  mustChange,
  homeHref,
  portal,
  username,
}: {
  mustChange: boolean;
  homeHref: string;
  portal: 'student' | 'staff';
  /** The account email, in a hidden field so password managers save the new password to the right account. */
  username: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!current) {
      setErrors({ current: 'Enter your current password.' });
      currentRef.current?.focus();
      return;
    }
    const length = chars(next);
    if (length < 8 || length > 128) {
      setErrors({ next: 'Your new password needs 8 to 128 characters.' });
      nextRef.current?.focus();
      return;
    }
    if (next === current) {
      setErrors({ next: 'Choose a password different from your current one.' });
      nextRef.current?.focus();
      return;
    }
    if (next !== confirm) {
      setErrors({ confirm: 'Passwords do not match.' });
      confirmRef.current?.focus();
      return;
    }
    setErrors({});
    startTransition(async () => {
      const res = await changePassword({ current, next });
      if (res.ok) {
        router.replace(res.data.redirectTo);
        return;
      }
      const { code, message } = res.error;
      if (code === 'wrong_password') {
        setErrors({ current: message });
        setCurrent('');
        currentRef.current?.focus();
      } else if (code === 'weak_password' || code === 'same_password') {
        setErrors({ next: message });
        nextRef.current?.focus();
      } else if (code === 'not_signed_in') {
        router.replace(portal === 'staff' ? '/staff-login' : '/');
      } else {
        setErrors({ form: message });
      }
    });
  }

  return (
    <div className={authCard.root}>
      <div className={authCard.head}>
        <h1>Set your password</h1>
        <p className={authCard.lead}>Choose a new password for your account.</p>
      </div>

      {mustChange ? (
        <FormAlert tone="info">Welcome! You signed in with a temporary password. Set your own password to continue.</FormAlert>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        {errors.form ? <FormAlert>{errors.form}</FormAlert> : null}
        <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />

        <div className={field}>
          <label className={fieldLabel} htmlFor="cp-current">
            {mustChange ? 'Current (temporary) password' : 'Current password'}
          </label>
          <PasswordInput
            id="cp-current"
            name="current"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            inputRef={currentRef}
            invalid={Boolean(errors.current)}
            describedBy={errors.current ? 'cp-current-error' : undefined}
            autoFocus
          />
          {errors.current ? (
            <p id="cp-current-error" className={fieldError} role="alert">
              {errors.current}
            </p>
          ) : null}
        </div>

        <div className={field}>
          <label className={fieldLabel} htmlFor="cp-next">
            New password
          </label>
          <PasswordInput
            id="cp-next"
            name="next"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            inputRef={nextRef}
            invalid={Boolean(errors.next)}
            describedBy={errors.next ? 'cp-next-hint cp-next-error' : 'cp-next-hint'}
          />
          <p id="cp-next-hint" className={fieldHint}>
            8 to 128 characters.
          </p>
          {errors.next ? (
            <p id="cp-next-error" className={fieldError} role="alert">
              {errors.next}
            </p>
          ) : null}
        </div>

        <div className={field}>
          <label className={fieldLabel} htmlFor="cp-confirm">
            Re-enter new password
          </label>
          <PasswordInput
            id="cp-confirm"
            name="confirm"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            inputRef={confirmRef}
            invalid={Boolean(errors.confirm)}
            describedBy={errors.confirm ? 'cp-confirm-error' : undefined}
          />
          {errors.confirm ? (
            <p id="cp-confirm-error" className={fieldError} role="alert">
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
        {mustChange ? null : (
          <p>
            <Link href={homeHref}>Cancel and go back</Link>
          </p>
        )}
        <form action={signOut}>
          <input type="hidden" name="portal" value={portal} />
          <p>
            Not your account?{' '}
            <button type="submit" className={linkButton}>
              Sign out
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
