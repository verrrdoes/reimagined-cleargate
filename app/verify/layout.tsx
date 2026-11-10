import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/shell/ThemeToggle';

/** Public: the frame for checking a clearance certificate. No sign-in, no app shell. */
export default function VerifyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-ground px-4 py-8 max-sm:px-0 max-sm:py-0">
      <div className="flex flex-col gap-4 w-full max-w-[600px] mx-auto">
        <div className="flex items-center justify-between h-topbar px-1 max-sm:px-4">
          <Logo size={24} />
          <ThemeToggle />
        </div>
        <main
          id="main"
          tabIndex={-1}
          className="p-8 border border-border rounded-sheet bg-surface focus:outline-none max-sm:px-4 max-sm:py-6 max-sm:border-x-0 max-sm:rounded-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
