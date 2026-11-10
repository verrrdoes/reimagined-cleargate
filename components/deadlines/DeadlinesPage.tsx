'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { OfficeIcon } from '@/components/ui/OfficeIcon';
import { Pill, StatusPill } from '@/components/ui/Pill';
import { EmptyState } from '@/components/ui/EmptyState';
import { DueBadge } from '@/components/ui/DueBadge';
import { Countdown } from '@/components/ui/Countdown';
import { useNow } from '@/components/ui/clock';
import { cn } from '@/components/ui/cn';
import {
  actionsCell,
  button,
  kpi,
  kpiLabel,
  kpiMeta,
  kpiValue,
  mono,
  numCell,
  pageHead,
  pageHeadSub,
  section,
  sectionHead,
  table,
  tablePrimary,
  tableSecondary,
  tableWrap,
} from '@/components/ui/recipes';
import { cancelReminder, clearOfficeDeadline, saveStudentDeadline } from '@/lib/actions/deadlines';
import { spanText } from '@/lib/deadline';
import { formatDateTime, prettyDue } from '@/lib/time';
import { ConfirmDialog } from './ConfirmDialog';
import { OfficeDeadlineDialog, type OfficeDeadlineTarget } from './OfficeDeadlineDialog';
import { ReminderDialog } from './ReminderDialog';
import { StudentDeadlineDialog } from './StudentDeadlineDialog';
import { DueText, plural } from './shared';
import type { DeadlineItem, DeadlineOffice, DeadlinesView, ReminderRow } from './types';

type Open =
  | { kind: 'office'; office: OfficeDeadlineTarget }
  | { kind: 'clear-office'; office: DeadlineOffice }
  | { kind: 'student'; item: DeadlineItem | null }
  | { kind: 'clear-student'; item: DeadlineItem }
  | { kind: 'reminder'; office: string | null }
  | { kind: 'cancel-reminder'; reminder: ReminderRow }
  | null;

const AUDIENCE_TEXT = { outstanding: 'Everyone not cleared', overdue: 'Students past the deadline' } as const;

const DL_TABLE = cn(table, '[&_td]:align-top');
const ROW_ACTIONS = 'flex flex-nowrap items-center justify-end gap-2';
const SECONDARY_ID = cn(mono, tableSecondary);

