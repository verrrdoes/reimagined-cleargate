'use client';

import { useId, useState } from 'react';
import { updateItem } from '@/lib/actions/office-status';
import { STATUS, ITEM_STATUSES } from '@/lib/constants';
import { prettyDue } from '@/lib/time';
import type { ItemStatus } from '@/lib/types';
import { cn } from '@/components/ui/cn';
import { Dialog } from '@/components/ui/Dialog';
import { alert, button, field, fieldHint, fieldLabel, fieldOptional, input, kv, select, spinner, textarea } from '@/components/ui/recipes';
import { useToast } from '@/components/ui/Toast';
import type { QueueRow } from './types';

const STATUS_OPTION: Record<ItemStatus, string> = {
  needs_action: 'Needs action: the student must do something',
  pending: 'Pending: the office is reviewing',
  approved: 'Approved: cleared',
};

type Wording = { remarks: string; description: string; nextStep: string };

/**
 * What the student reads after a status change, for the fields staff haven't typed in: without it, moving an
 * approved student to Needs action kept "has cleared your account" (an empty field keeps the current text).
 * Needs action has no default explanation; staff write what the student must do.
 */
function wordingFor(status: ItemStatus, office: string): Wording {
  if (status === 'approved') return { remarks: 'Cleared by the office', description: `${office} has cleared your account.`, nextStep: '' };
  if (status === 'pending') {
    return {
      remarks: 'Awaiting review',
      description: `${office} is reviewing your account.`,
      nextStep: `Wait for ${office} to review your account, or visit the office.`,
    };
  }
  return { remarks: 'Action needed', description: '', nextStep: '' };
}

function EditorForm({ row, formId, onBusy, onSaved }: { row: QueueRow; formId: string; onBusy: (busy: boolean) => void; onSaved: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<ItemStatus>(row.status);
  const [task, setTask] = useState(row.task);
  const [remarks, setRemarks] = useState(row.remarks);
  const [description, setDescription] = useState(row.description);
  const [nextStep, setNextStep] = useState(row.nextStep ?? '');
  const [note, setNote] = useState('');
  const [edited, setEdited] = useState<ReadonlySet<keyof Wording>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { status: useId(), task: useId(), remarks: useId(), description: useId(), next: useId(), note: useId(), error: useId() };
  const approved = status === 'approved';

  const typed = (field: keyof Wording) => setEdited((s) => (s.has(field) ? s : new Set(s).add(field)));

  /** Swaps the wording staff haven't typed for the new status's (back to the saved text on the saved status). */
  function changeStatus(next: ItemStatus) {
    setStatus(next);
    const w = next === row.status ? { remarks: row.remarks, description: row.description, nextStep: row.nextStep ?? '' } : wordingFor(next, row.officeName);
    if (!edited.has('remarks')) setRemarks(w.remarks);
    if (!edited.has('description')) setDescription(w.description);
    if (!edited.has('nextStep')) setNextStep(w.nextStep);
  }

  function setWorking(v: boolean) {
    setBusy(v);
    onBusy(v);
  }

  async function save() {
    if (busy) return;
    if (status === 'needs_action' && !description.trim()) {
      setError('Tell the student what they need to do.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const res = await updateItem({
        itemId: row.itemId,
        status,
        task: task.trim(),
        remarks: remarks.trim(),
        description: description.trim(),
        nextStep: approved ? null : nextStep.trim() || null,
        note: note.trim() || null,
      });
      setWorking(false);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      toast.success(`${res.data.studentName} updated to ${STATUS[res.data.status].label.toLowerCase()}. The student has been notified.`);
      onSaved();
    } catch {
      setWorking(false);
      setError('The update could not be sent. Check your connection and try again.');
    }
  }

  return (
    <form
      id={formId}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {row.dueAt ? (
        <dl className={cn(kv, 'px-3 py-2.5 rounded-card bg-raised')}>
          <dt>Deadline</dt>
          <dd>
            {prettyDue(row.dueAt)}
            <span className="text-muted"> · {row.ownDueAt ? 'own deadline' : 'office deadline'}</span>
          </dd>
          {row.ownDueAt && row.officeDueAt ? (
            <>
              <dt>Office deadline</dt>
              <dd>{prettyDue(row.officeDueAt)}</dd>
            </>
          ) : null}
        </dl>
      ) : null}

      <div className={field}>
        <label htmlFor={ids.status} className={fieldLabel}>
          Status
        </label>
        <select id={ids.status} className={select} value={status} data-autofocus onChange={(e) => changeStatus(e.target.value as ItemStatus)}>
          {ITEM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_OPTION[s]}
            </option>
          ))}
        </select>
      </div>

      <div className={field}>
        <label htmlFor={ids.task} className={fieldLabel}>
          Requirement
        </label>
        <input id={ids.task} className={input} maxLength={160} value={task} onChange={(e) => setTask(e.target.value)} />
      </div>

      <div className={field}>
        <label htmlFor={ids.remarks} className={fieldLabel}>
          Short remark <span className={fieldOptional}>(shown on the office tile)</span>
        </label>
        <input
          id={ids.remarks}
          className={input}
          maxLength={120}
          value={remarks}
          onChange={(e) => {
            typed('remarks');
            setRemarks(e.target.value);
          }}
        />
      </div>

      <div className={field}>
        <label htmlFor={ids.description} className={fieldLabel}>
          Explanation for the student
        </label>
        <textarea
          id={ids.description}
          className={textarea}
          rows={3}
          maxLength={255}
          placeholder={status === 'needs_action' ? 'What the student needs to do' : undefined}
          aria-invalid={error !== null && status === 'needs_action' && !description.trim() ? true : undefined}
          aria-describedby={error ? ids.error : undefined}
          value={description}
          onChange={(e) => {
            typed('description');
            setDescription(e.target.value);
          }}
        />
      </div>

      <div className={field}>
        <label htmlFor={ids.next} className={fieldLabel}>
          Next step
        </label>
        <input
          id={ids.next}
          className={input}
          maxLength={255}
          disabled={approved}
          placeholder={approved ? 'Not needed once approved' : 'What the student should do next'}
          value={approved ? '' : nextStep}
          onChange={(e) => {
            typed('nextStep');
            setNextStep(e.target.value);
          }}
        />
      </div>

      <div className={field}>
        <label htmlFor={ids.note} className={fieldLabel}>
          Internal note for the audit log <span className={fieldOptional}>(optional)</span>
        </label>
        <input id={ids.note} className={input} maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className={fieldHint}>An empty requirement, remark or explanation keeps its current text.</p>
      </div>

      {error ? (
        <p id={ids.error} className={alert('error')} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * The Clearance Status item editor (§8.5). Saving calls updateItem(), which runs the office check and
 * notifies the student when the status changes.
 */
export function ItemEditor({ row, termLine, onClose }: { row: QueueRow | null; termLine: string; onClose: () => void }) {
  const formId = useId();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={row !== null}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={row ? `${row.studentName} · ${row.officeName}` : 'Update requirement'}
      description={row ? `${row.studentNumber} · ${termLine}` : undefined}
      footer={
        <>
          <button type="button" className={button()} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button({ variant: 'primary' })} disabled={busy} aria-busy={busy}>
            {busy ? <span className={spinner} aria-hidden="true" /> : null}
            {busy ? 'Saving…' : 'Save and notify student'}
          </button>
        </>
      }
    >
      {row ? <EditorForm key={row.itemId} row={row} formId={formId} onBusy={setBusy} onSaved={onClose} /> : null}
    </Dialog>
  );
}
