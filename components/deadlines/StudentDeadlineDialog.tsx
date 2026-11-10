'use client';

import { useId, useMemo, useRef, useState, useTransition, type FormEvent, type TransitionStartFunction } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { FormAlert } from '@/components/shell/auth/FormAlert';
import { button, check, field, fieldError, fieldHint, fieldLabel, input } from '@/components/ui/recipes';
import { saveStudentDeadline } from '@/lib/actions/deadlines';
import { parseLocalDateTime, prettyDue } from '@/lib/time';
import { StudentPicker } from './StudentPicker';
import { futureInputValue, useInputMin } from './shared';
import type { DeadlineItem } from './types';

/**
 * Give one student their own deadline instead of the office one, change it, or (left empty) remove it.
 * With `item` the dialog is for that requirement; without it the person first picks a student from `items`
 * (requirements that are not approved yet are offered).
 */
export function StudentDeadlineDialog({
  open,
  onClose,
  item,
  items,
  showOffice,
  serverNow,
}: {
  open: boolean;
  onClose: () => void;
  item: DeadlineItem | null;
  items: DeadlineItem[];
  showOffice: boolean;
  serverNow: string;
}) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const close = () => {
    if (!pending) onClose();
  };

  const title = item ? `Deadline for ${item.studentName}` : 'Give a student their own deadline';
  const description = item
    ? `${item.officeName} · ${item.officeDueAt ? `office deadline ${prettyDue(item.officeDueAt)}` : 'no office deadline set'}`
    : 'For a student who needs more time (or less) than the office deadline.';

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      description={description}
      footer={
        <>
          <button type="button" className={button({ variant: 'ghost' })} onClick={close} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button({ variant: 'primary' })} disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <StudentDeadlineForm
        formId={formId}
        fixed={item}
        items={items}
        showOffice={showOffice}
        serverNow={serverNow}
        startTransition={startTransition}
        onDone={onClose}
      />
    </Dialog>
  );
}

type Errors = { item?: string; due?: string; form?: string };

function StudentDeadlineForm({
  formId,
  fixed,
  items,
  showOffice,
  serverNow,
  startTransition,
  onDone,
}: {
  formId: string;
  fixed: DeadlineItem | null;
  items: DeadlineItem[];
  showOffice: boolean;
  serverNow: string;
  startTransition: TransitionStartFunction;
  onDone: () => void;
}) {
  const toast = useToast();
  const min = useInputMin(serverNow);
  const choices = useMemo(() => items.filter((i) => i.status !== 'approved'), [items]);
  const [itemId, setItemId] = useState<number | null>(fixed?.id ?? null);
  const [due, setDue] = useState(() => futureInputValue(fixed?.ownDueAt));
  const [notify, setNotify] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const dueRef = useRef<HTMLInputElement>(null);
  const pickerId = useId();
  const pickerHintId = useId();
  const pickerErrId = useId();
  const dueId = useId();
  const dueHintId = useId();
  const dueErrId = useId();

  const chosen = fixed ?? choices.find((i) => i.id === itemId) ?? null;
  const picking = fixed === null;

  const dueError = (message: string) => {
    setErrors({ due: message });
    dueRef.current?.focus();
  };

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!chosen) {
      setErrors({ item: 'Choose a student.' });
      document.getElementById(pickerId)?.focus();
      return;
    }
    if (due !== '') {
      const at = parseLocalDateTime(due);
      if (!at) return dueError('Choose a date and time.');
      if (at.getTime() <= Date.now()) return dueError('The deadline must be in the future.');
    } else if (picking || !chosen.ownDueAt) {
      return dueError('Choose a date and time.');
    }
    setErrors({});
    const target = chosen;
    startTransition(async () => {
      const res = await saveStudentDeadline({ itemId: target.id, due, notify });
      if (res.ok) {
        toast.success(res.data.dueAt ? 'Deadline saved.' : 'The student now follows the office deadline.');
        onDone();
        return;
      }
      if (res.error.code === 'invalid_date' || res.error.code === 'past_date') dueError(res.error.message);
      else setErrors({ form: res.error.message });
    });
  }

  const officeLine = chosen
    ? chosen.officeDueAt
      ? `Office deadline: ${prettyDue(chosen.officeDueAt)}`
      : 'This office has no deadline set.'
    : null;

  return (
    <form id={formId} className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      {errors.form ? <FormAlert>{errors.form}</FormAlert> : null}
      {picking ? (
        <div className={field}>
          <label className={fieldLabel} htmlFor={pickerId}>
            Student
          </label>
          {choices.length ? (
            <StudentPicker
              id={pickerId}
              items={choices}
              value={itemId}
              onChange={(id) => {
                setItemId(id);
                setErrors((prev) => ({ ...prev, item: undefined }));
              }}
              showOffice={showOffice}
              invalid={Boolean(errors.item)}
              describedBy={errors.item ? pickerErrId : officeLine ? pickerHintId : undefined}
              autoFocus
            />
          ) : (
            <p className={fieldHint}>Every student is already cleared, so there is nobody to give a deadline.</p>
          )}
          {errors.item ? (
            <p id={pickerErrId} className={fieldError}>
              {errors.item}
            </p>
          ) : officeLine ? (
            <p id={pickerHintId} className={fieldHint}>
              {officeLine}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className={field}>
        <label className={fieldLabel} htmlFor={dueId}>
          Their deadline
        </label>
        <input
          ref={dueRef}
          id={dueId}
          type="datetime-local"
          className={input}
          min={min}
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-invalid={errors.due ? true : undefined}
          aria-describedby={errors.due ? dueErrId : picking ? undefined : dueHintId}
          data-autofocus={picking ? undefined : true}
        />
        {errors.due ? (
          <p id={dueErrId} className={fieldError}>
            {errors.due}
          </p>
        ) : picking ? null : (
          <p id={dueHintId} className={fieldHint}>
            {fixed?.ownDueAt
              ? `Now ${prettyDue(fixed.ownDueAt)}. Leave it empty to use the office deadline again.`
              : 'Leave it empty to use the office deadline again.'}
          </p>
        )}
      </div>
      {chosen && chosen.status !== 'approved' ? (
        <label className={check}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          <span>Notify the student</span>
        </label>
      ) : null}
    </form>
  );
}
