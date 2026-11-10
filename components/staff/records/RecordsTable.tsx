'use client';

import { useId, useState, useTransition } from 'react';
import { formatDate } from '@/lib/time';
import { checkRecord, templateFor, type RecordField, type RecordTemplate } from '@/lib/officeRecords';
import { addRecord, deleteRecord, reopenRecord, settleRecord } from '@/lib/actions/office-records';
import type { RecordRow, RecordStudent } from '@/lib/services/officeRecords';
import { cn } from '@/components/ui/cn';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { Pill, StatusPill } from '@/components/ui/Pill';
import { useToast } from '@/components/ui/Toast';
import {
  actionsCell,
  alert,
  alertBody,
  button,
  check,
  field,
  fieldError,
  fieldHint,
  fieldLabel,
  fieldOptional,
  formGrid,
  formGridFull,
  iconButton,
  input,
  mono,
  select,
  spinner,
  table,
  tablePrimary,
  tableSecondary,
  tableWrap,
} from '@/components/ui/recipes';
import { FormAlert } from '@/components/shell/auth/FormAlert';
import { plural } from '@/components/staff/format';
import { ImportDialog } from './ImportDialog';

const ICON_BUTTON = iconButton({ size: 'sm' });

/** "Final grade 2.0", "Official receipt no. 004512", "Condition: good"; a plain note as it is. */
function noteText(template: RecordTemplate, note: string): string {
  const label = template.settle.noteLabel;
  if (label === 'Note') return note;
  return label.endsWith('.') || /grade$/i.test(label) ? `${label} ${note}` : `${label}: ${note}`;
}

/* ---------- Page head buttons: Add and Import ---------- */

export function RecordsActions({
  officeCode,
  adminOffice,
  students,
}: {
  officeCode: string;
  /** Admins: the office being worked on (sent with each change). Null for staff, whose office is their own. */
  adminOffice: string | null;
  students: RecordStudent[];
}) {
  const template = templateFor(officeCode);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  return (
    <>
      <button type="button" className={button()} onClick={() => setImporting(true)}>
        <Icon name="upload" />
        Import list
      </button>
      <button type="button" className={button({ variant: 'primary' })} onClick={() => setAdding(true)}>
        <Icon name="plus" />
        Add {template.noun[0]}
      </button>
      <AddRecordDialog open={adding} onClose={() => setAdding(false)} template={template} adminOffice={adminOffice} students={students} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} template={template} adminOffice={adminOffice} />
    </>
  );
}

/* ---------- The table ---------- */

