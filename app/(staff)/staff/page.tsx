import type { Metadata } from 'next';
import Link from 'next/link';
import { pageUser } from '@/lib/auth/guards';
import { posInt } from '@/lib/input';
import { LIMITS, SUBMISSION_BADGE } from '@/lib/constants';
import { formatDateTime } from '@/lib/time';
import { officeChoices, pendingList, pickOffice } from '@/lib/services/review';
import { ClearanceSlip } from '@/components/ui/ClearanceSlip';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import {
  actionsCell,
  button,
  kpi,
  kpiLabel,
  kpiMeta,
  kpiValue,
  kpis,
  mono,
  pageHead,
  pageHeadSub,
  section,
  sectionHead,
  table,
  tableHover,
  tablePrimary,
  tableSecondary,
  tableWrap,
  toolbar,
  toolbarEnd,
} from '@/components/ui/recipes';
import { Chips, OfficeSelect, Pager, SearchNote } from '@/components/staff/ListControls';
import { NoOffice } from '@/components/staff/NoOffice';
import { UrlSelect } from '@/components/staff/UrlSelect';
import { hrefWith, matches, param, programYear } from '@/components/staff/format';

export const metadata: Metadata = { title: 'Pending list' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PATH = '/staff';

/** Each row is relative so the row link's ::after can cover the whole row: a click anywhere opens it. */
const ROWS_TABLE = cn(table, tableHover, '[&_tbody_tr]:relative');
const ROW_LINK =
  'inline-flex items-center gap-1 text-accent font-medium whitespace-nowrap hover:no-underline ' +
  "after:content-[''] after:absolute after:inset-0";
const CELL_WRAP = 'min-w-[180px] max-w-[380px] wrap-anywhere max-sm:min-w-[140px]';

/** /staff: submissions waiting for this office's review (§8.5). */
export default async function PendingListPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await pageUser('staff');
  if (user.role === 'staff' && !user.staffProfile) return <NoOffice title="Pending list" />;
  const sp = await searchParams;

  const choices = await officeChoices(user);
  const office = pickOffice(choices, param(sp.office));
  const q = param(sp.q).trim();
  const only = param(sp.only) === 'resubmitted' ? 'resubmitted' : '';
  const sort = param(sp.sort) === 'oldest' ? 'oldest' : '';
  const params: Record<string, string> = { q, office: office ?? '', only, sort };

  const data = await pendingList(user, office);
  const all = data.rows;
  const resubmittedCount = all.filter((r) => r.resubmitted).length;

  const officeLabel =
    user.role === 'admin'
      ? (choices?.find((o) => o.code === office)?.name ?? 'All offices')
      : (user.staffProfile?.office.name ?? 'Your office');

  const shown = all
    .filter((r) => (only === 'resubmitted' ? r.resubmitted : true))
    .filter((r) => matches(q, [r.studentName, r.studentNumber, r.fileName, r.reference, r.officeName, r.task]));
  if (sort === 'oldest') shown.reverse();

  const pageSize = LIMITS.pendingPageSize;
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const page = Math.min(posInt(param(sp.page)) ?? 1, pages);
  const pageRows = shown.slice((page - 1) * pageSize, page * pageSize);
  const showOffice = user.role === 'admin';

  return (
    <>
      <div className={pageHead}>
        <h1>Pending list</h1>
        <p className={pageHeadSub}>
          {officeLabel} clearance{data.termLabel ? ` · ${data.termLabel}` : ''}
        </p>
      </div>

      <div className={cn(kpis, 'mb-2')}>
        <section className={kpi} aria-label="Pending review">
          <p className={kpiLabel}>Pending review</p>
          <p className={kpiValue}>{all.length}</p>
          <p className={kpiMeta}>{data.submittedToday} submitted today</p>
        </section>
        <section className={kpi} aria-label="Approved today">
          <p className={kpiLabel}>Approved today</p>
          <p className={kpiValue}>{data.approvedToday}</p>
          <p className={kpiMeta}>
            {officeLabel === 'All offices' ? 'Requirements cleared, all offices' : `${officeLabel} requirements cleared`}
          </p>
        </section>
        <section className={kpi} aria-label="Returned today">
          <p className={kpiLabel}>Returned today</p>
          <p className={kpiValue}>{data.returnedToday}</p>
          <p className={kpiMeta}>Awaiting student corrections</p>
        </section>
      </div>

      <section className={section} aria-labelledby="subs-title">
        <div className={sectionHead}>
          <h2 id="subs-title" className="text-16 font-semibold leading-[1.4]">
            Submissions to review
          </h2>
        </div>

        <div className={toolbar}>
          <Chips
            label="Show"
            items={[
              { href: hrefWith(PATH, params, { only: null }), label: 'All pending', count: all.length, current: only === '' },
              { href: hrefWith(PATH, params, { only: 'resubmitted' }), label: 'Resubmitted', count: resubmittedCount, current: only === 'resubmitted' },
            ]}
          />
          <div className={cn(toolbarEnd, 'flex flex-wrap items-center gap-2')}>
            <OfficeSelect choices={choices} value={office} path={PATH} params={params} />
            <UrlSelect
              name="sort"
              label="Sort"
              value={sort}
              path={PATH}
              params={params}
              options={[
                { value: '', label: 'Newest first' },
                { value: 'oldest', label: 'Oldest first' },
              ]}
            />
          </div>
        </div>

        <SearchNote q={q} path={PATH} params={params} />

        {pageRows.length === 0 ? (
          all.length === 0 ? (
            <EmptyState icon="inbox" title="Nothing to review right now." body="New uploads from students will appear here." />
          ) : (
            <EmptyState
              icon="search"
              title="No submissions match your search."
              body="Try a student name, student number, file name or reference."
              action={
                <Link href={hrefWith(PATH, params, { q: null, only: null })} className={button()}>
                  Show all pending
                </Link>
              }
            />
          )
        ) : (
          <>
            <div className={tableWrap}>
              <table className={ROWS_TABLE}>
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">Evidence</th>
                    <th scope="col">Submitted</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="max-sm:hidden">
                      Clearance
                    </th>
                    <th scope="col" className={actionsCell}>
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => {
                    const badge = r.resubmitted ? SUBMISSION_BADGE.resubmitted : SUBMISSION_BADGE.submitted;
                    return (
                      <tr key={r.id}>
                        <td>
                          <span className={tablePrimary}>{r.studentName}</span>
                          <span className={tableSecondary}>
                            <span className={mono}>{r.studentNumber}</span> · {programYear(r.program, r.yearLevel)}
                          </span>
                        </td>
                        <td className={CELL_WRAP}>
                          <span className="block text-text">{r.fileName}</span>
                          <span className={tableSecondary}>
                            {showOffice ? `${r.officeName} · ` : ''}
                            <span className={mono}>{r.reference}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap">
                          <time dateTime={r.submittedAt}>{formatDateTime(r.submittedAt)}</time>
                        </td>
                        <td>
                          <Pill tone={badge.tone}>{badge.label}</Pill>
                        </td>
                        <td className="max-sm:hidden">
                          <ClearanceSlip items={r.slip} size="mini" label={`${r.studentName}'s clearance`} />
                        </td>
                        <td className={actionsCell}>
                          <Link href={`/review/${r.id}`} className={ROW_LINK}>
                            Review<span className="sr-only"> {r.studentName}, {r.reference}</span>
                            <Icon name="arrow" size={14} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={page} pageSize={pageSize} total={shown.length} noun={['pending submission', 'pending submissions']} path={PATH} params={params} />
          </>
        )}
      </section>
    </>
  );
}
