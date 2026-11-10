'use client';

import Link from 'next/link';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { forgotPassword } from '@/lib/actions/auth';
import { LIMITS } from '@/lib/constants';
import { isEmail } from '@/lib/input';
import type { Portal } from '@/lib/types';
import { button, field, fieldError, fieldLabel, input, linkButton, spinner } from '@/components/ui/recipes';
import { authCard } from '../AuthFrame';
import { FormAlert } from './FormAlert';
import { RegistrarRequest } from './RegistrarRequest';

const LIFETIME = `The link works once and expires in ${LIMITS.resetTokenMinutes} minutes.`;

/**
 * Step one of a reset. Students start by asking the Registrar (who checks their school ID in person) and can switch
 * to an emailed link; staff get the emailed link. The reply is the same whether or not the account exists.
 */
export function ForgotForm({ portal }: { portal: Portal }) {
  const back = portal === 'staff' ? '/staff-login' : '/';
  const [mode, setMode] = useState<'registrar' | 'email'>('registrar');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; demoToken?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const value = email.trim().toLowerCase();
    if (!isEmail(value)) {
      setError('Enter a valid email address.');
      inputRef.current?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await forgotPassword({ email: value });
      if (res.ok) {
        setDone(res.data);
        return;
      }
      setError(res.error.message);
      inputRef.current?.focus();
    });
  }

  if (portal === 'student' && mode === 'registrar') return <RegistrarRequest onUseEmail={() => setMode('email')} />;

  if (done) {
    return (
      <div className={authCard.root}>
        <div className={authCard.head}>
          <h1>{done.demoToken ? 'Reset link ready' : 'Check your email'}</h1>
          {done.demoToken ? null : (
            <p className={authCard.lead}>A link to set a new password goes to the email on the account.</p>
          )}
        </div>
        {done.demoToken ? (
          <>
            <FormAlert tone="info">
              Demo mode: the school has no mail server, so no email is sent. Continue here to set a new password. {LIFETIME}
            </FormAlert>
            <a className={button({ variant: 'primary', size: 'lg', block: true })} href={`/reset-password#token=${encodeURIComponent(done.demoToken)}`}>
              Continue
            </a>
          </>
        ) : (
          <FormAlert tone="success">
            {done.message} {LIFETIME}
          </FormAlert>
        )}
        <div className={authCard.links}>
          <p>
            Wrong address?{' '}
            <button
              type="button"
              className={linkButton}
              onClick={() => {
                setDone(null);
                setEmail('');
              }}
            >
              Use a different email
            </button>
          </p>
          <p>
            <Link href={back}>Back to sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={authCard.root}>
      <div className={authCard.head}>
        <h1>Forgot password</h1>
        <p className={authCard.lead}>Enter the email on your account and we will send a link to set a new password.</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <div className={field}>
          <label className={fieldLabel} htmlFor="forgot-email">
            Account email
          </label>
          <input
            ref={inputRef}
            id="forgot-email"
            name="email"
            type="email"
            inputMode="email"
            className={input}
            placeholder="School or personal email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={190}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'forgot-error' : undefined}
            autoFocus
          />
          {error ? (
            <p id="forgot-error" className={fieldError} role="alert">
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
            'Send reset link'
          )}
        </button>
      </form>

      <div className={authCard.links}>
        {portal === 'student' ? (
          <p>
            Can&apos;t open your email?{' '}
            <button type="button" className={linkButton} onClick={() => setMode('registrar')}>
              Ask the Registrar instead
            </button>
          </p>
        ) : null}
        <p>
          Remembered it? <Link href={back}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
