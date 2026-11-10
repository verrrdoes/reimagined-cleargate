'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { allowPasswordRequest, declinePasswordRequest, withdrawPasswordRequest } from '@/lib/actions/passwordRequests';
import { formatRequestCode } from '@/lib/passwordRequest';
import type { PasswordRequestRow } from '@/lib/services/passwordRequests';
import { formatDateTime, formatTime } from '@/lib/time';
import { useToast } from '@/components/ui';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill } from '@/components/ui/Pill';
import { cn } from '@/components/ui/cn';
import { actionsCell, button, mono, table, tablePrimary, tableWrap } from '@/components/ui/recipes';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

// The Registrar's list of password requests. Each decision is confirmed first; the list reloads every 15 seconds
// while the tab is visible, so a student who just asked at the desk shows up without a reload.

type Decision = 'allow' | 'decline' | 'withdraw';

const REFRESH_MS = 15_000;

const RUN = { allow: allowPasswordRequest, decline: declinePasswordRequest, withdraw: withdrawPasswordRequest };
const DONE: Record<Decision, string> = {
  allow: 'Allowed. Their screen changes within 15 seconds.',
  decline: 'Request declined.',
  withdraw: 'Approval withdrawn.',
};

const CODE = 'text-15 font-semibold tracking-[0.08em] whitespace-nowrap';

function question(r: PasswordRequestRow, decision: Decision) {
  if (decision === 'allow') {
    return {
      title: `Allow ${r.name} to set a new password?`,
      body: (
        <>
          Check their school ID (<span className={mono}>{r.studentNumber}</span>), and that their screen shows{' '}
          <strong className={mono}>{formatRequestCode(r.code)}</strong>.
        </>
      ),
      confirmLabel: 'Allow change',
      danger: false,
    };
  }
  if (decision === 'decline') {
    return {
      title: 'Decline this request?',
      body: `${r.name} (${r.studentNumber}) will need to ask again.`,
      confirmLabel: 'Decline',
      danger: true,
    };
  }
  return {
    title: 'Withdraw the approval?',
    body: `${r.name} won't be able to set a new password with this request.`,
    confirmLabel: 'Withdraw',
    danger: true,
  };
}

export function PasswordRequestsTable({ rows }: { rows: PasswordRequestRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [asking, setAsking] = useState<{ row: PasswordRequestRow; decision: Decision } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  async function confirm() {
    if (!asking) return;
    const { row, decision } = asking;
    const res = await RUN[decision]({ id: row.id });
    setAsking(null);
    if (res.ok) {
      toast.success(DONE[decision]);
      return;
    }
    toast.error(res.error.message);
    // Someone else decided, or the request ran out: show the list as it is now.
    router.refresh();
  }

  const q = asking ? question(asking.row, asking.decision) : null;

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState
          icon="key"
          title="No password requests right now."
          body="When a student asks from the Forgot password page, their request appears here."
        />
      ) : (
        // relative: the sr-only header label is absolutely placed and would otherwise widen the page on phones.
        <div className={cn(tableWrap, 'relative')}>
          <table className={table}>
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Student ID</th>
                <th scope="col">Code</th>
                <th scope="col" className="max-md:hidden">
                  Requested
                </th>
                <th scope="col">State</th>
                <th scope="col" className={actionsCell}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className={tablePrimary}>{r.name}</span>
                  </td>
                  <td>
                    <span className={cn(mono, 'whitespace-nowrap')}>{r.studentNumber}</span>
                  </td>
                  <td>
                    <span className={cn(mono, CODE)}>{formatRequestCode(r.code)}</span>
                  </td>
                  <td className="whitespace-nowrap max-md:hidden">{formatDateTime(r.createdAt)}</td>
                  <td>
                    {r.state === 'allowed' && r.approvedUntil ? (
                      <Pill tone="approved">Allowed · until {formatTime(r.approvedUntil)}</Pill>
                    ) : (
                      <Pill tone="pending">Waiting</Pill>
                    )}
                  </td>
                  <td className={actionsCell}>
                    {r.state === 'allowed' ? (
                      <button
                        type="button"
                        className={button({ size: 'sm' })}
                        onClick={() => setAsking({ row: r, decision: 'withdraw' })}
                        aria-label={`Withdraw the approval of ${r.name}`}
                      >
                        Withdraw
                      </button>
                    ) : (
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          className={button({ size: 'sm' })}
                          onClick={() => setAsking({ row: r, decision: 'decline' })}
                          aria-label={`Decline the request of ${r.name}`}
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          className={button({ variant: 'primary', size: 'sm' })}
                          onClick={() => setAsking({ row: r, decision: 'allow' })}
                          aria-label={`Allow ${r.name} to set a new password`}
                        >
                          Allow change
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={q?.title ?? ''}
        body={q?.body ?? ''}
        confirmLabel={q?.confirmLabel ?? ''}
        danger={q?.danger ?? false}
        onConfirm={confirm}
      />
    </>
  );
}
