'use client';

import { useState, useTransition } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { FormAlert } from '@/components/shell/auth/FormAlert';
import { cn } from '@/components/ui/cn';
import { alert, alertBody, button, spinner } from '@/components/ui/recipes';
import { approveSelected } from '@/lib/actions/office-status';
import { plural } from './format';
import type { QueueRow } from './types';

/** How many Needs action names the warning lists before "and N more". */
const NAMES_SHOWN = 5;

/**
 * Confirms Approve selected on Clearance status. Warns when some of the chosen students are marked Needs action,
 * since approving them clears what they were asked to do. On success it toasts the count and calls `onDone`.
 */
export function ApproveSelectedDialog({
  open,
  rows,
  showOffice,
  onClose,
  onDone,
}: {
  open: boolean;
  rows: QueueRow[];
  showOffice: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // One person can have several rows in the every-office view, so that view counts sign-offs.
  const noun = (n: number) => (showOffice ? plural(n, 'sign-off', 'sign-offs') : plural(n, 'student', 'students'));
  const offices = [...new Set(rows.map((r) => r.officeName))];
  const flagged = rows.filter((r) => r.status === 'needs_action');
  const names = flagged.slice(0, NAMES_SHOWN).map((r) => r.studentName);
  const more = flagged.length - names.length;

  const close = () => {
    if (pending) return;
    setError(null);
    onClose();
  };

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const res = await approveSelected({ itemIds: rows.map((r) => r.itemId) });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      const { approved, skipped } = res.data;
      const skippedText = skipped
        ? ` ${noun(skipped)} ${skipped === 1 ? 'was' : 'were'} skipped: approved already, or an upload came in.`
        : '';
      toast.success(`Approved ${noun(approved)}.${skippedText}`);
      onDone();
    });
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="sm"
      title={`Approve ${noun(rows.length)}?`}
      description={
        offices.length === 1
          ? `Each student gets a “${offices[0]} cleared you” notification. Their history notes it was approved with Approve selected.`
          : 'Each student gets a notification that the office cleared them. Their history notes it was approved with Approve selected.'
      }
      footer={
        <>
          <button type="button" className={button()} onClick={close} disabled={pending}>
            Cancel
          </button>
          <button type="button" className={button({ variant: 'primary' })} onClick={confirm} disabled={pending} data-autofocus>
            {pending ? <span className={spinner} aria-hidden="true" /> : null}
            Approve {noun(rows.length)}
          </button>
        </>
      }
    >
      {flagged.length || error ? (
        <div className="flex flex-col gap-3">
          {flagged.length ? (
            <div className={alert('action')}>
              <Icon name="alert" />
              <div className={alertBody}>
                <strong>
                  {flagged.length === rows.length
                    ? flagged.length === 1
                      ? 'This student is marked Needs action.'
                      : 'All of them are marked Needs action.'
                    : `${flagged.length} of them ${flagged.length === 1 ? 'is' : 'are'} marked Needs action.`}
                </strong>
                <span>
                  {names.join(', ')}
                  {more ? ` and ${more} more` : ''}. Approving clears what they were asked to do, so check they don&apos;t
                  still owe anything.
                </span>
              </div>
            </div>
          ) : null}
          {error ? <FormAlert>{error}</FormAlert> : null}
        </div>
      ) : null}
    </Dialog>
  );
}

/** The bar under the table while students are selected. */
export function SelectionBar({
  count,
  flagged,
  showOffice,
  onClear,
  onApprove,
}: {
  count: number;
  flagged: number;
  showOffice: boolean;
  onClear: () => void;
  onApprove: () => void;
}) {
  const noun = showOffice ? plural(count, 'sign-off', 'sign-offs') : plural(count, 'student', 'students');
  return (
    <div
      role="region"
      aria-label="Selected students"
      className={cn(
        'sticky bottom-4 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 mt-3 px-4 py-3',
        'border border-border rounded-card bg-surface shadow-overlay print:hidden',
      )}
    >
      <span>
        <strong className="tabular-nums">{count}</strong> selected
        {flagged ? <span className="text-action-line"> · {flagged} marked Needs action</span> : null}
      </span>
      <button type="button" className={button({ variant: 'ghost', size: 'sm' })} onClick={onClear}>
        Clear
      </button>
      <button type="button" className={cn(button({ variant: 'primary', size: 'sm' }), 'ml-auto max-sm:w-full')} onClick={onApprove}>
        <Icon name="check" />
        Approve {noun}
      </button>
    </div>
  );
}
