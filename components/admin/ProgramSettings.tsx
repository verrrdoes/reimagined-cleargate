'use client';

import { useId, useState, useTransition, type FormEvent } from 'react';
import { Dialog, Icon, useToast } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import {
  actionsCell,
  alert,
  alertBody,
  button,
  field,
  fieldHint,
  fieldLabel,
  input,
  mono,
  numCell,
  spinner,
  table,
  tablePrimary,
  tableWrap,
} from '@/components/ui/recipes';
import { deleteProgram, saveProgram } from '@/lib/actions/settings';
import type { SettingsProgram } from '@/lib/services/settings';
import { ConfirmDialog } from './ConfirmDialog';
import { count, plural } from './format';

/** Settings, Programs tab: the programs on the student application form. */
export function ProgramSettings({ programs }: { programs: SettingsProgram[] }) {
  const toast = useToast();
  const [editing, setEditing] = useState<{ program: SettingsProgram | null } | null>(null);
  const [deleting, setDeleting] = useState<SettingsProgram | null>(null);
  const students = programs.reduce((sum, p) => sum + p.students, 0);

  async function confirmDelete() {
    if (!deleting) return;
    const res = await deleteProgram({ id: deleting.id });
    if (!res.ok) {
      toast.error(res.error.message);
      setDeleting(null);
      return;
    }
    toast.success(`${res.data.code} deleted.`);
    setDeleting(null);
  }

  return (
    <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-x-10 gap-y-6 items-start max-[1200px]:grid-cols-1 max-[1200px]:gap-4">
      <div className="flex flex-col items-start gap-2">
        <h2>Programs</h2>
        <p className="text-muted">Applicants choose one of these on the sign-up form. A program in use can be renamed but not deleted.</p>
        <p className="text-muted">
          {plural(programs.length, 'program')}, {plural(students, 'student')}
        </p>
        <button type="button" className={cn(button({ variant: 'primary' }), 'mt-2')} onClick={() => setEditing({ program: null })}>
          <Icon name="plus" />
          Add a program
        </button>
      </div>

      <div className="min-w-0">
        {programs.length === 0 ? (
          <p className="text-muted">No programs yet. Applicants can&apos;t sign up until there is at least one.</p>
        ) : (
          <div className={tableWrap}>
            <table className={table}>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Name</th>
                  <th scope="col" className={numCell}>
                    Students
                  </th>
                  <th scope="col" className={numCell}>
                    Applications
                  </th>
                  <th scope="col" className={actionsCell}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {programs.map((p) => {
                  const unused = p.students === 0 && p.applications === 0;
                  return (
                    <tr key={p.id}>
                      <td className={cn(mono, tablePrimary)}>{p.code}</td>
                      <td>{p.name}</td>
                      <td className={numCell}>{count(p.students)}</td>
                      <td className={numCell}>{count(p.applications)}</td>
                      <td className={actionsCell}>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button type="button" className={button({ variant: 'ghost', size: 'sm' })} onClick={() => setEditing({ program: p })} aria-label={`Edit ${p.code}`}>
                            <Icon name="edit" />
                            Edit
                          </button>
                          {unused ? (
                            <button type="button" className={button({ variant: 'ghost', size: 'sm' })} onClick={() => setDeleting(p)} aria-label={`Delete ${p.code}`}>
                              <Icon name="trash" />
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProgramDialog open={editing !== null} program={editing?.program ?? null} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting ? `Delete ${deleting.code}?` : ''}
        body={deleting ? `${deleting.name} will be removed from the application form.` : ''}
        confirmLabel="Delete program"
        danger
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function ProgramDialog({ open, program, onClose }: { open: boolean; program: SettingsProgram | null; onClose: () => void }) {
  const toast = useToast();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(open);
  const isNew = program === null;

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
      const res = await saveProgram({
        id: program?.id ?? null,
        code: String(fd.get('code') ?? ''),
        name: String(fd.get('name') ?? ''),
      });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      toast.success('Program saved.');
      onClose();
    });
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={isNew ? 'Add a program' : `Edit ${program.code}`}
      description="Programs appear on the student application form."
      footer={
        <>
          <button type="button" className={button()} onClick={close} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button({ variant: 'primary' })} disabled={pending}>
            {pending ? <span className={spinner} aria-hidden="true" /> : null}
            {isNew ? 'Add program' : 'Save changes'}
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
          <label className={fieldLabel} htmlFor={`${formId}-code`}>
            Code
          </label>
          <input
            id={`${formId}-code`}
            name="code"
            className={cn(mono, input)}
            maxLength={10}
            required
            placeholder="e.g. BSCE"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            defaultValue={program?.code ?? ''}
            data-autofocus
            aria-describedby={`${formId}-code-hint`}
          />
          <span id={`${formId}-code-hint`} className={fieldHint}>
            2 to 10 letters or numbers. Saved in capitals.
          </span>
        </div>
        <div className={field}>
          <label className={fieldLabel} htmlFor={`${formId}-name`}>
            Name
          </label>
          <input
            id={`${formId}-name`}
            name="name"
            className={input}
            maxLength={120}
            required
            placeholder="e.g. Bachelor of Science in Civil Engineering"
            defaultValue={program?.name ?? ''}
          />
        </div>
      </form>
    </Dialog>
  );
}
