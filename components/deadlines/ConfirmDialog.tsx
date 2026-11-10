'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { FormAlert } from '@/components/shell/auth/FormAlert';
import { button } from '@/components/ui/recipes';
import type { Result } from '@/lib/result';

/**
 * Asks before a destructive step (remove a deadline, cancel a reminder, remove a picture). Runs `run`, shows
 * `success` as a toast and closes; on an error the message stays in the dialog so the person can retry or cancel.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  run,
  success,
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  body: ReactNode;
  confirmLabel: string;
  run: () => Promise<Result<unknown>>;
  success: string;
  danger?: boolean;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (pending) return;
    setError(null);
    onClose();
  };

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const res = await run();
      if (res.ok) {
        toast.success(success);
        onClose();
      } else {
        setError(res.error.message);
      }
    });
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="sm"
      title={title}
      description={body}
      footer={
        <>
          <button type="button" className={button({ variant: 'ghost' })} onClick={close} disabled={pending} data-autofocus>
            Keep it
          </button>
          <button type="button" className={button({ variant: danger ? 'danger' : 'primary' })} onClick={confirm} disabled={pending}>
            {pending ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
    </Dialog>
  );
}