export function RecordsTable({ officeCode, officeName, rows }: { officeCode: string; officeName: string; rows: RecordRow[] }) {
  const template = templateFor(officeCode);
  const toast = useToast();
  const [settling, setSettling] = useState<RecordRow | null>(null);
  const [removing, setRemoving] = useState<RecordRow | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const reopen = (r: RecordRow) => {
    setBusy(r.id);
    startTransition(async () => {
      const res = await reopenRecord({ recordId: r.id });
      setBusy(null);
      if (!res.ok) toast.error(res.error.message);
      else toast.success(`Reopened. ${r.studentName} is back at Needs action with ${officeName}.`);
    });
  };

  return (
    <>
      <div className={tableWrap}>
        <table className={table}>
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">{template.noun[0][0].toUpperCase() + template.noun[0].slice(1)}</th>
              <th scope="col" className="max-md:hidden">
                Added
              </th>
              <th scope="col">Status</th>
              <th scope="col" className="max-sm:hidden">
                Clearance
              </th>
              <th scope="col" className={actionsCell}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = template.describe(r.values);
              return (
                <tr key={r.id}>
                  <td>
                    <span className={tablePrimary}>{r.studentName}</span>
                    <span className={cn(mono, tableSecondary)}>{r.studentNumber}</span>
                  </td>
                  <td className="min-w-[180px] max-w-[360px] wrap-anywhere">
                    <span className="font-medium">{d.main}</span>
                    {d.details.length ? <span className={tableSecondary}>{d.details.join(' · ')}</span> : null}
                  </td>
                  <td className="whitespace-nowrap max-md:hidden">
                    <time dateTime={r.createdAt}>{formatDate(r.createdAt)}</time>
                    {r.createdBy ? <span className={tableSecondary}>{r.createdBy}</span> : null}
                  </td>
                  <td className="min-w-[120px]">
                    {r.settledAt ? (
                      <>
                        <Pill tone="approved">{template.settle.done}</Pill>
                        <span className={tableSecondary}>
                          <time dateTime={r.settledAt}>{formatDate(r.settledAt)}</time>
                          {r.settleNote ? ` · ${noteText(template, r.settleNote)}` : ''}
                        </span>
                      </>
                    ) : (
                      <Pill tone="action">Open</Pill>
                    )}
                  </td>
                  <td className="max-sm:hidden">
                    <StatusPill status={r.itemStatus} />
                  </td>
                  <td className={actionsCell}>
                    <span className="inline-flex items-center gap-1">
                      {r.settledAt ? (
                        <button type="button" className={button({ variant: 'ghost', size: 'sm' })} onClick={() => reopen(r)} disabled={busy === r.id}>
                          {busy === r.id ? <span className={spinner} aria-hidden="true" /> : <Icon name="undo" />}
                          Reopen<span className="sr-only"> {d.main} for {r.studentName}</span>
                        </button>
                      ) : (
                        <button type="button" className={button({ size: 'sm' })} onClick={() => setSettling(r)}>
                          <Icon name="check" />
                          {template.settle.action}
                          <span className="sr-only">
                            : {d.main} for {r.studentName}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        className={ICON_BUTTON}
                        aria-label={`Remove ${d.main} for ${r.studentName}`}
                        title="Remove (entered by mistake)"
                        onClick={() => setRemoving(r)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <SettleDialog row={settling} template={template} officeName={officeName} onClose={() => setSettling(null)} />
      <RemoveDialog row={removing} template={template} officeName={officeName} onClose={() => setRemoving(null)} />
    </>
  );
}

/* ---------- Add ---------- */

/** "Andrea Santos · 2023-00102" from the list, or a typed student number, or a name only one student has. */
function findStudent(text: string, students: RecordStudent[]): RecordStudent | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const num = /\d{4}-\d{5}/.exec(t)?.[0];
  if (num) return students.find((s) => s.number === num) ?? null;
  const named = students.filter((s) => s.name.toLowerCase() === t);
  return named.length === 1 ? named[0] : null;
}

const studentOption = (s: RecordStudent) => `${s.name} · ${s.number}`;

function AddRecordDialog({
  open,
  onClose,
  template,
  adminOffice,
  students,
}: {
  open: boolean;
  onClose: () => void;
  template: RecordTemplate;
  adminOffice: string | null;
  students: RecordStudent[];
}) {
  const toast = useToast();
  const ids = useId();
  const [pending, startTransition] = useTransition();
  const [who, setWho] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const student = findStudent(who, students);

  const close = () => {
    if (pending) return;
    setWho('');
    setValues({});
    setErrors({});
    setFormError(null);
    onClose();
  };

  const submit = () => {
    setFormError(null);
    const errs: Record<string, string> = {};
    if (!student) errs.student = who.trim() ? 'Choose a student from the list, or type their student number.' : 'Choose a student.';
    const checked = checkRecord(template, values);
    if (!checked.ok) Object.assign(errs, checked.errors);
    setErrors(errs);
    if (Object.keys(errs).length || !student || !checked.ok) return;
    startTransition(async () => {
      const res = await addRecord({ office: adminOffice ?? undefined, itemId: student.itemId, values });
      if (!res.ok) {
        setFormError(res.error.message);
        return;
      }
      toast.success(`Added for ${student.name}. They see it on their requirements now.`);
      setWho('');
      setValues({});
      setErrors({});
      onClose();
    });
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Add ${template.noun[0]}`}
      description="The student sees it on their requirements right away, and stays at Needs action with your office until it is settled."
      footer={
        <>
          <button type="button" className={button()} onClick={close} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={`${ids}-form`} className={button({ variant: 'primary' })} disabled={pending}>
            {pending ? <span className={spinner} aria-hidden="true" /> : null}
            Add {template.noun[0]}
          </button>
        </>
      }
    >
      <form
        id={`${ids}-form`}
        noValidate
        className={formGrid}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className={cn(field, formGridFull)}>
          <label htmlFor={`${ids}-student`} className={fieldLabel}>
            Student
          </label>
          <input
            id={`${ids}-student`}
            className={input}
            list={`${ids}-students`}
            value={who}
            onChange={(e) => {
              setWho(e.target.value);
              setErrors(({ student: _, ...rest }) => rest);
            }}
            placeholder="Type a name or student no."
            autoComplete="off"
            aria-invalid={errors.student ? true : undefined}
            aria-describedby={errors.student ? `${ids}-student-error` : undefined}
            data-autofocus
          />
          <datalist id={`${ids}-students`}>
            {students.map((s) => (
              <option key={s.itemId} value={studentOption(s)} />
            ))}
          </datalist>
          {errors.student ? (
            <p id={`${ids}-student-error`} className={fieldError}>
              {errors.student}
            </p>
          ) : student ? (
            <p className={fieldHint}>
              {student.name} · <span className={mono}>{student.number}</span>
            </p>
          ) : null}
        </div>

        {student?.status === 'approved' ? (
          <div className={cn(alert('action'), formGridFull)}>
            <Icon name="alert" />
            <div className={alertBody}>
              <strong>{student.name} is already cleared by your office.</strong>
              <span>Adding this puts them back at Needs action, and their clearance certificate stops checking as valid until it is settled.</span>
            </div>
          </div>
        ) : null}

        {template.fields.map((f) => (
          <RecordInput
            key={f.key}
            id={`${ids}-${f.key}`}
            field={f}
            value={values[f.key] ?? ''}
            error={errors[f.key]}
            onChange={(v) => {
              setValues((prev) => ({ ...prev, [f.key]: v }));
              setErrors(({ [f.key]: _, ...rest }) => rest);
            }}
          />
        ))}

        {formError ? (
          <div className={formGridFull}>
            <FormAlert>{formError}</FormAlert>
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}

function RecordInput({
  id,
  field: f,
  value,
  error,
  onChange,
}: {
  id: string;
  field: RecordField;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const wide = f.type === 'text' && (f.max ?? 0) > 30;
  const common = {
    id,
    value,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  } as const;
  return (
    <div className={cn(field, wide && formGridFull)}>
      <label htmlFor={id} className={fieldLabel}>
        {f.label} {f.required ? null : <span className={fieldOptional}>(optional)</span>}
      </label>
      {f.type === 'choice' ? (
        <select {...common} className={select} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {(f.choices ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          className={input}
          type={f.type === 'date' ? 'date' : 'text'}
          inputMode={f.type === 'money' ? 'decimal' : undefined}
          maxLength={f.type === 'text' ? f.max : undefined}
          placeholder={f.type === 'money' ? '0.00' : f.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error ? (
        <p id={`${id}-error`} className={fieldError}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ---------- Settle ---------- */

function SettleDialog({
  row,
  template,
  officeName,
  onClose,
}: {
  row: RecordRow | null;
  template: RecordTemplate;
  officeName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const ids = useId();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [clear, setClear] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const last = row ? row.openForStudent <= 1 : false;
  const others = row ? row.openForStudent - 1 : 0;
  const main = row ? template.describe(row.values).main : '';

  const close = () => {
    if (pending) return;
    setNote('');
    setClear(true);
    setError(null);
    onClose();
  };

  const submit = () => {
    if (!row) return;
    setError(null);
    startTransition(async () => {
      const res = await settleRecord({ recordId: row.id, note, clear: last && clear });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      toast.success(
        res.data.cleared
          ? `${template.settle.done}. ${row.studentName} is cleared by ${officeName}.`
          : last
            ? `${template.settle.done}. ${row.studentName} is waiting for you to clear them on Clearance status.`
            : `${template.settle.done}. ${row.studentName} still has ${plural(others, `open ${template.noun[0]}`, `open ${template.noun[1]}`)}.`,
      );
      setNote('');
      setClear(true);
      onClose();
    });
  };

  return (
    <Dialog
      open={row !== null}
      onClose={close}
      size="sm"
      title={`${template.settle.action}?`}
      description={row ? `${main} for ${row.studentName}.` : undefined}
      footer={
        <>
          <button type="button" className={button()} onClick={close} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={`${ids}-form`} className={button({ variant: 'primary' })} disabled={pending}>
            {pending ? <span className={spinner} aria-hidden="true" /> : <Icon name="check" />}
            {template.settle.action}
          </button>
        </>
      }
    >
      <form
        id={`${ids}-form`}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className={field}>
          <label htmlFor={`${ids}-note`} className={fieldLabel}>
            {template.settle.noteLabel} <span className={fieldOptional}>(optional)</span>
          </label>
          <input id={`${ids}-note`} className={input} value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} data-autofocus />
        </div>
        {row && last ? (
          <div className="flex flex-col gap-1">
            <label className={check}>
              <input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} />
              <span>
                Clear {row.studentName} for {officeName} now
              </span>
            </label>
            <p className={cn(fieldHint, 'pl-6')}>
              This is their last open {template.noun[0]}. Untick to clear them later on Clearance status.
            </p>
          </div>
        ) : row ? (
          <p className="text-muted">
            {row.studentName} still has {plural(others, `other open ${template.noun[0]}`, `other open ${template.noun[1]}`)}, so they stay at
            Needs action.
          </p>
        ) : null}
        {error ? <FormAlert>{error}</FormAlert> : null}
      </form>
    </Dialog>
  );
}

/* ---------- Remove ---------- */

function RemoveDialog({
  row,
  template,
  officeName,
  onClose,
}: {
  row: RecordRow | null;
  template: RecordTemplate;
  officeName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const main = row ? template.describe(row.values).main : '';

  const close = () => {
    if (pending) return;
    setError(null);
    onClose();
  };

  const confirm = () => {
    if (!row) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteRecord({ recordId: row.id });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      toast.success(`Removed ${main} for ${row.studentName}.`);
      onClose();
    });
  };

  return (
    <Dialog
      open={row !== null}
      onClose={close}
      size="sm"
      title={`Remove this ${template.noun[0]}?`}
      description={row ? `${main} for ${row.studentName}.` : undefined}
      footer={
        <>
          <button type="button" className={button()} onClick={close} disabled={pending}>
            Cancel
          </button>
          <button type="button" className={button({ variant: 'danger' })} onClick={confirm} disabled={pending} data-autofocus>
            {pending ? <span className={spinner} aria-hidden="true" /> : <Icon name="trash" />}
            Remove
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p>
          Use this for a record entered by mistake. If the student settled it, use {template.settle.action} instead so it stays
          on their history.
        </p>
        {row && !row.settledAt && row.openForStudent <= 1 ? (
          <p className="text-muted">
            It is {row.studentName}&apos;s only open {template.noun[0]}, so {officeName} goes back to reviewing them.
          </p>
        ) : null}
        {error ? <FormAlert>{error}</FormAlert> : null}
      </div>
    </Dialog>
  );
}
