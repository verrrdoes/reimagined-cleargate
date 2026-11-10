import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { button } from '@/components/ui/recipes';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main id="main" className="grid place-items-center min-h-svh p-inset bg-ground" tabIndex={-1}>
      <div
        className={
          'flex flex-col gap-4 w-[min(480px,100%)] p-8 border border-border rounded-sheet bg-surface ' +
          'max-sm:px-4 max-sm:py-6'
        }
      >
        <Logo href="/" />
        <h1>Page not found</h1>
        <p className="text-muted">
          This page does not exist, or it has moved. If you followed a link to a submission or an application, it may have
          been removed.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className={button({ variant: 'primary' })}>
            Go to ClearGate
          </Link>
        </div>
      </div>
    </main>
  );
}
