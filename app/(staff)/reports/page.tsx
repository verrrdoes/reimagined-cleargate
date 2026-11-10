import type { Metadata } from 'next';
import Link from 'next/link';
import { registrarPage } from '@/lib/auth/guards';
import { getReport, type OfficeReportRow, type YearReportRow } from '@/lib/services/reports';
import { termText } from '@/lib/services/clearance';
import { EmptyState, Icon, OfficeIcon, Pill } from '@/components/ui';
import { ProgressBars, type BarRow } from '@/components/admin/ProgressBars';
import { ageText, count, hoursText, percentOf, yearLabel } from '@/components/admin/format';
import { cn } from '@/components/ui/cn';
import {
  button,
  kpi,
  kpiLabel,
  kpiMeta,
  kpiValue,
  kpis,
  numCell,
  pageHead,
  pageHeadActions,
  pageHeadSub,
  panel,
  panelHead,
  panelSub,
  section,
  sectionHead,
  table,
  tablePrimary,
  tableWrap,
} from '@/components/ui/recipes';

export const metadata: Metadata = { title: 'Reports' };

const YEAR_LEVELS = [1, 2, 3, 4];

const NUM_NOWRAP = cn(numCell, 'whitespace-nowrap');

/** Every year level 1 to 4 (with "No clearances" when empty), then any other level found. */
function yearRows(rows: YearReportRow[]): BarRow[] {
  const levels = [...new Set([...YEAR_LEVELS, ...rows.map((r) => r.yearLevel)])].sort((a, b) => a - b);
  return levels.map((level) => {
    const r = rows.find((x) => x.yearLevel === level);
    return {
      key: String(level),
      label: yearLabel(level),
      clearances: r?.clearances ?? 0,
      cleared: r?.cleared ?? 0,
      avgPercent: r?.avgPercent ?? null,
    };
  });
}

/**
 * The office table rows with their marks: "Slowest reviews" on the highest average review time and
 * "Longest wait" on the earliest upload still waiting, each only when two or more offices can be compared.
 */
function officeRows(rows: OfficeReportRow[]) {
  const now = new Date();
  const timed = rows.filter((r) => r.avgReviewHours !== null);
  const waiting = rows.filter((r) => r.oldestWaiting !== null);
  const slowest = timed.length > 1 ? timed.reduce((a, b) => ((b.avgReviewHours ?? 0) > (a.avgReviewHours ?? 0) ? b : a)) : null;
  const longest =
    waiting.length > 1 ? waiting.reduce((a, b) => ((b.oldestWaiting?.getTime() ?? 0) < (a.oldestWaiting?.getTime() ?? 0) ? b : a)) : null;
  return rows.map((r) => ({
    ...r,
    slowest: r === slowest,
    longest: r === longest,
    review: hoursText(r.avgReviewHours),
    age: ageText(r.oldestWaiting, now),
  }));
}

