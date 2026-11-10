import Link from 'next/link';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { button, chip, chipCount, chips, tableFoot } from '@/components/ui/recipes';
import type { OfficeRef } from '@/lib/types';
import { hrefWith, plural } from './format';
import { UrlSelect } from './UrlSelect';

/** Filter chips that are links: each chip is its own URL. */
export function Chips({
  items,
  label,
  className,
}: {
  items: { href: string; label: string; count: number; current: boolean }[];
  label: string;
  className?: string;
}) {
  return (
    <nav className={cn(chips, className)} aria-label={label}>
      {items.map((c) => (
        <Link key={c.href} href={c.href} className={chip} aria-current={c.current ? 'true' : undefined} scroll={false}>
          {c.label}
          <span className={chipCount}>{c.count}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Admins only: pick one office or all offices (?office=). Renders nothing for staff. */
export function OfficeSelect({
  choices,
  value,
  path,
  params,
}: {
  choices: OfficeRef[] | null;
  value: string | null;
  path: string;
  params: Record<string, string>;
}) {
  if (!choices) return null;
  return (
    <UrlSelect
      name="office"
      label="Office"
      value={value ?? ''}
      path={path}
      params={params}
      options={[{ value: '', label: 'All offices' }, ...choices.map((o) => ({ value: o.code, label: o.name }))]}
    />
  );
}

/** Shows the active top-bar search (?q=) with a way to clear it. */
export function SearchNote({ q, path, params, className }: { q: string; path: string; params: Record<string, string>; className?: string }) {
  if (!q) return null;
  return (
    <p className={cn('flex flex-wrap items-center gap-1.5 mb-3 text-muted', className)}>
      <Icon name="search" size={14} />
      <span>
        Results for <strong className="text-text font-semibold">“{q}”</strong>
      </span>
      <Link href={hrefWith(path, params, { q: null })} scroll={false}>
        Clear search
      </Link>
    </p>
  );
}

/** Page numbers to show: all when few, otherwise the first, the last and the neighbours of the current page. */
function pageList(current: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, pages, current - 1, current, current + 1]);
  const out: (number | 'gap')[] = [];
  for (let p = 1; p <= pages; p++) {
    if (keep.has(p)) out.push(p);
    else if (out[out.length - 1] !== 'gap') out.push('gap');
  }
  return out;
}

const PAGE_BUTTON = button({ size: 'sm' });

const PAGE_NUM =
  'inline-grid place-items-center min-w-7 h-7 px-1.5 rounded-control text-text text-13 tabular-nums no-underline ' +
  'hover:bg-raised hover:no-underline aria-[current=page]:bg-active aria-[current=page]:font-semibold';

/** "Showing 1–8 of 23 pending submissions" with Previous, page numbers and Next (links to ?page=). */
export function Pager({
  page,
  pageSize,
  total,
  noun,
  path,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  noun: [string, string];
  path: string;
  params: Record<string, string>;
}) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const end = Math.min(total, start + pageSize);
  const to = (p: number) => hrefWith(path, params, { page: p > 1 ? p : null });

  return (
    <div className={cn(tableFoot, 'text-13')}>
      <span>
        Showing {start + 1}–{end} of {plural(total, noun[0], noun[1])}
      </span>
      {pages > 1 ? (
        <nav className="flex flex-wrap items-center gap-1" aria-label="Pages">
          {page > 1 ? (
            <Link href={to(page - 1)} className={PAGE_BUTTON} scroll={false}>
              <Icon name="chevron-left" size={14} />
              Previous
            </Link>
          ) : (
            <span className={PAGE_BUTTON} aria-disabled="true">
              <Icon name="chevron-left" size={14} />
              Previous
            </span>
          )}
          {pageList(page, pages).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className="px-1 text-muted" aria-hidden="true">
                …
              </span>
            ) : (
              <Link
                key={p}
                href={to(p)}
                className={PAGE_NUM}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
                scroll={false}
              >
                {p}
              </Link>
            ),
          )}
          {page < pages ? (
            <Link href={to(page + 1)} className={PAGE_BUTTON} scroll={false}>
              Next
              <Icon name="chevron-right" size={14} />
            </Link>
          ) : (
            <span className={PAGE_BUTTON} aria-disabled="true">
              Next
              <Icon name="chevron-right" size={14} />
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
