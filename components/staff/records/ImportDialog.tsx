'use client';

import { useId, useState, useTransition } from 'react';
import { importColumns, type RecordTemplate } from '@/lib/officeRecords';
import { importRecords, type ImportResult } from '@/lib/actions/office-records';
import { cn } from '@/components/ui/cn';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { button, field, fieldHint, fieldLabel, mono, spinner, table, tableSecondary, tableWrap, textarea } from '@/components/ui/recipes';
import { FormAlert } from '@/components/shell/auth/FormAlert';
import { plural } from '@/components/staff/format';

/** Biggest file read in the browser; the server takes at most 500 rows anyway. */
const MAX_FILE_BYTES = 1024 * 1024;

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * Import list: paste rows from a spreadsheet or pick a CSV file, check them (nothing is saved), then add the rows that
 * check out. The server matches each student number to this term's clearances and skips what is already on record.
 */
export function ImportDialog({
  open,
  onClose,
  template,
  adminOffice,
}: {
  open: boolean;
  onClose: () => void;
  template: RecordTemplate;
  adminOffice: string | null;
}) {
  const toast = useToast();
  const ids = useId();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const columns = importColumns(template);
  const blankCsv = `data:text/csv;charset=utf-8,${encodeURIComponent(`${columns.map(csvCell).join(',')}\r\n`)}`;
  const office = adminOffice ?? undefined;

  const reset = () => {
    setText('');
    setPreview(null);
    setError(null);
  };
  const close = () => {
    if (pending) return;
    reset();
    onClose();
  };

  const run = (confirm: boolean) => {
    setError(null);
    startTransition(async () => {
      const res = await importRecords({ office, text, confirm });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      if (res.data.saved) {
        toast.success(
          `Added ${plural(res.data.ready, template.noun[0], template.noun[1])} for ${plural(res.data.students, 'student', 'students')}.`,
        );
        reset();
        onClose();
        return;
      }
      setPreview(res.data);
    });
  };

  const readFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError('That file is over 1 MB. Split the list and import it in parts.');
      return;
    }
    file.text().then(
      (t) => {
        setText(t);
        setPreview(null);
        setError(null);
      },
      () => setError("That file couldn't be read. Save it as CSV and try again."),
    );
  };

  const skipped = preview ? preview.rows.length - preview.ready : 0;

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title={`Import ${template.noun[1]}`}
      description={
        preview
          ? 'Nothing is saved yet. Check the rows, then add them.'
          : 'Paste rows from a spreadsheet, or choose a CSV file. Nothing is saved until you check the list and confirm.'
      }
      footer={
        preview ? (
          <>
            <button type="button" className={cn(button(), 'mr-auto')} onClick={() => setPreview(null)} disabled={pending}>
              Back
            </button>
            <button type="button" className={button()} onClick={close} disabled={pending}>
              Cancel
            </button>
            <button
              type="button"
              className={button({ variant: 'primary' })}
              onClick={() => run(true)}
              disabled={pending || preview.ready === 0}
              data-autofocus
            >
              {pending ? <span className={spinner} aria-hidden="true" /> : <Icon name="plus" />}
              Add {plural(preview.ready, template.noun[0], template.noun[1])}
            </button>
          </>
        ) : (
          <>
            <button type="button" className={button()} onClick={close} disabled={pending}>
              Cancel
            </button>
            <button type="button" className={button({ variant: 'primary' })} onClick={() => run(false)} disabled={pending || !text.trim()}>
              {pending ? <span className={spinner} aria-hidden="true" /> : null}
              Check list
            </button>
          </>
        )
      }
    >
      {preview ? (
        <div className="flex flex-col gap-3">
          <p>
            <strong className="tabular-nums">{plural(preview.ready, `${template.noun[0]} is`, `${template.noun[1]} are`)}</strong> ready to add
            for {plural(preview.students, 'student', 'students')}
            {skipped ? `; ${plural(skipped, 'row', 'rows')} will be skipped` : ''}.
          </p>
          <div className={cn(tableWrap, 'max-h-[46svh] overflow-y-auto')}>
            <table className={table}>
              <thead>
                <tr>
                  <th scope="col" className="w-px">
                    Row
                  </th>
                  <th scope="col">Student</th>
                  <th scope="col">{template.noun[0][0].toUpperCase() + template.noun[0].slice(1)}</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const d = Object.keys(r.values).length ? template.describe(r.values) : null;
                  return (
                    <tr key={r.line}>
                      <td className="tabular-nums text-muted">{r.line}</td>
                      <td>
                        <span className="block">{r.studentName ?? '—'}</span>
                        <span className={cn(mono, tableSecondary)}>{r.studentNumber || '(blank)'}</span>
                      </td>
                      <td className="wrap-anywhere">
                        {d ? (
                          <>
                            <span>{d.main}</span>
                            {d.details.length ? <span className={tableSecondary}>{d.details.join(' · ')}</span> : null}
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className={r.problem ? 'text-negative' : 'text-positive font-medium'}>{r.problem ?? 'Will be added'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {error ? <FormAlert>{error}</FormAlert> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="text-14">
            <p>Columns, in this order unless the first row names them:</p>
            <p className="mt-1 font-medium">{columns.join(' · ')}</p>
            <p className={cn(fieldHint, 'mt-1')}>
              Only the student number and the required columns need a value. With a header row, the columns can be in any order.{' '}
              <a href={blankCsv} download={`${template.title}.csv`} className="text-accent font-medium hover:underline">
                Download a blank CSV
              </a>
            </p>
          </div>
          <div className={field}>
            <label htmlFor={`${ids}-text`} className={fieldLabel}>
              Rows
            </label>
            <textarea
              id={`${ids}-text`}
              className={cn(textarea, mono, 'min-h-40 text-13 whitespace-pre')}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              placeholder={columns.join('\t')}
              spellCheck={false}
              data-autofocus
            />
          </div>
          <div className={field}>
            <label htmlFor={`${ids}-file`} className={fieldLabel}>
              Or choose a CSV file
            </label>
            <input
              id={`${ids}-file`}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="text-14 file:mr-3 file:px-3 file:h-8 file:rounded-control file:border file:border-border file:bg-surface file:text-text file:font-medium file:cursor-pointer"
              onChange={(e) => readFile(e.target.files?.[0])}
            />
          </div>
          {error ? <FormAlert>{error}</FormAlert> : null}
        </div>
      )}
    </Dialog>
  );
}