export default async function ReportsPage() {
  const user = await registrarPage();
  const report = await getReport();

  if (!report.term) {
    return (
      <>
        <div className={pageHead}>
          <h1>Reports</h1>
          <p className={pageHeadSub}>Clearance progress for the current term.</p>
        </div>
        <EmptyState
          icon="chart"
          title="No current academic year is set."
          body={user.role === 'admin' ? null : 'Ask the administrator to set one.'}
          action={
            user.role === 'admin' ? (
              <Link className={button()} href="/settings?tab=years">
                Set one in Settings
              </Link>
            ) : null
          }
        />
      </>
    );
  }

  const clearedPct = percentOf(report.cleared, report.clearances);
  const programs: BarRow[] = report.byProgram.map((p) => ({
    key: p.code,
    label: p.code,
    title: p.name,
    clearances: p.clearances,
    cleared: p.cleared,
    avgPercent: p.avgPercent,
  }));
  const offices = officeRows(report.byOffice);

  return (
    <>
      <div className={pageHead}>
        <h1>Reports</h1>
        <p className={pageHeadSub}>Clearance progress for {termText(report.term)}.</p>
        <div className={pageHeadActions}>
          <Link className={button()} href="/audit">
            <Icon name="scroll" />
            Open the audit log
          </Link>
          <a className={button({ variant: 'primary' })} href="/api/reports/export" download>
            <Icon name="download" />
            Export to Excel (CSV)
          </a>
        </div>
      </div>

      <div className={kpis}>
        <div className={kpi}>
          <span className={kpiLabel}>Active students</span>
          <span className={kpiValue}>{count(report.students)}</span>
          <span className={kpiMeta}>{report.clearances === 1 ? '1 clearance opened' : `${count(report.clearances)} clearances opened`}</span>
        </div>
        <div className={kpi}>
          <span className={kpiLabel}>Fully cleared</span>
          <span className={kpiValue}>{count(report.cleared)}</span>
          <span className={kpiMeta}>{clearedPct === null ? 'No clearances yet' : `${clearedPct}% of clearances`}</span>
        </div>
        <div className={kpi}>
          <span className={kpiLabel}>Average progress</span>
          <span className={kpiValue}>{report.avgPercent === null ? '\u2014' : `${report.avgPercent}%`}</span>
          <span className={kpiMeta}>Across all offices</span>
        </div>
        <div className={kpi}>
          <span className={kpiLabel}>Applications waiting</span>
          <span className={kpiValue}>{count(report.applications.pending)}</span>
          <span className={kpiMeta}>
            {count(report.applications.approved)} approved, {count(report.applications.rejected)} rejected
          </span>
        </div>
      </div>

      <div className={cn('grid grid-cols-2 gap-6 max-[900px]:grid-cols-1', section)}>
        <section className={panel()} aria-labelledby="by-program">
          <div className={panelHead}>
            <div>
              <h2 id="by-program">By program</h2>
              <p className={panelSub}>Average progress and students fully cleared</p>
            </div>
          </div>
          <ProgressBars rows={programs} empty="No programs yet." />
        </section>
        <section className={panel()} aria-labelledby="by-year">
          <div className={panelHead}>
            <div>
              <h2 id="by-year">By year level</h2>
              <p className={panelSub}>Average progress and students fully cleared</p>
            </div>
          </div>
          <ProgressBars rows={yearRows(report.byYear)} empty="No clearances yet." />
        </section>
      </div>

      <section className={section} aria-labelledby="office-workload">
        <div className={sectionHead}>
          <div>
            <h2 id="office-workload">Office workload</h2>
            <p className={panelSub}>Average review time counts evidence from upload to decision.</p>
          </div>
        </div>
        {offices.length === 0 ? (
          <EmptyState title="No active offices." body="Turn an office on in Settings to see its workload here." />
        ) : (
          <div className={tableWrap}>
            <table className={table}>
              <thead>
                <tr>
                  <th scope="col">Office</th>
                  <th scope="col" className={numCell}>
                    Approved
                  </th>
                  <th scope="col" className={numCell}>
                    Pending
                  </th>
                  <th scope="col" className={numCell}>
                    Needs action
                  </th>
                  <th scope="col" className={numCell}>
                    Evidence waiting
                  </th>
                  <th scope="col" className={numCell}>
                    Avg review time
                  </th>
                  <th scope="col" className={numCell}>
                    Oldest wait
                  </th>
                </tr>
              </thead>
              <tbody>
                {offices.map((o) => (
                  <tr key={o.code}>
                    <td>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="grid place-items-center shrink-0 size-8 rounded-control bg-raised text-muted">
                          <OfficeIcon icon={o.icon} />
                        </span>
                        <div className="min-w-0">
                          <span className={tablePrimary}>{o.name}</span>
                          {o.slowest || o.longest ? (
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {o.slowest ? <Pill tone="action">Slowest reviews</Pill> : null}
                              {o.longest ? <Pill tone="pending">Longest wait</Pill> : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className={numCell}>{count(o.approved)}</td>
                    <td className={numCell}>{count(o.pending)}</td>
                    <td className={numCell}>{count(o.needsAction)}</td>
                    <td className={numCell}>{count(o.waitingEvidence)}</td>
                    <td className={NUM_NOWRAP}>{o.review}</td>
                    <td className={NUM_NOWRAP}>{o.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
