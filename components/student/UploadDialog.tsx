'use client';

import { useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Dialog, Icon, useToast } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import {
  alert,
  alertBody,
  button,
  field,
  fieldError,
  fieldHint,
  fieldLabel,
  fieldOptional,
  fieldRow,
  input,
  progress as progressTrack,
  progressBar,
  spinner,
  textarea,
  textTone,
} from '@/components/ui/recipes';
import { finalizeEvidence } from '@/lib/actions/evidence';
import { LIMITS, MB } from '@/lib/constants';
import { sniff, type EvidenceMime } from '@/lib/files/sniff';
import type { StudentItem } from '@/lib/services/student';
import { uploadFile } from '@/lib/upload-client';
import { fileKind, fileSize, uploadLabel } from './format';

const NOTE_MAX = 255;
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';
const TYPE_MESSAGE = 'Upload a PDF, JPG, PNG or WEBP file.';
const UNFINISHED = 'The upload did not finish. Please try again.';

type Phase = 'idle' | 'reading' | 'uploading' | 'checking';
type Chosen = { file: File; mime: EvidenceMime };

const noteLength = (s: string) => Array.from(s).length;

/**
 * "Upload evidence for {Office}" (§8.4). The file is checked in the browser first (size, and the real
 * type from its first bytes), sent straight to storage with a presigned URL, then finalized by
 * `finalizeEvidence`, which checks it again on the server. The dialog cannot be closed mid-upload.
 */
