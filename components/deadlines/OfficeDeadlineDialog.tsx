'use client';

import { useId, useRef, useState, useTransition, type FormEvent, type TransitionStartFunction } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { FormAlert } from '@/components/shell/auth/FormAlert';
import { button, check, field, fieldError, fieldHint, fieldLabel, fieldOptional, input, textarea } from '@/components/ui/recipes';
import { saveOfficeDeadline } from '@/lib/actions/deadlines';
import { parseLocalDateTime } from '@/lib/time';
import { futureInputValue, plural, useInputMin } from './shared';

/** The office whose deadline is being set, or `'all'` (admins) for every active office. */
export type OfficeDeadlineTarget = { code: string; name: string; dueAt: string | null; note: string | null } | 'all';

/**
 * Set or change the current term's deadline for one office, or for every office. Students with their own
 * deadline keep it; the others who are not cleared yet can be notified.
 */
export function OfficeDeadlineDialog({
  open,
  onClose,
  office,
  serverNow,
}: {
  open: boolean;
  onClose: () => void;
  office: OfficeDeadlineTarget | null;
  serverNow: string;
}) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const close = () => {
    if (!pending) onClose();
  };

  const all = office === 'all';
  const title = all
    ? 'Set a deadline for every office'
    : office
      ? `${office.dueAt ? 'Change' : 'Set'} the ${office.name} deadline`
      : '';
  const description = all
    ? "Replaces each office's deadline for this term. Students with their own deadline keep it."
    : 'Applies to every student this term, except students you gave their own deadline.';

  return (
    <Dialog
      open={open && office !== null}
      onClose={close}
      title={title}
      description={description}
      footer={
        <>
          <button type="button" className={button({ variant: 'ghost' })} onClick={close} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button({ variant: 'primary' })} disabled={pending}>
            {pending ? 'Saving…' : 'Save deadline'}
          </button>
        </>
      }
    >
      {office ? (
        <OfficeDeadlineForm formId={formId} office={office} serverNow={serverNow} startTransition={startTransition} onDone={onClose} />
      ) : null}
    </Dialog>
  );
}

type Errors = { due?: string; form?: string };

function OfficeDeadlineForm({
  formId,
  office,
  serverNow,
  startTransition,
  onDone,
}: {
  formId: string;
  office: OfficeDeadlineTarget;
  serverNow: string;
  startTransition: TransitionStartFunction;
  onDone: () => void;
}) {
  const toast = useToast();
  const min = useInputMin(serverNow);
  const target = office === 'all' ? null : office;
  const [due, setDue] = useState(() => futureInputValue(target?.dueAt));
  const [note, setNote] = useState(target?.note ?? '');
  const [notify, setNotify] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const dueRef = useRef<HTMLInputElement>(null);
  const dueId = useId();
  const dueErrId = useId();
  const noteId = useId();
  const noteHintId = useId();
  const notifyHintId = useId();

  const dueError = (message: string) => {
    setErrors({ due: message });
    dueRef.current?.focus();
  };

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const at = parseLocalDateTime(due);
    if (!at) return dueError('Choose a date and time for the deadline.');
    if (at.getTime() <= Date.now()) return dueError('The deadline must be in the future.');
    setErrors({});
    startTransition(async () => {
      const res = await saveOfficeDeadline({ office: office === 'all' ? 'all' : office.code, due, note, notify });
      if (res.ok) {
        const n = res.data.notified;
        toast.success(n ? `Deadline saved and ${plural(n, 'student')} notified.` : 'Deadline saved.');
        onDone();
        return;
      }
      if (res.error.code === 'invalid_date' || res.error.code === 'past_date') dueError(res.error.message);
      else setErrors({ form: res.error.message });
    });
  }

  return (
    <form id={formId} className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      {errors.form ? <FormAlert>{errors.form}</FormAlert> : null}
      <div className={field}>
        <label className={fieldLabel} htmlFor={dueId}>
          Deadline
        </label>
        <input
          ref={dueRef}
          id={dueId}
          type="datetime-local"
          className={input}
          min={min}
          value={due}
          onChange={(e) => setDue(e.target.value)}
          required
          aria-invalid={errors.due ? true : undefined}
          aria-describedby={errors.due ? dueErrId : undefined}
          data-autofocus
        />
        {errors.due ? (
          <p id={dueErrId} className={fieldError}>
            {errors.due}
          </p>
        ) : null}
      </div>
      <div className={field}>
        <label className={fieldLabel} htmlFor={noteId}>
          Note for students <span className={fieldOptional}>(optional)</span>
        </label>
        <textarea
          id={noteId}
          className={textarea}
          rows={2}
          maxLength={255}
          placeholder="e.g. Return borrowed books before the semester break"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-describedby={noteHintId}
        />
        <p id={noteHintId} className={fieldHint}>
          Students see this under the deadline.
        </p>
      </div>
      <div className={field}>
        <label className={check}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} aria-describedby={notifyHintId} />
          <span>Notify students who aren&apos;t cleared yet</span>
        </label>
        <p id={notifyHintId} className={fieldHint}>
          Students with their own deadline are not notified.
        </p>
      </div>
    </form>
  );
}
