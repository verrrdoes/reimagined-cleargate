'use client';

import { useId, useMemo, useRef, useState, useTransition, type FormEvent, type TransitionStartFunction } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { useNow } from '@/components/ui/clock';
import { useToast } from '@/components/ui/Toast';
import { FormAlert } from '@/components/shell/auth/FormAlert';
import { cn } from '@/components/ui/cn';
import { button, check, field, fieldError, fieldHint, fieldLabel, input, select, textarea } from '@/components/ui/recipes';
import { sendReminder } from '@/lib/actions/deadlines';
import { parseLocalDateTime, prettyDue } from '@/lib/time';
import { StudentPicker } from './StudentPicker';
import { plural, useInputMin } from './shared';
import type { DeadlineItem, OfficeChoice, ReminderAudienceName } from './types';

const MESSAGE_MAX = 255;
const chars = (s: string) => Array.from(s).length;

const AUDIENCE_LABEL: Record<ReminderAudienceName, string> = {
  outstanding: 'Everyone not cleared yet',
  overdue: 'Only students past the deadline',
  student: 'One student',
};

/** The suggested message; it names a date only for one student whose deadline is still ahead. */
function suggestedMessage(officeName: string | null, due: string | null, nowMs: number): string {
  if (!officeName) return "Please finish your clearance requirements soon. Check My Requirements to see what's left.";
  const when = due && Date.parse(due) > nowMs ? `before ${prettyDue(due)}` : 'as soon as you can';
  return `Please finish your ${officeName} requirement ${when}. Upload your evidence or visit the office.`;
}

/**
 * Send a reminder now or schedule it. With `fixedItem` it goes to that one student about that requirement.
 * Otherwise the person picks the office (admins may pick every office), who gets it, and when.
 * `offices` are the offices the person can remind for (staff: their own); `items` feed the student picker.
 */
export function ReminderDialog({
  open,
  onClose,
  isAdmin,
  offices,
  items,
  fixedItem = null,
  initialOffice = null,
  serverNow,
}: {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  offices: OfficeChoice[];
  items: DeadlineItem[];
  fixedItem?: DeadlineItem | null;
  /** Office code to start with; admins may pass 'all'. Defaults to every office (admins) or the first office. */
  initialOffice?: string | null;
  serverNow: string;
}) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [later, setLater] = useState(false);
  const close = () => {
    if (pending) return;
    setLater(false);
    onClose();
  };

  const title = fixedItem ? `Remind ${fixedItem.studentName}` : 'Send a reminder';
  const description = fixedItem ? `${fixedItem.officeName} · ${fixedItem.task}` : 'Students see it in their notifications.';
  const submitLabel = later ? (pending ? 'Scheduling…' : 'Schedule reminder') : pending ? 'Sending…' : 'Send reminder';

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
            {submitLabel}
          </button>
        </>
      }
    >
      <ReminderForm
        formId={formId}
        isAdmin={isAdmin}
        offices={offices}
        items={items}
        fixedItem={fixedItem}
        initialOffice={initialOffice}
        serverNow={serverNow}
        later={later}
        setLater={setLater}
        startTransition={startTransition}
        onDone={() => {
          setLater(false);
          onClose();
        }}
      />
    </Dialog>
  );
}

type Errors = { item?: string; message?: string; sendAt?: string; form?: string };

