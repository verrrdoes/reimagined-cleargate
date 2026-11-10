'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from './cn';
import { Icon } from './Icon';
import { iconButton } from './recipes';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
  className?: string;
  /** Extra utilities for the scrolling body, merged over its padding and overflow. */
  bodyClassName?: string;
  /** Hides the close button in the header (the footer must then offer a way out). */
  hideClose?: boolean;
};

/** Below 640px the dialog becomes a bottom sheet. */
const DIALOG =
  'max-w-none max-h-[min(86svh,760px)] p-0 border border-border rounded-sheet bg-surface text-text shadow-overlay ' +
  'overflow-hidden open:flex backdrop:bg-scrim ' +
  'max-sm:w-full max-sm:max-h-[92svh] max-sm:mt-auto max-sm:mx-0 max-sm:mb-0 max-sm:border-x-0 max-sm:border-b-0 ' +
  'max-sm:rounded-b-none';

const DIALOG_WIDTH = {
  sm: 'w-[min(400px,calc(100vw-32px))]',
  md: 'w-[min(520px,calc(100vw-32px))]',
  lg: 'w-[min(760px,calc(100vw-32px))]',
} as const;

/**
 * A modal on the native <dialog> element: focus is trapped by the browser, Escape and a click on the
 * backdrop call `onClose`, and the page behind does not scroll. The content mounts only while open,
 * so forms inside start fresh each time. Put `data-autofocus` on the element that should take focus first.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  children,
  className,
  bodyClassName,
  hideClose,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);
  const onCloseRef = useRef(onClose);
  const pressedBackdrop = useRef(false);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    openRef.current = open;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // The browser returns focus to the opener when the dialog closes.
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cn(DIALOG, DIALOG_WIDTH[size], className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onCloseRef.current();
      }}
      onClose={() => {
        // Closed by the browser (e.g. a form with method="dialog") while the parent still thinks it is open.
        if (openRef.current) onCloseRef.current();
      }}
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // Only a press that starts and ends on the backdrop closes (not a text selection dragged outside).
        if (e.target === e.currentTarget && pressedBackdrop.current) onCloseRef.current();
        pressedBackdrop.current = false;
      }}
    >
      {open ? (
        <div className="flex flex-col w-full min-h-0 max-h-[inherit]">
          <div className="flex items-start justify-between gap-4 pt-5 px-6 max-sm:pt-4 max-sm:px-4">
            <div>
              <h2 id={titleId} className="text-16 font-semibold">
                {title}
              </h2>
              {description ? (
                <p id={descId} className="mt-1 text-muted">
                  {description}
                </p>
              ) : null}
            </div>
            {hideClose ? null : (
              <button type="button" className={cn(iconButton(), '-mt-1.5 -mr-2')} aria-label="Close" onClick={() => onCloseRef.current()}>
                <Icon name="x" size={18} />
              </button>
            )}
          </div>
          {children ? (
            <div
              className={cn(
                'flex-auto min-h-0 pt-4 px-6 pb-5 overflow-y-auto max-sm:pt-3 max-sm:px-4 max-sm:pb-4',
                bodyClassName,
              )}
            >
              {children}
            </div>
          ) : null}
          {footer ? (
            <div
              className={
                'flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-rule ' +
                'max-sm:px-4 max-sm:pt-3 max-sm:pb-[calc(12px+env(safe-area-inset-bottom))]'
              }
            >
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
