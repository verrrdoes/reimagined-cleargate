import type { Metadata } from 'next';
import Link from 'next/link';
import { registrarPage } from '@/lib/auth/guards';
import { AUDIT_KINDS, auditRange, auditRows, matchesAudit, prettyDetails, type AuditKind } from '@/lib/services/audit';
import { LIMITS } from '@/lib/constants';
import { formatDate, formatDateTime, manilaDayStart } from '@/lib/time';
import { EmptyState, Icon, Pill, type PillTone } from '@/components/ui';
import { AuditRangeForm } from '@/components/admin/AuditRangeForm';
import { count } from '@/components/admin/format';
import { cn } from '@/components/ui/cn';
import {
  button,
  chip,
  chipCount,
  chips,
  pageHead,
  pageHeadActions,
  pageHeadSub,
  table,
  tableFoot,
  tablePrimary,
  tableSecondary,
  tableWrap,
  toolbar,
} from '@/components/ui/recipes';

export const metadata: Metadata = { title: 'Audit log' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const KIND_TONE: Record<AuditKind, PillTone> = {
  'Status change': 'info',
  'Evidence uploaded': 'pending',
  'Application submitted': 'pending',
  'Evidence approved': 'approved',
  'Application approved': 'approved',
  'Evidence returned': 'action',
  'Application rejected': 'action',
  Deadline: 'muted',
  Reminder: 'muted',
  'Password request': 'pending',
  'Admin change': 'muted',
};

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  await registrarPage();
  const sp = await searchParams;
  const range = auditRange(one(sp.from), one(sp.to));
  const explicitRange = Boolean(one(sp.from) || one(sp.to));
  const q = (one(sp.q) ?? '').trim().slice(0, 100);
  const kindParam = one(sp.kind);
  const kind = (AUDIT_KINDS as readonly string[]).includes(kindParam ?? '') ? (kindParam as AuditKind) : null;

  const all = await auditRows(range);
  const capped = all.length >= LIMITS.auditRows;

  // Chip counts follow the search, so each chip says how many rows it will show.
  const searched = q ? all.filter((r) => matchesAudit(r, q)) : all;
  const counts = new Map<AuditKind, number>();
  for (const r of all) counts.set(r.kind, 0);
  for (const r of searched) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  if (kind && !counts.has(kind)) counts.set(kind, 0);
  const kinds = [...counts.keys()].sort((a, b) => a.localeCompare(b));

  const rows = kind ? searched.filter((r) => r.kind === kind) : searched;

  /** A link to this page with the current range and search, and the given type filter. */
  const href = (k: AuditKind | null, keepQ = true) => {
    const params = new URLSearchParams();
    if (explicitRange) {
      params.set('from', range.from);
      params.set('to', range.to);
    }
    if (keepQ && q) params.set('q', q);
    if (k) params.set('kind', k);
    const qs = params.toString();
    return qs ? `/audit?${qs}` : '/audit';
  };
  const exportHref = `/api/audit/export?${new URLSearchParams({ from: range.from, to: range.to }).toString()}`;
  const rangeText = `${formatDate(manilaDayStart(range.from))} to ${formatDate(manilaDayStart(range.to))}`;

  return (
    <>
      <div className={pageHead}>
        <h1>Audit log</h1>
        <p className={pageHeadSub}>Who changed what, and when. Newest first.</p>
        <div className={pageHeadActions}>
          <a className={button()} href={exportHref} download>
            <Icon name="download" />
            Export CSV
          </a>
        </div>
      </div>

      <div className={cn(toolbar, 'items-end')}>
        <AuditRangeForm from={range.from} to={range.to} q={q} kind={kind} />
        <p className="ml-auto pb-1.5 text-muted max-sm:ml-0 max-sm:pb-0">
          {rangeText}
          {capped ? `, newest ${count(LIMITS.auditRows)} shown` : null}
        </p>
      </div>

      {kinds.length > 0 ? (
        <nav className={cn(toolbar, chips)} aria-label="Filter by type">
          <Link href={href(null)} className={chip} aria-current={kind === null ? 'true' : undefined} scroll={false}>
            All <span className={chipCount}>{count(searched.length)}</span>
          </Link>
          {kinds.map((k) => (
            <Link key={k} href={href(k)} className={chip} aria-current={kind === k ? 'true' : undefined} scroll={false}>
              {k} <span className={chipCount}>{count(counts.get(k) ?? 0)}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {rows.length === 0 ? (
        all.length > 0 ? (
          <EmptyState
            icon="search"
            title="Nothing matches your filters."
            body="Try another search or type, or show every entry in this date range."
            action={
              <Link className={button()} href={href(null, false)} scroll={false}>
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState icon="scroll" title="No activity in this date range." body="Choose an earlier start date to see older entries." />
        )
      ) : (
        <>
          <div className={tableWrap}>
            <table className={table}>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Type</th>
                  <th scope="col">By</th>
                  <th scope="col">About</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.at.getTime()}-${i}`}>
                    <td className="whitespace-nowrap">
                      <time dateTime={r.at.toISOString()}>{formatDateTime(r.at)}</time>
                    </td>
                    <td className="whitespace-nowrap">
                      <Pill tone={KIND_TONE[r.kind]}>{r.kind}</Pill>
                    </td>
                    <td>
                      <span className={tablePrimary}>{r.actor}</span>
                      {r.office ? <span className={tableSecondary}>{r.office}</span> : null}
                    </td>
                    <td>{r.subject || <span className="text-muted">{'\u2014'}</span>}</td>
                    <td className="min-w-[220px] max-w-[56ch] wrap-anywhere">{prettyDetails(r.details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={tableFoot}>
            Showing {count(rows.length)} of {count(all.length)} {all.length === 1 ? 'entry' : 'entries'}
          </p>
        </>
      )}
    </>
  );
}