export function UploadDialog({
  item,
  open,
  onClose,
  onUploaded,
}: {
  item: StudentItem;
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const toast = useToast();
  const formId = useId();
  const fileId = useId();
  const noteId = useId();
  const fileHintId = useId();
  const noteHintId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);

  // Start fresh each time the dialog opens (for another item, or the same one again).
  const [shownFor, setShownFor] = useState<{ open: boolean; itemId: number }>({ open, itemId: item.itemId });
  if (shownFor.open !== open || shownFor.itemId !== item.itemId) {
    setShownFor({ open, itemId: item.itemId });
    if (open) {
      setChosen(null);
      setNote('');
      setError(null);
      setPhase('idle');
      setProgress(0);
    }
  }

  const busy = phase !== 'idle';
  const label = uploadLabel(item) ?? 'Upload';
  const submission = item.submission;
  const noteCount = noteLength(note);
  const noteTooLong = noteCount > NOTE_MAX;

  const requestClose = () => {
    if (!busy) onClose();
  };

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setError(null);
    setChosen(null);
    if (!file) return;

    if (file.size > LIMITS.evidenceMB * MB) {
      setError(`That file is larger than ${LIMITS.evidenceMB} MB. Try a smaller scan or photo.`);
      return;
    }
    if (file.size < 1) {
      setError('That file is empty. Choose another one.');
      return;
    }

    setPhase('reading');
    try {
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const type = sniff(head);
      if (!type) {
        setError(TYPE_MESSAGE);
        return;
      }
      setChosen({ file, mime: type.mime });
    } catch {
      setError('That file could not be read. Choose it again.');
    } finally {
      setPhase('idle');
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!chosen) {
      setError('Choose a file to upload.');
      inputRef.current?.focus();
      return;
    }
    if (noteTooLong) {
      setError(`Your note is too long (max ${NOTE_MAX} characters).`);
      return;
    }

    setError(null);
    setProgress(0);
    setPhase('uploading');

    // Declare the type read from the file's bytes, so the server's own check agrees with the ticket.
    const typed = new File([chosen.file], chosen.file.name, { type: chosen.mime, lastModified: chosen.file.lastModified });
    const sent = await uploadFile(typed, { kind: 'evidence', itemId: item.itemId }, setProgress);
    if ('error' in sent) {
      setError(sent.error);
      setPhase('idle');
      return;
    }

    setPhase('checking');
    try {
      const res = await finalizeEvidence({ ticket: sent.ticket, note: note.trim() || null, fileName: chosen.file.name });
      if (!res.ok) {
        setError(res.error.message);
        setPhase('idle');
        return;
      }
      setPhase('idle');
      toast.success(`Uploaded. ${res.data.officeName} will review it (reference ${res.data.reference}).`);
      onUploaded();
    } catch {
      setError(UNFINISHED);
      setPhase('idle');
    }
  }

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      title={`Upload evidence for ${item.officeName}`}
      description={item.task}
      hideClose={busy}
      footer={
        <>
          <button type="button" className={button()} onClick={requestClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button({ variant: 'primary' })} disabled={busy || noteTooLong}>
            {busy && phase !== 'reading' ? <span className={spinner} aria-hidden="true" /> : <Icon name="upload" size={16} />}
            {phase === 'uploading' ? 'Uploading…' : phase === 'checking' ? 'Checking the file…' : label}
          </button>
        </>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={onSubmit} noValidate aria-busy={busy}>
        {submission?.status === 'returned' ? (
          <div className={alert('action')} role="note">
            <Icon name="alert" size={16} />
            <div className={alertBody}>
              <strong>Your last file was returned</strong>
              <span>{[submission.returnCategory, submission.reviewNote].filter(Boolean).join('. ') || 'Upload a corrected file.'}</span>
            </div>
          </div>
        ) : null}
        {submission?.status === 'submitted' ? (
          <div className={alert()} role="note">
            <Icon name="info" size={16} />
            <div className={alertBody}>
              <strong>This replaces {submission.fileName}</strong>
              <span>The office will review the new file instead.</span>
            </div>
          </div>
        ) : null}

        <div className={field}>
          <label className={fieldLabel} htmlFor={fileId}>
            File
          </label>
          <input
            ref={inputRef}
            id={fileId}
            className={input}
            type="file"
            accept={ACCEPT}
            onChange={onFileChange}
            disabled={phase === 'uploading' || phase === 'checking'}
            aria-describedby={error ? `${fileHintId} ${errorId}` : fileHintId}
            aria-invalid={error && !chosen ? true : undefined}
            data-autofocus
          />
          <p id={fileHintId} className={fieldHint}>
            PDF, JPG, PNG or WEBP, up to {LIMITS.evidenceMB} MB.
          </p>
          {chosen ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-2 rounded-control bg-raised text-13">
              <Icon name="paperclip" size={14} />
              <span className="flex-auto min-w-0 font-medium wrap-anywhere">{chosen.file.name}</span>
              <span className="text-muted whitespace-nowrap">
                {fileKind(chosen.mime)} · {fileSize(chosen.file.size)}
              </span>
            </p>
          ) : null}
        </div>

        <div className={field}>
          <div className={fieldRow}>
            <label className={fieldLabel} htmlFor={noteId}>
              Note for the office <span className={fieldOptional}>(optional)</span>
            </label>
            <span
              id={noteHintId}
              className={cn('text-12 tabular-nums', noteTooLong ? textTone.overdue : 'text-muted')}
              aria-live="polite"
            >
              {noteCount}/{NOTE_MAX}
            </span>
          </div>
          <textarea
            id={noteId}
            className={textarea}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Paid at the cashier on Oct 3"
            disabled={phase === 'uploading' || phase === 'checking'}
            aria-describedby={noteHintId}
            aria-invalid={noteTooLong || undefined}
          />
          {noteTooLong ? <p className={fieldError}>Your note is too long (max {NOTE_MAX} characters).</p> : null}
        </div>

        {phase === 'uploading' || phase === 'checking' ? (
          <div className="flex flex-col gap-1.5">
            <div
              className={progressTrack}
              role="progressbar"
              aria-label="Upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={phase === 'checking' ? 100 : progress}
            >
              <div className={progressBar} style={{ width: `${phase === 'checking' ? 100 : progress}%` }} />
            </div>
            <p className="text-12 text-muted" aria-live="polite">
              {phase === 'checking' ? 'Checking the file…' : `Uploading ${progress}%`}
            </p>
          </div>
        ) : null}

        {error ? (
          <p id={errorId} className={alert('error')} role="alert">
            <Icon name="alert" size={16} />
            <span>{error}</span>
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
