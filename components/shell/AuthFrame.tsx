import type { ReactNode } from 'react';
import { ClearanceSlip, type SlipItem } from '@/components/ui/ClearanceSlip';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from './ThemeToggle';

// An illustration of the slip for the sign-in pages: the six offices with no dates or people attached.
const EXAMPLE_SLIP: SlipItem[] = [
  { officeCode: 'library', officeName: 'Library', icon: 'book', status: 'approved' },
  { officeCode: 'accounting', officeName: 'Accounting', icon: 'wallet', status: 'needs_action' },
  { officeCode: 'registrar', officeName: 'Registrar', icon: 'file', status: 'approved' },
  { officeCode: 'guidance', officeName: 'Guidance Office', icon: 'heart', status: 'pending' },
  { officeCode: 'dean', officeName: "Dean's Office", icon: 'cap', status: 'pending' },
  { officeCode: 'property', officeName: 'Property Custodian', icon: 'box', status: 'pending' },
];

/**
 * The card a page inside the frame renders: 400px, or 720px with `wide` added (`cn(authCard.root, authCard.wide)`).
 * Text inputs in it are 40px tall.
 */
export const authCard = {
  root: 'flex flex-col gap-6 w-full max-w-[400px] mx-auto [&_input:not([type=checkbox])]:h-10',
  wide: 'max-w-[720px]',
  head: 'flex flex-col gap-1.5',
  lead: 'text-muted',
  links: 'flex flex-col gap-1.5 pt-4 border-t border-rule text-muted',
};

/**
 * The frame for pages outside the app: sign-in, passwords and sign-up. On wide screens a tinted side panel
 * explains the slip; the page itself sits on a white sheet. Pages render their own card (`authCard`).
 */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[400px_minmax(0,1fr)] min-h-svh bg-ground max-lg:grid-cols-1">
      <aside
        className="sticky top-0 flex flex-col gap-6 h-svh pt-6 px-8 pb-8 max-lg:hidden print:hidden!"
        aria-label="About ClearGate"
      >
        <Logo href="/" size={28} />
        <p className="max-w-[34ch] text-muted text-15">
          End-of-term clearance in one place. Each office marks its part, and students send what is still needed.
        </p>
        <figure className="mt-auto flex flex-col gap-3">
          <div aria-hidden="true">
            <ClearanceSlip items={EXAMPLE_SLIP} label="Example clearance slip" />
          </div>
          <figcaption className="text-12 text-muted">
            Every office has a cell on the slip. It is stamped when that office clears the student, outlined in orange when
            something is needed, and dashed while it waits.
          </figcaption>
        </figure>
      </aside>

      <main
        id="main"
        className="flex flex-col min-w-0 py-inset pr-inset max-lg:pt-0 max-lg:pl-inset max-sm:p-0"
        tabIndex={-1}
      >
        <div className="hidden items-center justify-between h-topbar px-1 max-lg:flex max-sm:px-3 print:hidden!">
          <Logo href="/" size={24} />
          <ThemeToggle />
        </div>
        <div
          className={
            'relative flex flex-auto flex-col pt-12 px-6 pb-6 border border-border rounded-sheet bg-surface ' +
            'focus:outline-none max-lg:pt-8 max-sm:px-4 max-sm:py-6 max-sm:border-x-0 max-sm:border-b-0 ' +
            'max-sm:rounded-none print:m-0 print:p-0 print:border-0 print:rounded-none'
          }
        >
          <div className="absolute top-3 right-3 max-lg:hidden print:hidden!">
            <ThemeToggle />
          </div>
          <div className="w-full my-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
