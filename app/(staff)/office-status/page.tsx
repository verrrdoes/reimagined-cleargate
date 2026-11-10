import type { Metadata } from 'next';
import Link from 'next/link';
import { pageUser } from '@/lib/auth/guards';
import { ITEM_STATUSES, STATUS } from '@/lib/constants';
import { oneOf } from '@/lib/input';
import { officeChoices, officeQueue, pickOffice } from '@/lib/services/review';
import { currentTerm } from '@/lib/services/clearance';
import { autoClearPlan, type AutoClearPlan } from '@/lib/services/officeAutomation';
import { prettyDue } from '@/lib/time';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Tabs } from '@/components/ui/Tabs';
import {
  alert,
  alertBody,
  button,
  pageHead,
  pageHeadActions,
  pageHeadSub,
  progress,
  progressBar,
  tableFoot,
} from '@/components/ui/recipes';
import { OfficeSelect, SearchNote } from '@/components/staff/ListControls';
import { NoOffice } from '@/components/staff/NoOffice';
import { OfficeQueueTable } from '@/components/staff/OfficeQueueTable';
import { hrefWith, matches, param, plural } from '@/components/staff/format';

export const metadata: Metadata = { title: 'Clearance status' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PATH = '/office-status';

/** /office-status: every sign-off of the current year and term, with the manual item editor (§8.5). */
export default async function ClearanceStatusPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await pageUser('staff');
  if (user.role === 'staff' && !user.staffProfile) return <NoOffice title="Clearance status" />;
  const sp = await searchParams;

  const choices = await officeChoices(user);
  const office = pickOffice(choices, param(sp.office));
  const q = param(sp.q).trim();
  const status = oneOf(param(sp.status), ITEM_STATUSES) ?? '';
  const params: Record<string, string> = { q, office: office ?? '', status };

  // Every status loads so the tab counts stay complete; the tab and search filter here.
  const term = await currentTerm();
  const one = user.role === 'staff' ? { id: user.staffProfile!.officeId } : office ? { code: office } : null;
  const [data, plan] = await Promise.all([officeQueue(user, office), one && term ? autoClearPlan(one, term) : null]);
  const rows = data.rows;
  const counts = { needs_action: 0, pending: 0, approved: 0 };
  for (const r of rows) counts[r.status]++;
  const shown = rows
    .filter((r) => (status ? r.status === status : true))
    .filter((r) => matches(q, [r.studentName, r.studentNumber, r.officeName, r.task, r.remarks]));

  const showOffice = user.role === 'admin';
  const officeLabel = showOffice ? (choices?.find((o) => o.code === office)?.name ?? 'All offices') : (user.staffProfile?.office.name ?? '');
  const termLine = data.academicYear && data.term ? `A.Y ${data.academicYear}, ${data.term}` : '';
  const percent = rows.length ? Math.round((100 * counts.approved) / rows.length) : 0;

  return (
    <>
      <div className={pageHead}>
        <h1>Clearance status</h1>
        <p className={pageHeadSub}>
          {officeLabel}
          {data.academicYear && data.term ? ` · ${data.term}, A.Y ${data.academicYear}` : ''}
        </p>
        {choices ? (
          <div className={pageHeadActions}>
            <OfficeSelect choices={choices} value={office} path={PATH} params={params} />
          </div>
        ) : null}
      </div>

      {!data.academicYear ? (
        <EmptyState
          icon="calendar"
          title="No academic year is set as current."
          body="Sign-offs for the current term appear here once an administrator sets the current academic year in Settings."
        />
      ) : rows.length === 0 ? (
        <EmptyState icon="clipboard" title="No clearances opened this term yet." body="Each student's sign-off for your office appears here once their clearance is opened." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
            <p>
              <strong className="tabular-nums">
                {counts.approved} of {rows.length}
              </strong>{' '}
              sign-offs approved
            </p>
            <div
              className={cn(progress, 'flex-[0_1_240px] min-w-[120px]')}
              role="progressbar"
              aria-label="Sign-offs approved"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className={progressBar} style={{ width: `${percent}%` }} />
            </div>
          </div>

          {plan ? <AutoClearNotice plan={plan} /> : null}

          <Tabs
            label="Status"
            current={hrefWith(PATH, params, {})}
            items={[
              { href: hrefWith(PATH, params, { status: null }), label: 'All', count: rows.length },
              ...ITEM_STATUSES.map((s) => ({ href: hrefWith(PATH, params, { status: s }), label: STATUS[s].label, count: counts[s] })),
            ]}
          />

          <SearchNote q={q} path={PATH} params={params} />

          {shown.length === 0 ? (
            <EmptyState
              icon="search"
              title="No students match these filters."
              body="Try another tab, or search for a student name, student number or requirement."
              action={
                <Link href={hrefWith(PATH, params, { q: null, status: null })} className={button()}>
                  Show all sign-offs
                </Link>
              }
            />
          ) : (
            <>
              <OfficeQueueTable rows={shown} showOffice={showOffice} termLine={termLine} serverNow={new Date().toISOString()} />
              <div className={tableFoot}>
                <span>
                  Showing {shown.length} of {plural(rows.length, 'sign-off', 'sign-offs')}
                </span>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

/** Shown while the office has auto-clear on and a deadline ahead (Settings, Offices). */
function AutoClearNotice({ plan }: { plan: AutoClearPlan }) {
  const when = prettyDue(plan.dueAt);
  return (
    <div className={cn(alert('info'), 'mb-4')}>
      <Icon name="clock" />
      <div className={alertBody}>
        <strong>
          {plan.count
            ? `${plural(plan.count, 'student', 'students')} will be cleared automatically on ${when}.`
            : `Auto-clear is on for the ${when} deadline.`}
        </strong>
        <span>
          When the deadline passes, students still Pending with no upload waiting, whom your office hasn&apos;t updated,
          are cleared. To hold a student, mark them Needs action with Update.
        </span>
      </div>
    </div>
  );
}
