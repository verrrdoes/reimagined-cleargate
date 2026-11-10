import type { Metadata } from 'next';
import Link from 'next/link';
import { registrarPage } from '@/lib/auth/guards';
import { LIMITS } from '@/lib/constants';
import { formatDate, formatDateTime } from '@/lib/time';
import { listApplications } from '@/lib/services/applications';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { Tabs } from '@/components/ui/Tabs';
import { cn } from '@/components/ui/cn';
import {
  actionsCell,
  button,
  mono,
  pageHead,
  pageHeadSub,
  table,
  tableFoot,
  tablePrimary,
  tableSecondary,
  tableWrap,
  toolbar,
  toolbarCount,
} from '@/components/ui/recipes';
import {
  APPLICATION_STATUS,
  APPLICATION_STATUSES,
  ordinal,
  type ApplicationRow,
  type ApplicationStatusName,
} from '@/components/applications/types';

export const metadata: Metadata = { title: 'Applications' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Tab = ApplicationStatusName | 'all';

const PATH = '/applications';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** The list URL for a tab, keeping the search. Pending is the default tab. */
function tabHref(tab: Tab, q: string): string {
  const p = new URLSearchParams();
  if (tab !== 'pending') p.set('status', tab);
  if (q) p.set('q', q);
  const s = p.toString();
  return s ? `${PATH}?${s}` : PATH;
}

const EMPTY: Record<Tab, { title: string; body: string }> = {
  pending: { title: 'No applications waiting.', body: 'New sign-ups will appear here.' },
  approved: { title: 'No approved applications yet.', body: 'Applications you approve are listed here with the account they created.' },
  rejected: { title: 'No rejected applications.', body: 'Applications you reject are listed here with the reason sent to the applicant.' },
  all: { title: 'No applications here yet.', body: 'Students apply from the sign-up page, and each application is listed here for review.' },
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** /applications: student sign-ups for the Registrar and admins (§8.3). Search comes from the top bar (?q=). */
export default async function ApplicationsPage({ searchParams }: { searchParams: SearchParams }) {
  await registrarPage();
  const sp = await searchParams;
  const rawStatus = first(sp.status);
  const tab: Tab =
    rawStatus === 'all' ? 'all' : (APPLICATION_STATUSES as readonly string[]).includes(rawStatus) ? (rawStatus as ApplicationStatusName) : 'pending';
  const q = first(sp.q).trim().slice(0, 100);

  const { counts, rows, limited } = await listApplications({ status: tab === 'all' ? null : tab, q });
  const total = counts.pending + counts.approved + counts.rejected;
  const showStatus = tab === 'all';
  const showDecision = tab !== 'pending';

  return (
    <>
      <div className={pageHead}>
        <h1>Applications</h1>
        <p className={pageHeadSub}>
          Review student sign-ups. Approving creates the student ID, school email and a temporary password.
        </p>
      </div>

      <Tabs
        label="Application status"
        current={tabHref(tab, q)}
        items={[
          { href: tabHref('pending', q), label: 'Pending', count: counts.pending },
          { href: tabHref('approved', q), label: 'Approved', count: counts.approved },
          { href: tabHref('rejected', q), label: 'Rejected', count: counts.rejected },
          { href: tabHref('all', q), label: 'All', count: total },
        ]}
      />

      <div className={cn(toolbar, 'min-h-6')}>
        {q ? (
          <p className="min-w-0 wrap-anywhere">
            Showing applications matching <strong>&ldquo;{q}&rdquo;</strong>.{' '}
            <Link href={tabHref(tab, '')}>Clear search</Link>
          </p>
        ) : null}
        <p className={toolbarCount}>
          {plural(counts.today, 'application')} submitted today
        </p>
      </div>

      {rows.length === 0 ? (
        q ? (
          <EmptyState
            icon="search"
            title="No applications match your search."
            body="Search by name, reference number, personal email or program."
            action={
              <Link href={tabHref(tab, '')} className={button()}>
                Clear search
              </Link>
            }
          />
        ) : (
          <EmptyState icon="user-plus" title={EMPTY[tab].title} body={EMPTY[tab].body} />
        )
      ) : (
        <>
          <div className={tableWrap}>
            <table className={table}>
              <thead>
                <tr>
                  <th scope="col">Applicant</th>
                  <th scope="col">Applying for</th>
                  <th scope="col" className="max-md:hidden">
                    Reference
                  </th>
                  {showStatus ? <th scope="col">Status</th> : null}
                  <th scope="col">Submitted</th>
                  {showDecision ? (
                    <th scope="col" className="max-md:hidden">
                      Decision
                    </th>
                  ) : null}
                  <th scope="col" className={actionsCell}>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <ApplicationTableRow key={r.id} row={r} showStatus={showStatus} showDecision={showDecision} />
                ))}
              </tbody>
            </table>
          </div>
          {limited ? (
            <div className={tableFoot}>
              <span>
                Showing the newest {LIMITS.applicationsList}. Search for a name or reference number to find an older application.
              </span>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

function ApplicationTableRow({ row: r, showStatus, showDecision }: { row: ApplicationRow; showStatus: boolean; showDecision: boolean }) {
  const href = `${PATH}/${r.id}`;
  const status = APPLICATION_STATUS[r.status];
  const pending = r.status === 'pending';
  return (
    <tr>
      <td>
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar name={`${r.firstName} ${r.lastName}`} url={r.hasPhoto ? `/api/files/application-photo/${r.id}` : null} size={32} />
          <div className="flex flex-col min-w-0 max-w-[280px]">
            <Link href={href} className={cn(tablePrimary, 'hover:text-accent')}>
              {r.name}
            </Link>
            <span className={cn(tableSecondary, 'truncate')}>{r.personalEmail}</span>
          </div>
        </div>
      </td>
      <td>
        <span title={r.programName}>
          {r.program} · {ordinal(r.yearLevel)} year
        </span>
        <span className={tableSecondary}>{r.admissionType}</span>
      </td>
      <td className="max-md:hidden">
        <span className={cn(mono, 'whitespace-nowrap')}>{r.reference}</span>
      </td>
      {showStatus ? (
        <td>
          <Pill tone={status.tone}>{status.label}</Pill>
        </td>
      ) : null}
      <td className="whitespace-nowrap">{formatDateTime(r.submittedAt)}</td>
      {showDecision ? (
        <td className="max-md:hidden">
          {r.reviewedAt ? (
            <>
              <span className="whitespace-nowrap">{formatDate(r.reviewedAt)}</span>
              {r.reviewer ? <span className={tableSecondary}>by {r.reviewer}</span> : null}
            </>
          ) : (
            <span className="text-muted">Waiting</span>
          )}
        </td>
      ) : null}
      <td className={actionsCell}>
        <Link
          href={href}
          className={button({ variant: pending ? 'default' : 'ghost', size: 'sm' })}
          aria-label={`${pending ? 'Review' : 'View'} the application of ${r.firstName} ${r.lastName}`}
        >
          {pending ? 'Review' : 'View'}
          <Icon name="arrow" size={16} />
        </Link>
      </td>
    </tr>
  );
}
