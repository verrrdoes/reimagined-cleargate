import type { Metadata } from 'next';
import Link from 'next/link';
import { pageUser } from '@/lib/auth/guards';
import { getStudentClearance } from '@/lib/services/student';
import { Icon, OfficeIcon, StatusPill } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import {
  actionsCell,
  alert,
  alertBody,
  kpi,
  kpiLabel,
  kpiMeta,
  kpiValue,
  kpis,
  pageHead,
  pageHeadSub,
  panel,
  panelHead,
  panelSub,
  section,
  split,
  table,
  tableFoot,
  tablePrimary,
  tableSecondary,
  tableWrap,
  textTone,
} from '@/components/ui/recipes';
import { formatDate } from '@/lib/time';
import { DueLine } from '@/components/student/DueLine';
import { ItemActions } from '@/components/student/ItemActions';
import { NoClearance } from '@/components/student/NoClearance';
import { ProgressBar } from '@/components/student/ProgressBar';
import { StudentDialogs } from '@/components/student/StudentDialogs';
import { TargetHighlight } from '@/components/student/TargetHighlight';
import { nextStepText, officeAnchor, plural, studentLine } from '@/components/student/format';

export const metadata: Metadata = { title: 'Clearance status' };

const BANNER = 'px-4 py-3.5 mb-6';
const BANNER_TITLE = 'text-15';
const KPI = cn(kpi, 'gap-1.5');
const SECONDARY = cn(tableSecondary, 'mt-1');

/* Below 640px the office table becomes one card per office. */
const STATUS_TABLE = cn(
  table,
  '[&_th:first-child]:pl-2 [&_td:first-child]:pl-2 [&_td]:align-top',
  '[&_td]:transition-[background-color] [&_td]:duration-200 [&_td]:ease-out',
  'max-sm:block max-sm:w-full max-sm:[&_td]:block max-sm:[&_td]:w-full max-sm:[&_td]:h-auto max-sm:[&_td]:px-0',
  'max-sm:[&_td]:py-1 max-sm:[&_td]:border-t-0 max-sm:[&_td:first-child]:pl-0',
);
const VISUALLY_HIDDEN_ON_PHONE =
  'max-sm:absolute max-sm:size-px max-sm:overflow-hidden max-sm:[clip:rect(0_0_0_0)] max-sm:whitespace-nowrap';
const ROW_CARD = 'max-sm:block max-sm:w-full max-sm:px-2 max-sm:py-3 max-sm:border-t max-sm:border-rule';
/* The row named by the URL hash (`:target`, or `data-targeted` from <TargetHighlight>): tinted, with an accent bar. */
const STATUS_ROW = cn(
  ROW_CARD,
  'scroll-mt-[calc(var(--topbar-h)+24px)]',
  'target:[&>td]:bg-pill-info-bg data-targeted:[&>td]:bg-pill-info-bg',
  'target:[&>td:first-child]:shadow-[inset_3px_0_0_var(--accent)]',
  'data-targeted:[&>td:first-child]:shadow-[inset_3px_0_0_var(--accent)]',
  'max-sm:target:[&>td:first-child]:shadow-none max-sm:data-targeted:[&>td:first-child]:shadow-none',
  'max-sm:target:bg-pill-info-bg max-sm:data-targeted:bg-pill-info-bg',
);

