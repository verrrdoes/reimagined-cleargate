import type { Metadata } from 'next';
import Link from 'next/link';
import { pageUser } from '@/lib/auth/guards';
import { LIMITS, SUBMISSION_BADGE } from '@/lib/constants';
import { formatDateTime } from '@/lib/time';
import { officeChoices, pickOffice, reviewHistory } from '@/lib/services/review';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import {
  actionsCell,
  button,
  mono,
  pageHead,
  pageHeadActions,
  pageHeadSub,
  table,
  tableFoot,
  tableHover,
  tablePrimary,
  tableSecondary,
  tableWrap,
} from '@/components/ui/recipes';
import { Tabs } from '@/components/ui/Tabs';
import { OfficeSelect, SearchNote } from '@/components/staff/ListControls';
import { NoOffice } from '@/components/staff/NoOffice';
import { hrefWith, matches, param, plural, programYear } from '@/components/staff/format';

export const metadata: Metadata = { title: 'Review history' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PATH = '/history';

/** Each row is relative so the row link's ::after can cover the whole row: a click anywhere opens it. */
const ROWS_TABLE = cn(table, tableHover, '[&_tbody_tr]:relative');
const ROW_LINK =
  'inline-flex items-center gap-1 text-accent font-medium whitespace-nowrap hover:no-underline ' +
  "after:content-[''] after:absolute after:inset-0";
const CELL_WRAP = 'min-w-[180px] max-w-[380px] wrap-anywhere max-sm:min-w-[140px]';

/** /history: every approval and return, newest first, the most recent 300 (§8.5). */
export default async function ReviewHistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await pageUser('staff');
  if (user.role === 'staff' && !user.staffProfile) return <NoOffice title="Review history" />;
  const sp = await searchParams;

  const choices = await officeChoices(user);
  const office = pickOffice(choices, param(sp.office));
  const q = param(sp.q).trim();
  const rawDecision = param(sp.decision);
  const decision = rawDecision === 'approved' || rawDecision === 'returned' ? rawDecision : '';
  const params: Record<string, string> = { q, office: office ?? '', decision };

  // All decisions load at once so the tab counts stay complete; the tab and search filter here.
  const rows = await reviewHistory(user, office);
  const approved = rows.filter((r) => r.status === 'approved').length;
  const shown = rows
    .filter((r) => (decision ? r.status === decision : true))
    .filter((r) => matches(q, [r.studentName, r.studentNumber, r.reference, r.fileName, r.reviewer, r.officeName, r.returnCategory]));
  const showOffice = user.role === 'admin';
  const officeLabel = showOffice ? (choices?.find((o) => o.code === office)?.name ?? 'All offices') : (user.staffProfile?.office.name ?? '');

  return (
    <>
      <div className={pageHead}>
        <h1>Review history</h1>
        <p className={pageHeadSub}>
          Every approval and return {showOffice && !office ? 'your offices have' : `${officeLabel} has`} made, newest first.
        </p>
        {choices ? (
          <div className={pageHeadActions}>
            <OfficeSelect choices={choices} value={office} path={PATH} params={params} />
          </div>
        ) : null}
      </div>

      <Tabs
        label="Decision"
        current={hrefWith(PATH, params, {})}
        items={[
          { href: hrefWith(PATH, params, { decision: null }), label: 'All', count: rows.length },
          { href: hrefWith(PATH, params, { decision: 'approved' }), label: 'Approved', count: approved },
          { href: hrefWith(PATH, params, { decision: 'returned' }), label: 'Returned', count: rows.length - approved },
        ]}
      />

      <SearchNote q={q} path={PATH} params={params} />

      {shown.length === 0 ? (
        rows.length === 0 ? (
          <EmptyState icon="history" title="No decisions yet." body="Approvals and returns will be listed here." />
        ) : (
          <EmptyState
            icon="search"
            title="No decisions match your filters."
            body="Try another tab, or search for a student, reference or reviewer."
            action={
              <Link href={hrefWith(PATH, params, { q: null, decision: null })} className={button()}>
                Show all decisions
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
                  <th scope="col">Decision</th>
                  <th scope="col" className="max-sm:hidden">
                    Reviewed by
                  </th>
                  <th scope="col">Reviewed</th>
                  <th scope="col" className={actionsCell}>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const badge = SUBMISSION_BADGE[r.status];
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
                      <td>
                        <Pill tone={badge.tone}>{badge.label}</Pill>
                        {r.returnCategory ? <span className={tableSecondary}>{r.returnCategory}</span> : null}
                      </td>
                      <td className="max-sm:hidden">{r.reviewer ?? ''}</td>
                      <td className="whitespace-nowrap">{r.reviewedAt ? <time dateTime={r.reviewedAt}>{formatDateTime(r.reviewedAt)}</time> : null}</td>
                      <td className={actionsCell}>
                        <Link href={`/review/${r.id}`} className={ROW_LINK}>
                          View<span className="sr-only"> {r.studentName}, {r.reference}</span>
                          <Icon name="arrow" size={14} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={tableFoot}>
            <span>
              Showing {shown.length} of {plural(rows.length, 'decision', 'decisions')}
            </span>
            {rows.length >= LIMITS.historyList ? <span>The most recent {LIMITS.historyList} decisions are listed.</span> : null}
          </div>
        </>
      )}
    </>
  );
}