function ReminderForm({
  formId,
  isAdmin,
  offices,
  items,
  fixedItem,
  initialOffice,
  serverNow,
  later,
  setLater,
  startTransition,
  onDone,
}: {
  formId: string;
  isAdmin: boolean;
  offices: OfficeChoice[];
  items: DeadlineItem[];
  fixedItem: DeadlineItem | null;
  initialOffice: string | null;
  serverNow: string;
  later: boolean;
  setLater: (v: boolean) => void;
  startTransition: TransitionStartFunction;
  onDone: () => void;
}) {
  const toast = useToast();
  const min = useInputMin(serverNow);
  const nowMs = useNow(60_000, serverNow);
  const firstOffice = offices[0]?.code ?? '';
  const [office, setOffice] = useState<string>(() => {
    if (fixedItem) return fixedItem.officeCode;
    if (initialOffice === 'all') return isAdmin ? 'all' : firstOffice;
    if (initialOffice && offices.some((o) => o.code === initialOffice)) return initialOffice;
    return isAdmin ? 'all' : firstOffice;
  });
  const [audience, setAudience] = useState<ReminderAudienceName>(fixedItem ? 'student' : 'outstanding');
  const [itemId, setItemId] = useState<number | null>(fixedItem?.id ?? null);
  const [typed, setTyped] = useState<string | null>(null);
  const [sendAt, setSendAt] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const sendAtRef = useRef<HTMLInputElement>(null);
  const ids = {
    office: useId(),
    audience: useId(),
    student: useId(),
    studentErr: useId(),
    message: useId(),
    messageHint: useId(),
    messageErr: useId(),
    sendAt: useId(),
    sendAtErr: useId(),
  };

  const candidates = useMemo(
    () => items.filter((i) => i.status !== 'approved' && (office === 'all' || i.officeCode === office)),
    [items, office],
  );
  const chosen = fixedItem ?? (audience === 'student' ? (candidates.find((i) => i.id === itemId) ?? null) : null);
  const officeName = office === 'all' ? null : (offices.find((o) => o.code === office)?.name ?? fixedItem?.officeName ?? null);
  const suggested = suggestedMessage(officeName, chosen ? (chosen.ownDueAt ?? chosen.officeDueAt) : null, nowMs);
  const message = typed ?? suggested;
  const length = chars(message);

  function changeOffice(code: string) {
    setOffice(code);
    if (itemId !== null && !items.some((i) => i.id === itemId && (code === 'all' || i.officeCode === code))) setItemId(null);
  }

  function changeAudience(next: ReminderAudienceName) {
    setAudience(next);
    // One student is always about one office's requirement.
    if (next === 'student' && office === 'all' && firstOffice) changeOffice(firstOffice);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (audience === 'student' && !chosen) {
      setErrors({ item: 'Choose the student to remind.' });
      document.getElementById(ids.student)?.focus();
      return;
    }
    if (message.trim() === '') {
      setErrors({ message: 'Write the reminder message.' });
      messageRef.current?.focus();
      return;
    }
    if (later) {
      const at = parseLocalDateTime(sendAt);
      if (!at) {
        setErrors({ sendAt: 'Choose when to send it.' });
        sendAtRef.current?.focus();
        return;
      }
      if (at.getTime() < Date.now()) {
        setErrors({ sendAt: 'Pick a time in the future, or send it now.' });
        sendAtRef.current?.focus();
        return;
      }
    }
    setErrors({});
    startTransition(async () => {
      const res = await sendReminder({
        audience,
        office: audience === 'student' ? (chosen?.officeCode ?? office) : office,
        itemId: audience === 'student' ? (chosen?.id ?? null) : null,
        message,
        sendAt: later ? sendAt : '',
      });
      if (res.ok) {
        const { sentTo } = res.data;
        if (sentTo === null) toast.success(`Reminder scheduled for ${prettyDue(res.data.sendAt)}.`);
        else if (sentTo > 0) toast.success(`Reminder sent to ${plural(sentTo, 'student')}.`);
        else toast.info('No students matched, so nobody was reminded.');
        onDone();
        return;
      }
      const { code, message: text } = res.error;
      if (code === 'missing_fields') {
        setErrors({ message: text });
        messageRef.current?.focus();
      } else if (code === 'invalid_student') {
        setErrors({ item: text });
        document.getElementById(ids.student)?.focus();
      } else if (code === 'invalid_date' || code === 'past_date') {
        setErrors({ sendAt: text });
        sendAtRef.current?.focus();
      } else {
        setErrors({ form: text });
      }
    });
  }

  return (
    <form id={formId} className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      {errors.form ? <FormAlert>{errors.form}</FormAlert> : null}

      {fixedItem ? null : (
        <>
          {isAdmin ? (
            <div className={field}>
              <label className={fieldLabel} htmlFor={ids.office}>
                From
              </label>
              <select id={ids.office} className={select} value={office} onChange={(e) => changeOffice(e.target.value)} data-autofocus>
                <option value="all" disabled={audience === 'student'}>
                  Every office (from the Administrator)
                </option>
                {offices.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className={field}>
            <label className={fieldLabel} htmlFor={ids.audience}>
              Send to
            </label>
            <select
              id={ids.audience}
              className={select}
              value={audience}
              onChange={(e) => changeAudience(e.target.value as ReminderAudienceName)}
              data-autofocus={isAdmin ? undefined : true}
            >
              {(Object.keys(AUDIENCE_LABEL) as ReminderAudienceName[]).map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABEL[a]}
                </option>
              ))}
            </select>
          </div>

          {audience === 'student' ? (
            <div className={field}>
              <label className={fieldLabel} htmlFor={ids.student}>
                Student
              </label>
              {candidates.length ? (
                <StudentPicker
                  id={ids.student}
                  items={candidates}
                  value={chosen?.id ?? null}
                  onChange={(id) => {
                    setItemId(id);
                    setErrors((prev) => ({ ...prev, item: undefined }));
                  }}
                  showOffice={false}
                  invalid={Boolean(errors.item)}
                  describedBy={errors.item ? ids.studentErr : undefined}
                />
              ) : (
                <p className={fieldHint}>Every student at this office is already cleared.</p>
              )}
              {errors.item ? (
                <p id={ids.studentErr} className={fieldError}>
                  {errors.item}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <div className={field}>
        <label className={fieldLabel} htmlFor={ids.message}>
          Message
        </label>
        <textarea
          ref={messageRef}
          id={ids.message}
          className={textarea}
          rows={4}
          maxLength={MESSAGE_MAX}
          value={message}
          onChange={(e) => setTyped(e.target.value)}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? ids.messageErr : ids.messageHint}
          data-autofocus={fixedItem ? true : undefined}
        />
        {errors.message ? (
          <p id={ids.messageErr} className={fieldError}>
            {errors.message}
          </p>
        ) : (
          <p id={ids.messageHint} className={fieldHint}>
            {length} of {MESSAGE_MAX} characters.
          </p>
        )}
      </div>

      <fieldset className={field}>
        <legend className={cn(fieldLabel, 'mb-1.5')}>When</legend>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className={check}>
            <input type="radio" name={`${formId}-when`} checked={!later} onChange={() => setLater(false)} />
            <span>Send now</span>
          </label>
          <label className={check}>
            <input type="radio" name={`${formId}-when`} checked={later} onChange={() => setLater(true)} />
            <span>Schedule for later</span>
          </label>
        </div>
      </fieldset>

      {later ? (
        <div className={field}>
          <label className={fieldLabel} htmlFor={ids.sendAt}>
            Send at
          </label>
          <input
            ref={sendAtRef}
            id={ids.sendAt}
            type="datetime-local"
            className={input}
            min={min}
            value={sendAt}
            onChange={(e) => setSendAt(e.target.value)}
            aria-invalid={errors.sendAt ? true : undefined}
            aria-describedby={errors.sendAt ? ids.sendAtErr : undefined}
          />
          {errors.sendAt ? (
            <p id={ids.sendAtErr} className={fieldError}>
              {errors.sendAt}
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
