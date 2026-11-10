'use client';

import { useRouter } from 'next/navigation';
import { useTransition, type FormEvent } from 'react';
import { useToast } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import { button, field, fieldLabel, input, spinner } from '@/components/ui/recipes';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const RANGE_FIELD = cn(field, 'w-[168px] max-sm:w-[calc(50%-6px)]');

/**
 * The audit log's date range. Applying it keeps the search (?q=) and the type filter (?kind=).
 * A start after the end is refused here with a toast; the server also reads it the other way round.
 */
export function AuditRangeForm({ from, to, q, kind }: { from: string; to: string; q: string; kind: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nextFrom = String(fd.get('from') ?? '');
    const nextTo = String(fd.get('to') ?? '');
    if (!YMD.test(nextFrom) || !YMD.test(nextTo)) {
      toast.error('Enter a start date and an end date.');
      return;
    }
    if (nextFrom > nextTo) {
      toast.error('The start date must be before the end date.');
      return;
    }
    const params = new URLSearchParams({ from: nextFrom, to: nextTo });
    if (q) params.set('q', q);
    if (kind) params.set('kind', kind);
    startTransition(() => router.push(`/audit?${params.toString()}`, { scroll: false }));
  }

  return (
    <form key={`${from}|${to}`} className="flex flex-wrap items-end gap-x-3 gap-y-2" onSubmit={onSubmit} aria-label="Date range">
      <div className={RANGE_FIELD}>
        <label className={fieldLabel} htmlFor="audit-from">
          From
        </label>
        <input id="audit-from" name="from" type="date" className={input} defaultValue={from} required />
      </div>
      <div className={RANGE_FIELD}>
        <label className={fieldLabel} htmlFor="audit-to">
          To
        </label>
        <input id="audit-to" name="to" type="date" className={input} defaultValue={to} required />
      </div>
      <button type="submit" className={button()} disabled={pending}>
        {pending ? <span className={spinner} aria-hidden="true" /> : null}
        Show range
      </button>
    </form>
  );
}