/** Clearance status (§8.4): the eligibility banner, one row per office anchored `#office-{code}`, and next steps. */
export default async function ClearanceStatusPage() {
  const user = await pageUser('student');
  const { student, clearance, items, serverNow } = await getStudentClearance(user);

  if (!clearance) {
    return (
      <>
        <header className={pageHead}>
          <h1>Clearance status</h1>
          <p className={pageHeadSub}>{studentLine(student, null)}</p>
        </header>
        <NoClearance />
      </>
    );
  }

  const outstanding = items.filter((i) => i.status !== 'approved');
  const total = clearance.totalOffices;

  return (
    <StudentDialogs items={items} serverNow={serverNow}>
      <TargetHighlight prefix="office-" />
      <header className={pageHead}>
        <h1>Clearance status</h1>
        <p className={pageHeadSub}>{studentLine(student, clearance)}</p>
      </header>

      {clearance.isEligible ? (
        <div className={cn(alert('success'), BANNER)} role="status">
          <Icon name="check-circle" size={20} />
          <div className={alertBody}>
            <strong className={BANNER_TITLE}>Eligible to enroll</strong>
            <span>All {plural(total, 'office has', 'offices have')} cleared you. You can enroll next semester.</span>
          </div>
        </div>
      ) : (
        <div className={cn(alert('warning'), BANNER)} role="status">
          <Icon name="hourglass" size={20} />
          <div className={alertBody}>
            <strong className={BANNER_TITLE}>Not yet eligible</strong>
            <span>You can enroll next semester only once all {plural(total, 'office has', 'offices have')} cleared you.</span>
            <span>Still to clear: {outstanding.map((i) => i.officeName).join(', ')}.</span>
          </div>
        </div>
      )}

      <div className={kpis}>
        <div className={KPI}>
          <span className={kpiLabel}>Offices approved</span>
          <span className={kpiValue}>
            {clearance.approvedCount} of {total}
          </span>
          <ProgressBar clearance={clearance} />
          <span className={kpiMeta}>
            {outstanding.length === 0
              ? 'All offices have cleared your account.'
              : `${plural(outstanding.length, 'office still needs', 'offices still need')} to clear your account.`}
          </span>
        </div>
        <div className={KPI}>
          <span className={kpiLabel}>Pending</span>
          <span className={kpiValue}>{clearance.pendingCount}</span>
          <span className={kpiMeta}>Waiting for the office to review</span>
        </div>
        <div className={KPI}>
          <span className={kpiLabel}>Needs action</span>
          <span className={cn(kpiValue, clearance.needsActionCount > 0 && textTone.action)}>{clearance.needsActionCount}</span>
          <span className={kpiMeta}>Waiting on you</span>
        </div>
      </div>

      <div className={cn(split, section)}>
        <section className={panel()} aria-labelledby="stu-status-title">
          <div className={panelHead}>
            <div>
              <h2 id="stu-status-title">Office status overview</h2>
              <p className={panelSub}>All {plural(total, 'office', 'offices')}, with outstanding items first.</p>
            </div>
          </div>
          <div className={tableWrap}>
            <table className={STATUS_TABLE}>
              <thead className={VISUALLY_HIDDEN_ON_PHONE}>
                <tr className={ROW_CARD}>
                  <th scope="col">Office</th>
                  <th scope="col">Status</th>
                  <th scope="col">Clearance details</th>
                  <th scope="col" className={actionsCell}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="max-sm:block max-sm:w-full">
                {items.map((item) => (
                  <tr key={item.itemId} id={officeAnchor(item.officeCode)} className={STATUS_ROW}>
                    <td data-label="Office">
                      <div className="flex items-start gap-2.5 min-w-[180px] max-sm:min-w-0">
                        <span className="inline-grid place-items-center size-7 rounded-control bg-raised text-muted shrink-0">
                          <OfficeIcon icon={item.officeIcon} size={16} />
                        </span>
                        <div className="flex flex-col min-w-0 wrap-anywhere">
                          <span className={tablePrimary}>{item.officeName}</span>
                          <span className={SECONDARY}>{[item.email, item.hours].filter(Boolean).join(' · ')}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Status" className="whitespace-nowrap">
                      <StatusPill status={item.status} />
                      <span className={SECONDARY}>
                        {item.status === 'approved' && item.approvedAt
                          ? `Cleared ${formatDate(item.approvedAt)}`
                          : `Updated ${formatDate(item.updatedAt)}`}
                      </span>
                    </td>
                    <td data-label="Clearance details" className="min-w-[200px] [&>*+*]:mt-1 max-sm:min-w-0">
                      <span className="block">{item.task}</span>
                      {item.remarks ? <span className={SECONDARY}>{item.remarks}</span> : null}
                      {item.status !== 'approved' ? <DueLine item={item} serverNow={serverNow} showNote={false} /> : null}
                    </td>
                    <td className={cn(actionsCell, 'max-sm:text-left! max-sm:pt-2!')}>
                      <ItemActions itemId={item.itemId} show={['details']} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={tableFoot}>
            <span>
              {clearance.approvedCount} approved · {outstanding.length} outstanding
            </span>
            <Link href="/requirements">View my requirements</Link>
          </div>
        </section>

        <aside className={cn(panel(), 'flex flex-col gap-1')} aria-labelledby="stu-steps-title">
          <h2 id="stu-steps-title">Your next steps</h2>
          <p className={panelSub}>Resolve these to complete clearance.</p>
          {outstanding.length === 0 ? (
            <p className="flex items-start gap-2 mt-2 text-positive">
              <Icon name="check-circle" size={16} className="mt-0.5" />
              <span>Nothing left to do. Every office has cleared you.</span>
            </p>
          ) : (
            <ol className="m-0 mt-2 p-0 list-none">
              {outstanding.map((item) => (
                <li key={item.itemId} className="flex flex-col gap-1.5 py-3 border-t border-rule">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 font-medium">
                    {/* A plain same-page anchor, so :target and the hashchange highlight both apply. */}
                    <a href={`#${officeAnchor(item.officeCode)}`}>{item.officeName}</a>
                    <StatusPill status={item.status} />
                  </div>
                  <p className="text-12">{nextStepText(item)}</p>
                  <DueLine item={item} serverNow={serverNow} showNote={false} />
                  <ItemActions itemId={item.itemId} show={['upload', 'chat']} />
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </StudentDialogs>
  );
}
