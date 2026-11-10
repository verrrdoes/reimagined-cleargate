'use client';

import { useTransition, type ReactNode } from 'react';
import { Dialog } from '@/components/ui';
import { button, spinner } from '@/components/ui/recipes';

/**
 * A yes-or-cancel question. `onConfirm` runs in a transition; the buttons are disabled while it runs,
 * and the caller closes the dialog when it is done.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const close = () => {
    if (!pending) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      description={body}
      size="sm"
      footer={
        <>
          <button type="button" className={button()} onClick={close} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className={button({ variant: danger ? 'danger' : 'primary' })}
            onClick={() => startTransition(onConfirm)}
            disabled={pending}
            data-autofocus
          >
            {pending ? <span className={spinner} aria-hidden="true" /> : null}
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}
