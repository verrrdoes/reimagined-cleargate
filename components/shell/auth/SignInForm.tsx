'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { signIn } from '@/lib/actions/auth';
import { LIMITS } from '@/lib/constants';
import type { Portal } from '@/lib/types';
import { cn } from '@/components/ui/cn';
import { FullLogo } from '@/components/ui/Logo';
import { button, check, field, fieldLabel, fieldRow, input, spinner } from '@/components/ui/recipes';
import { authCard } from '../AuthFrame';
import { FormAlert } from './FormAlert';
import { PasswordInput } from './PasswordInput';
import { PORTAL_KEY } from './portal';

type Failure = { code: string; message: string };

const COPY = {
  student: {
    title: 'Student sign in',
    lead: 'See which offices have cleared you and send what they still need.',
    loginLabel: 'Student ID or email',
    missing: 'Enter your student ID or email and your password.',
    forgot: '/forgot-password',
    other: '/staff-login',
    otherLabel: 'Go to the staff sign-in page',
  },
  staff: {
    title: 'Staff sign in',
    lead: "Review student submissions and manage your office's clearances.",
    loginLabel: 'Staff email',
    missing: 'Enter your email and your password.',
    forgot: '/forgot-password?portal=staff',
    other: '/',
    otherLabel: 'Go to the student sign-in page',
  },
} as const;

/**
 * Sign-in for one portal. `/` lets students in, `/staff-login` office staff and admins (the server checks).
 * ?login= prefills the first field; ?reset=1 confirms a password reset. Both are removed from the address bar.
 */
export function SignInForm({ portal, initialLogin, notice }: { portal: Portal; initialLogin: string; notice: 'reset' | null }) {
  const copy = COPY[portal];
  const router = useRouter();
  const [login, setLogin] = useState(initialLogin);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [showNotice, setShowNotice] = useState(notice === 'reset');
  const [pending, startTransition] = useTransition();
  const loginRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(PORTAL_KEY, portal);
    } catch {
      // Storage turned off: the password pages fall back to the student sign-in link.
    }
    const url = new URL(window.location.href);
    if (url.searchParams.has('login') || url.searchParams.has('reset')) {
      url.searchParams.delete('login');
      url.searchParams.delete('reset');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [portal]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setShowNotice(false);
    const loginValue = login.trim();
    if (!loginValue || !password) {
      setFailure({ code: 'missing_fields', message: copy.missing });
      (loginValue ? passwordRef : loginRef).current?.focus();
      return;
    }
    setFailure(null);
    startTransition(async () => {
      const res = await signIn({ login: loginValue, password, remember, portal });
      if (res.ok) {
        router.replace(res.data.redirectTo);
        return;
      }
      setFailure(res.error);
      setPassword('');
      passwordRef.current?.focus();
    });
  }

  const missing = failure?.code === 'missing_fields';
  const loginInvalid = (missing && !login.trim()) || failure?.code === 'invalid_credentials';
  const passwordInvalid = (missing && !password) || failure?.code === 'invalid_credentials';
  const otherHref = `${copy.other}${login.trim() ? `?login=${encodeURIComponent(login.trim())}` : ''}`;

  return (
    <div className={authCard.root}>
      <div className={cn(authCard.head, 'items-center text-center')}>
        <FullLogo className="mb-5" />
        <h1>{copy.title}</h1>
        <p className={cn(authCard.lead, 'text-balance')}>{copy.lead}</p>
      </div>

      {showNotice ? <FormAlert tone="success">Your password has been reset. Sign in with your new password.</FormAlert> : null}

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate aria-describedby={failure ? 'signin-error' : undefined}>
        {failure ? (
          <FormAlert id="signin-error">
            <span>{failure.message}</span>
            {failure.code === 'wrong_portal' ? (
              <Link href={otherHref} replace>
                {copy.otherLabel}
              </Link>
            ) : null}
          </FormAlert>
        ) : null}

        <div className={field}>
          <label className={fieldLabel} htmlFor="signin-login">
            {copy.loginLabel}
          </label>
          <input
            ref={loginRef}
            id="signin-login"
            name="login"
            className={input}
            type={portal === 'staff' ? 'email' : 'text'}
            inputMode={portal === 'staff' ? 'email' : 'text'}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={190}
            aria-invalid={loginInvalid || undefined}
            autoFocus={!initialLogin}
          />
        </div>

        <div className={field}>
          <div className={fieldRow}>
            <label className={fieldLabel} htmlFor="signin-password">
              Password
            </label>
            <Link href={copy.forgot} className="text-12">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="signin-password"
            name="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            inputRef={passwordRef}
            invalid={passwordInvalid}
            autoFocus={Boolean(initialLogin)}
          />
        </div>

        <label className={check}>
          <input type="checkbox" name="remember" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember me for {LIMITS.rememberDays} days
        </label>

        <button type="submit" className={button({ variant: 'primary', size: 'lg', block: true })} disabled={pending} aria-disabled={pending || undefined}>
          {pending ? (
            <>
              <span className={spinner} aria-hidden="true" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <div className={authCard.links}>
        {portal === 'student' ? (
          <>
            <p>
              New student? <Link href="/signup">Apply for an account</Link> · <Link href="/application-status">Check application status</Link>
            </p>
            <p>
              Office staff or admin? <Link href="/staff-login">Staff sign in</Link>
            </p>
          </>
        ) : (
          <p>
            Student? <Link href="/">Student sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}
