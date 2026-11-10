'use client';

import { useId, useMemo, useState } from 'react';
import { input, select } from '@/components/ui/recipes';
import type { DeadlineItem } from './types';

/** Lists longer than this get a search box above the select. */
const SEARCH_FROM = 8;

/**
 * Chooses one requirement by student: "Maria Santos · 2026-00012 · Library". A search box narrows the list
 * by name, student ID or office; the chosen student stays in the list while searching.
 */
export function StudentPicker({
  id,
  items,
  value,
  onChange,
  showOffice,
  invalid,
  describedBy,
  autoFocus,
}: {
  id: string;
  items: DeadlineItem[];
  value: number | null;
  onChange: (itemId: number | null) => void;
  showOffice: boolean;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      needle === ''
        ? items
        : items.filter(
            (i) =>
              i.id === value ||
              i.studentName.toLowerCase().includes(needle) ||
              i.studentNumber.includes(needle) ||
              i.officeName.toLowerCase().includes(needle),
          ),
    [items, needle, value],
  );
  const searchable = items.length > SEARCH_FROM;

  return (
    <div className="flex flex-col gap-2">
      {searchable ? (
        <>
          <label htmlFor={searchId} className="sr-only">
            Search students
          </label>
          <input
            id={searchId}
            type="search"
            className={input}
            placeholder="Search by name or student ID"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-autofocus={autoFocus ? true : undefined}
          />
        </>
      ) : null}
      <select
        id={id}
        className={select}
        value={value === null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        data-autofocus={autoFocus && !searchable ? true : undefined}
      >
        <option value="">{shown.length || needle === '' ? 'Choose a student' : 'No students match your search'}</option>
        {shown.map((i) => (
          <option key={i.id} value={i.id}>
            {`${i.studentName} · ${i.studentNumber}${showOffice ? ` · ${i.officeName}` : ''}`}
          </option>
        ))}
      </select>
    </div>
  );
}
