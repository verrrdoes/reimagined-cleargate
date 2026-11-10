'use client';

import { useRouter } from 'next/navigation';
import { useId, useTransition } from 'react';
import { select } from '@/components/ui/recipes';
import { hrefWith } from './format';

/**
 * A select that writes its value into the URL (`?name=value`, removed when empty) and resets ?page=.
 * `path` and `params` are the page's own path and current query, passed from the server.
 */
export function UrlSelect({
  name,
  value,
  options,
  label,
  path,
  params,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  label: string;
  path: string;
  params: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        className={select}
        value={value}
        aria-busy={pending || undefined}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(() => router.replace(hrefWith(path, params, { [name]: next || null }), { scroll: false }));
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}
