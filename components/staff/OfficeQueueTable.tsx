'use client';

import { useState } from 'react';
import Link from 'next/link';
import { dueLine, dueState, type DueTone } from '@/lib/deadline';
import { formatDate } from '@/lib/time';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { StatusPill } from '@/components/ui/Pill';
import { useNow } from '@/components/ui/clock';
import { actionsCell, button, iconButton, mono, table, tablePrimary, tableSecondary, tableWrap } from '@/components/ui/recipes';
import { ChatDialog } from '@/components/chat/ChatDialog';
import { ReminderDialog, StudentDeadlineDialog, type DeadlineItem, type OfficeChoice } from '@/components/deadlines';
import { ItemEditor } from './ItemEditor';
import { ApproveSelectedDialog, SelectionBar } from './ApproveSelectedDialog';
import type { QueueRow } from './types';

const DUE_TONE: Record<DueTone, string> = {
  overdue: 'text-negative',
  action: 'text-action-line',
  pending: 'text-warning',
  info: 'text-muted',
  muted: 'text-muted',
};

const ICON_BUTTON = iconButton({ size: 'sm' });

const CHECKBOX = 'block size-4 m-0 accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50';

/** Approve selected takes sign-offs that aren't approved yet and have no upload waiting (those get reviewed). */
const canBulkApprove = (r: QueueRow) => r.status !== 'approved' && r.waitingSubmissionId === null;

function DueText({ row, now }: { row: QueueRow; now: number }) {
  if (!row.dueAt || row.status === 'approved') return null;
  const state = dueState(row.dueAt, row.status, now);
  return (
    <span className="block mt-0.5 text-12">
      <span className={cn('font-medium', DUE_TONE[state.tone])} title={dueLine(row.dueAt)}>
        {state.text}
      </span>
      {row.ownDueAt ? <span className="text-muted"> · Own deadline</span> : null}
    </span>
  );
}

/** A queue row in the shape the deadline and reminder dialogs take. */
const asDeadlineItem = (r: QueueRow): DeadlineItem => ({
  id: r.itemId,
  studentName: r.studentName,
  studentNumber: r.studentNumber,
  officeCode: r.officeCode,
  officeName: r.officeName,
  status: r.status,
  task: r.task,
  ownDueAt: r.ownDueAt,
  officeDueAt: r.officeDueAt,
});

/**
 * The Clearance Status table with one item editor, one chat dialog, one deadline dialog and one reminder
 * dialog for the whole list (legacy office queue: Update, Message, Deadline, and Remind while not approved).
 * Rows arrive filtered and ordered (status, then student name) from the server. Checkboxes pick sign-offs for
 * Approve selected; the header box picks every one shown that can be approved.
 */
