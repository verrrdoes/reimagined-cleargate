'use client';

import { useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { FormAlert } from '@/components/shell/auth/FormAlert';
import { PasswordInput } from '@/components/shell/auth/PasswordInput';
import { button, field, fieldError, fieldHint, fieldLabel, formActions, formGrid } from '@/components/ui/recipes';
import { changePassword } from '@/lib/actions/auth';

const chars = (s: string) => Array.from(s).length;

type Errors = { current?: string; next?: string; confirm?: string; form?: string };

/**
 * Change password, inline on My profile. Stays on the page and clears the fields when it is saved.
 * `username` (the account email) sits in a hidden field so password managers save to the right account.
 */
export function PasswordForm({ portal, username }: { portal: 'student' | 'staff'; username: string }) {
  const router = useRouter();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const ids = {
    current: `${id}-current`,
    currentErr: `${id}-current-error`,
    next: `${id}-next`,
    nextHint: `${id}-next-hint`,
    nextErr: `${id}-next-error`,
    confirm: `${id}-confirm`,
    confirmErr: `${id}-confirm-error`,
  };

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
        setCurrent('');
        setNext('');
        setConfirm('');
        toast.success('Your password was changed.');
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
    <form className="flex flex-col gap-4 max-w-[560px]" onSubmit={onSubmit} noValidate>
      {errors.form ? <FormAlert>{errors.form}</FormAlert> : null}
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      <div className={field}>
        <label className={fieldLabel} htmlFor={ids.current}>
          Current password
        </label>
        <PasswordInput
          id={ids.current}
          name="current"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          inputRef={currentRef}
          invalid={Boolean(errors.current)}
          describedBy={errors.current ? ids.currentErr : undefined}
        />
        {errors.current ? (
          <p id={ids.currentErr} className={fieldError}>
            {errors.current}
          </p>
        ) : null}
      </div>
      <div className={formGrid}>
        <div className={field}>
          <label className={fieldLabel} htmlFor={ids.next}>
            New password
          </label>
          <PasswordInput
            id={ids.next}
            name="next"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            inputRef={nextRef}
            invalid={Boolean(errors.next)}
            describedBy={errors.next ? `${ids.nextHint} ${ids.nextErr}` : ids.nextHint}
          />
          <p id={ids.nextHint} className={fieldHint}>
            8 to 128 characters.
          </p>
          {errors.next ? (
            <p id={ids.nextErr} className={fieldError}>
              {errors.next}
            </p>
          ) : null}
        </div>
        <div className={field}>
          <label className={fieldLabel} htmlFor={ids.confirm}>
            Re-enter new password
          </label>
          <PasswordInput
            id={ids.confirm}
            name="confirm"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            inputRef={confirmRef}
            invalid={Boolean(errors.confirm)}
            describedBy={errors.confirm ? ids.confirmErr : undefined}
          />
          {errors.confirm ? (
            <p id={ids.confirmErr} className={fieldError}>
              {errors.confirm}
            </p>
          ) : null}
        </div>
      </div>
      <div className={formActions}>
        <button type="submit" className={button({ variant: 'primary' })} disabled={pending}>
          {pending ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </form>
  );
}