/** The Deadlines and reminders page (staff: their office; admins: every office). */
export function DeadlinesPage({ view }: { view: DeadlinesView }) {
  const { term, isAdmin, offices, items, reminders, serverNow, ownOfficeCode } = view;
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const now = useNow(60_000, serverNow);

  const ownDeadlines = useMemo(() => items.filter((i) => i.ownDueAt !== null), [items]);
  const officeChoices = useMemo(() => offices.map((o) => ({ code: o.code, name: o.name, dueAt: o.dueAt })), [offices]);

  const head = (
    <header className={pageHead}>
      <h1>Deadlines and reminders</h1>
      <p className={pageHeadSub}>Set when students must be cleared by, and remind the ones who aren&apos;t.</p>
    </header>
  );

  if (view.noOffice) {
    return (
      <>
        {head}
        <EmptyState
          icon="building"
          title="Your staff account is not linked to an office."
          body="Ask an administrator to link it to your office in Staff accounts. Deadlines are set per office."
        />
      </>
    );
  }

  if (!term) {
    return (
      <>
        {head}
        <EmptyState
          icon="calendar"
          title="No current academic year is set yet."
          body={
            isAdmin
              ? 'Deadlines belong to a term. Set the current academic year in Settings first.'
              : 'Deadlines belong to a term. Ask an administrator to set the current academic year.'
          }
          action={
            isAdmin ? (
              <Link href="/settings" className={button()}>
                Open settings
              </Link>
            ) : undefined
          }
        />
      </>
    );
  }

  // Stats: the soonest deadline still ahead, what is left to clear, and what is queued.
  const next = offices
    .filter((o) => o.dueAt && Date.parse(o.dueAt) > now)
    .sort((a, b) => Date.parse(a.dueAt as string) - Date.parse(b.dueAt as string))[0];
  const outstanding = offices.reduce((n, o) => n + o.outstanding, 0);
  const overdue = offices.reduce((n, o) => n + o.overdue, 0);
  const scheduled = reminders.filter((r) => !r.sentAt && !r.cancelledAt).length;

  const canCancel = (r: ReminderRow) => !r.sentAt && !r.cancelledAt && (isAdmin || (r.officeCode !== null && r.officeCode === ownOfficeCode));

  const confirm = confirmFor(open);

  return (
    <>
      {head}

      <section
        className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-6 max-lg:grid-cols-2 max-sm:grid-cols-1 max-sm:gap-3"
        aria-label="Summary"
      >
        <div className={cn(kpi, 'max-lg:col-span-full')}>
          <span className={kpiLabel}>{next ? `Next deadline · ${next.name}` : 'Next deadline'}</span>
          {next?.dueAt ? (
            <Countdown
              due={next.dueAt}
              serverNow={serverNow}
              label={`Time left until the ${next.name} deadline`}
              className="mt-1 mb-0.5"
            />
          ) : (
            <span className={kpiValue}>None</span>
          )}
          <span className={kpiMeta}>{next?.dueAt ? prettyDue(next.dueAt) : 'No upcoming deadline this term'}</span>
        </div>
        <div className={kpi}>
          <span className={kpiLabel}>{isAdmin ? 'Requirements not cleared' : 'Students not cleared'}</span>
          <span className={kpiValue}>{outstanding}</span>
          <span className={kpiMeta}>{overdue ? `${overdue} past the deadline` : 'None past the deadline'}</span>
        </div>
        <div className={kpi}>
          <span className={kpiLabel}>Scheduled reminders</span>
          <span className={kpiValue}>{scheduled}</span>
          <span className={kpiMeta}>Automatic alerts also go out 3 days and 1 day before a deadline</span>
        </div>
      </section>

      {/* ---------- Office deadlines ---------- */}
      <section className={section} aria-labelledby="dl-offices">
        <div className={sectionHead}>
          <div>
            <h2 id="dl-offices">Office deadlines</h2>
            <p className="text-12 text-muted">
              {term.text} · students can still submit after a deadline, but it shows as overdue.
            </p>
          </div>
          {isAdmin && offices.length > 1 ? (
            <button type="button" className={button()} onClick={() => setOpen({ kind: 'office', office: 'all' })}>
              <Icon name="calendar" />
              Set for every office
            </button>
          ) : null}
        </div>

        {offices.length ? (
          <div className={tableWrap}>
            <table className={DL_TABLE}>
              <thead>
                <tr>
                  <th scope="col">Office</th>
                  <th scope="col">Deadline</th>
                  <th scope="col" className={numCell}>
                    Not cleared
                  </th>
                  <th scope="col">Note</th>
                  <th scope="col" className={actionsCell}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {offices.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="flex items-start gap-2.5">
                        <OfficeIcon icon={o.icon} className="flex-none mt-0.5 text-muted" />
                        <div>
                          <span className={tablePrimary}>{o.name}</span>
                          {o.dueAt && o.setBy ? <span className={tableSecondary}>Set by {o.setBy}</span> : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      {o.dueAt ? (
                        <div className="flex flex-col items-start gap-1">
                          <span className="whitespace-nowrap">{prettyDue(o.dueAt)}</span>
                          <DueBadge due={o.dueAt} status={o.outstanding ? 'pending' : 'approved'} serverNow={serverNow} />
                        </div>
                      ) : (
                        <span className="text-muted">No deadline</span>
                      )}
                      {o.autoClear ? (
                        <span className={tableSecondary} title="Students the office never updated are cleared when the deadline passes">
                          {o.dueAt ? 'Auto-clear on' : 'Auto-clear on: set a deadline to use it'}
                        </span>
                      ) : null}
                    </td>
                    <td className={numCell}>
                      <span className={cn(tablePrimary, 'whitespace-nowrap')}>
                        {o.outstanding} of {o.students}
                      </span>
                      {o.overdue ? <span className={cn(tableSecondary, 'text-negative')}>{o.overdue} overdue</span> : null}
                      {o.ownDeadlines ? (
                        <span className={tableSecondary}>
                          {o.ownDeadlines === 1
                            ? '1 student has their own'
                            : `${o.ownDeadlines} students have their own`}
                        </span>
                      ) : null}
                    </td>
                    <td className="min-w-[180px] max-w-[320px] wrap-anywhere">
                      {o.note ? o.note : <span className="text-muted">None</span>}
                    </td>
                    <td className={actionsCell}>
                      <div className={ROW_ACTIONS}>
                        <button
                          type="button"
                          className={button({ size: 'sm' })}
                          onClick={() => setOpen({ kind: 'office', office: o })}
                          aria-label={o.dueAt ? `Change the ${o.name} deadline` : `Set the ${o.name} deadline`}
                        >
                          {o.dueAt ? 'Change' : 'Set deadline'}
                        </button>
                        <button
                          type="button"
                          className={button({ variant: 'ghost', size: 'sm' })}
                          onClick={() => setOpen({ kind: 'reminder', office: o.code })}
                          disabled={o.outstanding === 0}
                          aria-label={`Remind ${o.name} students`}
                          title={o.outstanding === 0 ? 'Everyone at this office is cleared' : undefined}
                        >
                          Remind
                        </button>
                        {o.dueAt ? (
                          <button
                            type="button"
                            className={button({ variant: 'ghost', size: 'sm' })}
                            onClick={() => setOpen({ kind: 'clear-office', office: o })}
                            aria-label={`Remove the ${o.name} deadline`}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="building" title="No active offices." body="Offices that take part in clearance show here once they are active." />
        )}
      </section>

      {/* ---------- Students with their own deadline ---------- */}
      <section className={section} aria-labelledby="dl-own">
        <div className={sectionHead}>
          <div>
            <h2 id="dl-own">Student deadlines</h2>
            <p className="text-12 text-muted">Students who have their own date instead of the office deadline.</p>
          </div>
          <button type="button" className={button()} onClick={() => setOpen({ kind: 'student', item: null })}>
            <Icon name="plus" />
            Add
          </button>
        </div>

        {ownDeadlines.length ? (
          <div className={tableWrap}>
            <table className={DL_TABLE}>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  {isAdmin ? <th scope="col">Office</th> : null}
                  <th scope="col">Their deadline</th>
                  <th scope="col">Office deadline</th>
                  <th scope="col">Status</th>
                  <th scope="col" className={actionsCell}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ownDeadlines.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <span className={tablePrimary}>{i.studentName}</span>
                      <span className={SECONDARY_ID}>{i.studentNumber}</span>
                    </td>
                    {isAdmin ? <td>{i.officeName}</td> : null}
                    <td>
                      <span className="whitespace-nowrap">{prettyDue(i.ownDueAt as string)}</span>
                      <span className="block">
                        <DueText due={i.ownDueAt as string} status={i.status} serverNow={serverNow} />
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      {i.officeDueAt ? prettyDue(i.officeDueAt) : <span className="text-muted">None set</span>}
                    </td>
                    <td>
                      <StatusPill status={i.status} />
                    </td>
                    <td className={actionsCell}>
                      <div className={ROW_ACTIONS}>
                        <button
                          type="button"
                          className={button({ size: 'sm' })}
                          onClick={() => setOpen({ kind: 'student', item: i })}
                          aria-label={`Change ${i.studentName}'s deadline`}
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          className={button({ variant: 'ghost', size: 'sm' })}
                          onClick={() => setOpen({ kind: 'clear-student', item: i })}
                          aria-label={`Remove ${i.studentName}'s own deadline`}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="users"
            title="Every student follows their office's deadline."
            body="Give a student their own date when they need more time, or less."
          />
        )}
      </section>

      {/* ---------- Reminders ---------- */}
      <section className={section} aria-labelledby="dl-reminders">
        <div className={sectionHead}>
          <div>
            <h2 id="dl-reminders">Reminders</h2>
            <p className="text-12 text-muted">Sent and scheduled reminders, newest first.</p>
          </div>
          {offices.length ? (
            <button type="button" className={button()} onClick={() => setOpen({ kind: 'reminder', office: null })}>
              <Icon name="megaphone" />
              New reminder
            </button>
          ) : null}
        </div>

        {reminders.length ? (
          <div className={tableWrap}>
            <table className={DL_TABLE}>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                  <th scope="col">Message</th>
                  <th scope="col">Status</th>
                  <th scope="col" className={actionsCell}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {reminders.map((r) => {
                  const scheduledRow = !r.sentAt && !r.cancelledAt;
                  const at = r.sentAt ?? r.sendAt;
                  const ahead = Date.parse(r.sendAt) - now;
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">
                        <span className={tablePrimary}>{formatDateTime(at)}</span>
                        {scheduledRow ? (
                          <span className={tableSecondary}>{ahead > 0 ? `in ${spanText(ahead)}` : 'Going out shortly'}</span>
                        ) : null}
                      </td>
                      <td>
                        <span className={tablePrimary}>{r.officeName ?? 'Every office'}</span>
                        {r.createdByName ? <span className={tableSecondary}>{r.createdByName}</span> : null}
                      </td>
                      <td>
                        {r.audience === 'student' ? (
                          r.studentName ? (
                            <>
                              <span className={tablePrimary}>{r.studentName}</span>
                              {r.studentNumber ? <span className={SECONDARY_ID}>{r.studentNumber}</span> : null}
                            </>
                          ) : (
                            <span className="text-muted">One student</span>
                          )
                        ) : (
                          AUDIENCE_TEXT[r.audience]
                        )}
                      </td>
                      <td className="min-w-[220px] max-w-[420px] wrap-anywhere">{r.message}</td>
                      <td>
                        {r.cancelledAt ? (
                          <Pill tone="muted">Cancelled</Pill>
                        ) : r.sentAt ? (
                          <Pill tone="info">Sent to {plural(r.recipients ?? 0, 'student')}</Pill>
                        ) : (
                          <Pill tone="pending">Scheduled</Pill>
                        )}
                      </td>
                      <td className={actionsCell}>
                        {canCancel(r) ? (
                          <button
                            type="button"
                            className={button({ variant: 'ghost', size: 'sm' })}
                            onClick={() => setOpen({ kind: 'cancel-reminder', reminder: r })}
                            aria-label={`Cancel the reminder set for ${prettyDue(r.sendAt)}`}
                          >
                            Cancel
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="bell"
            title="No reminders yet."
            body="Automatic ones still go out 3 days and 1 day before a deadline."
          />
        )}
      </section>

      <OfficeDeadlineDialog
        open={open?.kind === 'office'}
        onClose={close}
        office={open?.kind === 'office' ? open.office : null}
        serverNow={serverNow}
      />
      <StudentDeadlineDialog
        open={open?.kind === 'student'}
        onClose={close}
        item={open?.kind === 'student' ? open.item : null}
        items={items}
        showOffice={isAdmin}
        serverNow={serverNow}
      />
      <ReminderDialog
        open={open?.kind === 'reminder'}
        onClose={close}
        isAdmin={isAdmin}
        offices={officeChoices}
        items={items}
        initialOffice={open?.kind === 'reminder' ? open.office : null}
        serverNow={serverNow}
      />
      <ConfirmDialog
        open={confirm !== null}
        onClose={close}
        title={confirm?.title ?? ''}
        body={confirm?.body ?? ''}
        confirmLabel={confirm?.label ?? ''}
        success={confirm?.success ?? ''}
        run={async () => (confirm ? confirm.run() : { ok: true as const, data: null })}
      />
    </>
  );
}

/** The confirmation for the open destructive step, if any. */
function confirmFor(open: Open) {
  if (open?.kind === 'clear-office') {
    const { office } = open;
    return {
      title: `Remove the ${office.name} deadline?`,
      body: `Students will no longer see a due date for ${office.name}. Students with their own deadline keep it.`,
      label: 'Remove deadline',
      success: 'Deadline removed.',
      run: () => clearOfficeDeadline({ office: office.code }),
    };
  }
  if (open?.kind === 'clear-student') {
    const { item } = open;
    return {
      title: `Remove ${item.studentName}'s own deadline?`,
      body: `They will follow the ${item.officeName} deadline again.`,
      label: 'Remove',
      success: 'The student now follows the office deadline.',
      run: () => saveStudentDeadline({ itemId: item.id, due: '', notify: false }),
    };
  }
  if (open?.kind === 'cancel-reminder') {
    const { reminder } = open;
    return {
      title: 'Cancel this reminder?',
      body: `It was set to go out ${prettyDue(reminder.sendAt)}. It won't be sent.`,
      label: 'Cancel reminder',
      success: 'Reminder cancelled.',
      run: () => cancelReminder({ reminderId: reminder.id }),
    };
  }
  return null;
}
