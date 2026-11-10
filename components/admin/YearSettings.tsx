'use client';

import { useId, useState, useTransition, type FormEvent } from 'react';
import { Dialog, Icon, Pill, useToast } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import {
  actionsCell,
  alert,
  alertBody,
  button,
  field,
  fieldLabel,
  input,
  select,
  spinner,
  table,
  tablePrimary,
  tableWrap,
} from '@/components/ui/recipes';
import { openTerm, saveYear, setCurrentYear } from '@/lib/actions/settings';
import { TERMS, TERM_LABEL } from '@/lib/constants';
import type { SettingsYear } from '@/lib/services/settings';
import { formatDate, manilaDayStart, manilaYear } from '@/lib/time';
import { ConfirmDialog } from './ConfirmDialog';
import { plural } from './format';

const dateText = (ymd: string) => formatDate(manilaDayStart(ymd));

/** Settings, Academic years & terms tab. `currentText` is "1st Semester, A.Y 2026 - 2027" or null. */
export function YearSettings({ years, currentText, activeStudents }: { years: SettingsYear[]; currentText: string | null; activeStudents: number }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [making, setMaking] = useState<SettingsYear | null>(null);
  const [opening, setOpening] = useState<SettingsYear | null>(null);

  async function confirmCurrent() {
    if (!making) return;
    const res = await setCurrentYear({ id: making.id });
    if (res.ok) toast.success(`${res.data.label} is now the current year.`);
    else toast.error(res.error.message);
    setMaking(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {currentText ? (
        <div className={alert('success')}>
          <Icon name="check-circle" />
          <div className={alertBody}>
            <strong>Current term: {currentText}</strong>
            <span>Staff queues, reports and new student accounts use this term. Open the next term when the semester changes.</span>
          </div>
        </div>
      ) : (
        <div className={alert('warning')}>
          <Icon name="warning" />
          <div className={alertBody}>
            <strong>No current term</strong>
            <span>Set a current academic year, then open its first term.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-x-10 gap-y-6 items-start max-[1200px]:grid-cols-1 max-[1200px]:gap-4">
        <div className="flex flex-col items-start gap-2">
          <h2>Academic years &amp; terms</h2>
          <p className="text-muted">Opening a term gives every active student a clearance with a pending item for each active office.</p>
          <p className="text-muted">{plural(activeStudents, 'active student')}</p>
          <button type="button" className={cn(button({ variant: 'primary' }), 'mt-2')} onClick={() => setAdding(true)}>
            <Icon name="plus" />
            Add an academic year
          </button>
        </div>

        <div className="min-w-0">
          {years.length === 0 ? (
            <p className="text-muted">No academic years yet. Add one, make it current, then open its first term.</p>
          ) : (
            <div className={tableWrap}>
              <table className={table}>
                <thead>
                  <tr>
                    <th scope="col">Academic year</th>
                    <th scope="col">Dates</th>
                    <th scope="col">Terms opened</th>
                    <th scope="col" className={actionsCell}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {years.map((y) => (
                    <tr key={y.id}>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn(tablePrimary, 'whitespace-nowrap')}>{y.label}</span>
                          {y.isCurrent ? <Pill tone="approved">Current</Pill> : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        {dateText(y.startDate)} to {dateText(y.endDate)}
                      </td>
                      <td>
                        {y.termsOpened.length ? y.termsOpened.map((t) => t.label).join(', ') : <span className="text-muted">None yet</span>}
                      </td>
                      <td className={actionsCell}>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {y.isCurrent ? null : (
                            <button type="button" className={button({ variant: 'ghost', size: 'sm' })} onClick={() => setMaking(y)}>
                              Make current
                            </button>
                          )}
                          <button type="button" className={button({ size: 'sm' })} onClick={() => setOpening(y)}>
                            Open a term
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <YearDialog open={adding} years={years} onClose={() => setAdding(false)} />
      <OpenTermDialog year={opening} activeStudents={activeStudents} onClose={() => setOpening(null)} />
      <ConfirmDialog
        open={making !== null}
        onClose={() => setMaking(null)}
        title={making ? `Make ${making.label} current?` : ''}
        body="Staff queues and reports will switch to the newest term opened in this year."
        confirmLabel="Make current"
        onConfirm={confirmCurrent}
      />
    </div>
  );
}

/** The year after the newest academic year's end year, or this year when there is none. */
function suggestedStartYear(years: SettingsYear[]): number {
  const ends = years.map((y) => Number(y.label.slice(-4))).filter((n) => Number.isInteger(n) && n > 1900);
  return ends.length ? Math.max(...ends) : manilaYear();
}

function YearDialog({ open, years, onClose }: { open: boolean; years: SettingsYear[]; onClose: () => void }) {
  const toast = useToast();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(open);
  const start = suggestedStartYear(years);

  if (seen !== open) {
    setSeen(open);
    if (open) setError(null);
  }

  const close = () => {
    if (!pending) onClose();
  };

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await saveYear({ startDate: String(fd.get('startDate') ?? ''), endDate: String(fd.get('endDate') ?? '') });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      toast.success(`Academic year ${res.data.label} added.`);
      onClose();
    });
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add an academic year"
      description={`The label is made from the years, e.g. ${start} - ${start + 1}.`}
      size="sm"
      footer={
        <>
          <button type="button" className={button()} onClick={close} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button({ variant: 'primary' })} disabled={pending}>
            {pending ? <span className={spinner} aria-hidden="true" /> : null}
            Add year
          </button>
        </>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={onSubmit}>
        {error ? (
          <div className={alert('error')} role="alert">
            <Icon name="alert" />
            <div className={alertBody}>{error}</div>
          </div>
        ) : null}
        <div className={field}>
          <label className={fieldLabel} htmlFor={`${formId}-start`}>
            Start date
          </label>
          <input id={`${formId}-start`} name="startDate" type="date" className={input} required defaultValue={`${start}-08-01`} data-autofocus />
        </div>
        <div className={field}>
          <label className={fieldLabel} htmlFor={`${formId}-end`}>
            End date
          </label>
          <input id={`${formId}-end`} name="endDate" type="date" className={input} required defaultValue={`${start + 1}-05-31`} />
        </div>
      </form>
    </Dialog>
  );
}

function OpenTermDialog({ year, activeStudents, onClose }: { year: SettingsYear | null; activeStudents: number; onClose: () => void }) {
  const toast = useToast();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<SettingsYear | null>(year);

  if (shown !== year) {
    setShown(year);
    if (year) setError(null);
  }

  // Keep the last year while the dialog closes, so its text doesn't blank out.
  const y = year ?? shown;
  const opened = new Set(y?.termsOpened.map((t) => t.term) ?? []);
  const preselect = TERMS.find((t) => !opened.has(t)) ?? TERMS[0];

  const close = () => {
    if (!pending) onClose();
  };

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!y) return;
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await openTerm({ yearId: y.id, term: String(fd.get('term') ?? '') });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      toast.success(
        res.data.opened ? `${plural(res.data.opened, 'clearance')} opened.` : 'Every active student already had a clearance for that term.',
      );
      onClose();
    });
  }

  return (
    <Dialog
      open={year !== null}
      onClose={close}
      title="Open a clearance term"
      description={
        y
          ? `Creates a clearance for each of the ${plural(activeStudents, 'active student')} in A.Y ${y.label}. Students who already have one are skipped.`
          : undefined
      }
      footer={
        <>
          <button type="button" className={button()} onClick={close} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button({ variant: 'primary' })} disabled={pending}>
            {pending ? <span className={spinner} aria-hidden="true" /> : null}
            Open term
          </button>
        </>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={onSubmit}>
        {error ? (
          <div className={alert('error')} role="alert">
            <Icon name="alert" />
            <div className={alertBody}>{error}</div>
          </div>
        ) : null}
        {y && !y.isCurrent ? (
          <div className={alert('warning')}>
            <Icon name="warning" />
            <div className={alertBody}>This isn&apos;t the current academic year. Staff only see the current year&apos;s newest term.</div>
          </div>
        ) : null}
        <div className={field}>
          <label className={fieldLabel} htmlFor={`${formId}-term`}>
            Term
          </label>
          <select id={`${formId}-term`} name="term" className={select} defaultValue={preselect} data-autofocus>
            {TERMS.map((t) => (
              <option key={t} value={t}>
                {`${TERM_LABEL[t]}${opened.has(t) ? ' (already open)' : ''}`}
              </option>
            ))}
          </select>
        </div>
      </form>
    </Dialog>
  );
}
