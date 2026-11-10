'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Logo } from '@/components/ui/Logo';
import { button, mono } from '@/components/ui/recipes';

/** Any page that fails to render. Shows the error reference so it can be matched with the server log. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error && typeof error === 'object' && 'digest' in error && typeof (error as { digest?: unknown }).digest === 'string'
      ? (error as { digest: string }).digest
      : null;

  useEffect(() => {
    console.error('ClearGate page error:', digest ?? error);
  }, [error, digest]);

  return (
    <main id="main" className="grid place-items-center min-h-svh p-inset bg-ground" tabIndex={-1}>
      <div
        className={
          'flex flex-col gap-4 w-[min(480px,100%)] p-8 border border-border rounded-sheet bg-surface ' +
          'max-sm:px-4 max-sm:py-6'
        }
        role="alert"
      >
        <Logo href="/" />
        <h1>This page could not load</h1>
        <p className="text-muted">
          Something went wrong on our side, or the connection dropped. Try again; if it keeps happening, tell the Registrar
          or an admin what you were doing and the reference below.
        </p>
        {digest ? (
          <p className="text-12 text-muted">
            Reference: <span className={mono}>{digest}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={button({ variant: 'primary' })} onClick={() => retry()}>
            Try again
          </button>
          <Link href="/" className={button()}>
            Go to ClearGate
          </Link>
        </div>
      </div>
    </main>
  );
}