export function OfficeQueueTable({
  rows,
  showOffice,
  termLine,
  serverNow,
}: {
  rows: QueueRow[];
  showOffice: boolean;
  termLine: string;
  serverNow: string;
}) {
  const now = useNow(30_000, serverNow);
  const [editing, setEditing] = useState<QueueRow | null>(null);
  const [chatItem, setChatItem] = useState<number | null>(null);
  const [deadlineFor, setDeadlineFor] = useState<DeadlineItem | null>(null);
  const [remindFor, setRemindFor] = useState<DeadlineItem | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  // The rows being confirmed, kept as they were when the dialog opened (the list refreshes once they're approved).
  const [confirming, setConfirming] = useState<QueueRow[] | null>(null);

  // Picks that left the list (another tab, a search, or approved meanwhile) simply stop counting.
  const eligible = rows.filter(canBulkApprove);
  const chosen = eligible.filter((r) => selected.has(r.itemId));
  const allChosen = eligible.length > 0 && chosen.length === eligible.length;
  const flagged = chosen.filter((r) => r.status === 'needs_action').length;

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(eligible.map((r) => r.itemId)));

  const remindOffices: OfficeChoice[] = remindFor
    ? [{ code: remindFor.officeCode, name: remindFor.officeName, dueAt: remindFor.officeDueAt }]
    : [];

  return (
    <>
      <div className={tableWrap}>
        <table className={table}>
          <thead>
            <tr>
              <th scope="col" className="w-px">
                <input
                  type="checkbox"
                  className={CHECKBOX}
                  aria-label="Select every student shown who can be approved"
                  title={eligible.length ? 'Select every student shown who can be approved' : 'No one shown can be approved here'}
                  checked={allChosen}
                  ref={(el) => {
                    if (el) el.indeterminate = chosen.length > 0 && !allChosen;
                  }}
                  disabled={eligible.length === 0}
                  onChange={toggleAll}
                />
              </th>
              <th scope="col">Student</th>
              {showOffice ? <th scope="col">Office</th> : null}
              <th scope="col">Status</th>
              <th scope="col">Requirement</th>
              <th scope="col" className="max-sm:hidden">
                Updated
              </th>
              <th scope="col" className={actionsCell}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.itemId} className={selected.has(r.itemId) && canBulkApprove(r) ? '[&_td]:bg-raised' : undefined}>
                <td>
                  {r.status === 'approved' ? null : r.waitingSubmissionId !== null ? (
                    <input
                      type="checkbox"
                      className={CHECKBOX}
                      disabled
                      aria-label={`${r.studentName} has an upload waiting. Review it instead.`}
                      title="Has an upload waiting: review it instead"
                    />
                  ) : (
                    <input
                      type="checkbox"
                      className={CHECKBOX}
                      aria-label={`Select ${r.studentName}`}
                      checked={selected.has(r.itemId)}
                      onChange={() => toggle(r.itemId)}
                    />
                  )}
                </td>
                <td>
                  <span className={tablePrimary}>{r.studentName}</span>
                  <span className={cn(mono, tableSecondary)}>{r.studentNumber}</span>
                </td>
                {showOffice ? <td>{r.officeName}</td> : null}
                <td>
                  <StatusPill status={r.status} />
                </td>
                <td className="min-w-[180px] max-w-[380px] wrap-anywhere max-sm:min-w-[140px]">
                  <span>{r.task}</span>
                  <span className={tableSecondary}>{r.remarks}</span>
                  {r.waitingSubmissionId !== null ? (
                    <Link
                      href={`/review/${r.waitingSubmissionId}`}
                      className="inline-block mt-0.5 text-12 font-medium text-accent hover:underline hover:underline-offset-2"
                    >
                      Upload waiting · Review it<span className="sr-only"> for {r.studentName}</span>
                    </Link>
                  ) : null}
                  <DueText row={r} now={now} />
                </td>
                <td className="whitespace-nowrap max-sm:hidden">
                  <time dateTime={r.updatedAt}>{formatDate(r.updatedAt)}</time>
                </td>
                <td className={actionsCell}>
                  <span className="inline-flex items-center gap-1">
                    <button type="button" className={button({ size: 'sm' })} onClick={() => setEditing(r)}>
                      Update<span className="sr-only"> {r.studentName}</span>
                    </button>
                    <button
                      type="button"
                      className={ICON_BUTTON}
                      aria-label={`Message ${r.studentName}`}
                      title="Message"
                      onClick={() => setChatItem(r.itemId)}
                    >
                      <Icon name="message" size={16} />
                    </button>
                    <button
                      type="button"
                      className={ICON_BUTTON}
                      aria-label={`Deadline for ${r.studentName}`}
                      title="Deadline"
                      onClick={() => setDeadlineFor(asDeadlineItem(r))}
                    >
                      <Icon name="clock" size={16} />
                    </button>
                    {r.status !== 'approved' ? (
                      <button
                        type="button"
                        className={ICON_BUTTON}
                        aria-label={`Remind ${r.studentName}`}
                        title="Send a reminder"
                        onClick={() => setRemindFor(asDeadlineItem(r))}
                      >
                        <Icon name="bell" size={16} />
                      </button>
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {chosen.length ? (
        <SelectionBar
          count={chosen.length}
          flagged={flagged}
          showOffice={showOffice}
          onClear={() => setSelected(new Set())}
          onApprove={() => setConfirming(chosen)}
        />
      ) : null}

      <ApproveSelectedDialog
        open={confirming !== null}
        rows={confirming ?? []}
        showOffice={showOffice}
        onClose={() => setConfirming(null)}
        onDone={() => {
          setConfirming(null);
          setSelected(new Set());
        }}
      />
      <ItemEditor row={editing} termLine={termLine} onClose={() => setEditing(null)} />
      <ChatDialog itemId={chatItem ?? 0} open={chatItem !== null} onClose={() => setChatItem(null)} viewer="office" />
      <StudentDeadlineDialog
        open={deadlineFor !== null}
        onClose={() => setDeadlineFor(null)}
        item={deadlineFor}
        items={deadlineFor ? [deadlineFor] : []}
        showOffice={showOffice}
        serverNow={serverNow}
      />
      <ReminderDialog
        open={remindFor !== null}
        onClose={() => setRemindFor(null)}
        isAdmin={showOffice}
        offices={remindOffices}
        items={remindFor ? [remindFor] : []}
        fixedItem={remindFor}
        serverNow={serverNow}
      />
    </>
  );
}
