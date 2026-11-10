import type { Metadata } from 'next';
import Link from 'next/link';
import { pageUser } from '@/lib/auth/guards';
import { getStudentClearance, type StudentItem } from '@/lib/services/student';
import { ClearanceSlip, Countdown, Icon, OfficeIcon, StatusPill } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import {
  alert,
  alertBody,
  button,
  pageHead,
  pageHeadActions,
  pageHeadSub,
  panel,
  section,
  sectionHead,
} from '@/components/ui/recipes';
import type { ItemStatus } from '@/lib/types';
import { dueLine } from '@/lib/deadline';
import { DueLine } from '@/components/student/DueLine';
import { EvidenceLine } from '@/components/student/EvidenceLine';
import { ItemActions } from '@/components/student/ItemActions';
import { NoClearance } from '@/components/student/NoClearance';
import { ProgressBar } from '@/components/student/ProgressBar';
import { StudentDialogs } from '@/components/student/StudentDialogs';
import { nextStepText, ordinal, plural, statusHref } from '@/components/student/format';
import { statusDot, studentLayout } from '@/components/student/layout';

export const metadata: Metadata = { title: 'Dashboard' };

const COUNT = 'inline-flex items-center gap-1.5';
const COUNT_FIGURE = 'text-text font-semibold tabular-nums';
const CARD = 'flex flex-col gap-2.5 min-w-0';
const FOCUS_TITLE = 'text-16 font-semibold mr-auto';

const FOCUS_TONE = {
  action: 'border-l-[3px] border-l-action-line',
  pending: 'border-l-[3px] border-l-warning',
} as const;

const TILE_TONE: Record<ItemStatus, string> = {
  needs_action: 'border-action-line',
  pending: '',
  approved: '',
};

const TILE_ICON_TONE: Record<ItemStatus, string> = {
  needs_action: 'bg-pill-action-bg text-pill-action-fg',
  pending: '',
  approved: 'bg-pill-approved-bg text-pill-approved-fg',
};

/** The deadline card's subject: the nearest future effective deadline among items not yet approved. */
function nextDeadline(items: StudentItem[], now: number) {
  const open = items.filter((i) => i.status !== 'approved' && i.dueAt);
  const upcoming = open
    .filter((i) => Date.parse(i.dueAt as string) > now)
    .sort((a, b) => Date.parse(a.dueAt as string) - Date.parse(b.dueAt as string));
  const overdue = open
    .filter((i) => Date.parse(i.dueAt as string) <= now)
    .sort((a, b) => Date.parse(a.dueAt as string) - Date.parse(b.dueAt as string));
  return { next: upcoming[0] ?? null, later: upcoming.slice(1, 4), overdue };
}

/** Student dashboard (§8.4): greeting, overall progress, what to do now, the next deadline and every office. */
export default async function DashboardPage() {
  const user = await pageUser('student');
  const { student, clearance, items, serverNow } = await getStudentClearance(user);
  const firstName = student?.firstName ?? user.student?.firstName ?? '';
  const greeting = firstName ? `Good day, ${firstName}` : 'Good day';

  if (!clearance) {
    return (
      <>
        <header className={pageHead}>
          <h1>{greeting}</h1>
          {student ? (
            <p className={pageHeadSub}>
              {ordinal(student.yearLevel)} year {student.programName}
            </p>
          ) : null}
        </header>
        <NoClearance />
      </>
    );
  }

  const focus = items.find((i) => i.status !== 'approved') ?? null;
  const { next, later, overdue } = nextDeadline(items, Date.parse(serverNow));
  const remaining = clearance.totalOffices - clearance.approvedCount;

  return (
    <StudentDialogs items={items} serverNow={serverNow}>
      <header className={pageHead}>
        <h1>{greeting}</h1>
        <p className={pageHeadSub}>
          {student ? `${ordinal(student.yearLevel)} year ${student.program} · ` : ''}A.Y {clearance.academicYear}, {clearance.termLabel}
        </p>
        <div className={pageHeadActions}>
          <Link className={button()} href="/requirements">
            <Icon name="list-checks" size={16} />
            My requirements
          </Link>
        </div>
      </header>

      <section className={cn(panel(), studentLayout.summary)} aria-labelledby="stu-summary-title">
        <div className={studentLayout.summaryFigures}>
          <h2 id="stu-summary-title" className="text-14 font-semibold">
            Clearance progress
          </h2>
          <p className="text-40 font-normal leading-[1.1] tracking-[-0.01em] tabular-nums max-sm:text-32">
            {clearance.percentComplete}%
          </p>
          <ProgressBar clearance={clearance} />
          <p className="text-muted">
            {clearance.approvedCount} of {plural(clearance.totalOffices, 'office', 'offices')} cleared
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 m-0 mt-1 p-0 list-none text-13 text-muted" aria-label="Offices by status">
            <li className={COUNT}>
              <span className={statusDot('approved')} aria-hidden="true" />
              Cleared <strong className={COUNT_FIGURE}>{clearance.approvedCount}</strong>
            </li>
            <li className={COUNT}>
              <span className={statusDot('pending')} aria-hidden="true" />
              Pending <strong className={COUNT_FIGURE}>{clearance.pendingCount}</strong>
            </li>
            <li className={COUNT}>
              <span className={statusDot('action')} aria-hidden="true" />
              Needs action <strong className={COUNT_FIGURE}>{clearance.needsActionCount}</strong>
            </li>
          </ul>
        </div>
        <ClearanceSlip
          className={studentLayout.summarySlip}
          label="Your clearance slip"
          items={items.map((i) => ({
            officeCode: i.officeCode,
            officeName: i.officeName,
            icon: i.officeIcon,
            status: i.status,
            approvedAt: i.approvedAt,
            href: statusHref(i.officeCode),
          }))}
        />
      </section>

      <div className={cn(studentLayout.now, clearance.isEligible && 'grid-cols-1')}>
        {clearance.isEligible ? (
          <div className={cn(alert('success'), 'min-w-0 p-4')} role="status">
            <Icon name="check-circle" size={20} />
            <div className={alertBody}>
              <h2 className={FOCUS_TITLE}>You’re fully cleared</h2>
              <p>Every office has signed off. You are eligible to enroll next semester.</p>
              <p>
                <Link href="/clearance-status">See your clearance status</Link>
              </p>
            </div>
          </div>
        ) : focus ? (
          <section
            className={cn(panel(), CARD, FOCUS_TONE[focus.status === 'needs_action' ? 'action' : 'pending'])}
            aria-labelledby="stu-focus-title"
          >
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
              <OfficeIcon icon={focus.officeIcon} size={20} className="text-muted" />
              <h2 id="stu-focus-title" className={FOCUS_TITLE}>
                {focus.status === 'needs_action' ? 'Action needed' : 'Waiting on'}: {focus.officeName}
              </h2>
              <StatusPill status={focus.status} />
            </div>
            <p className="font-medium">{focus.task}</p>
            <p className="text-muted">{nextStepText(focus)}</p>
            <DueLine item={focus} serverNow={serverNow} />
            <EvidenceLine submission={focus.submission} />
            <ItemActions itemId={focus.itemId} size="md" />
            {remaining > 1 ? (
              <p className="text-12 text-muted">
                {plural(remaining - 1, 'other office', 'other offices')} still to clear.{' '}
                <Link href="/requirements">See all requirements</Link>
              </p>
            ) : null}
          </section>
        ) : null}

        {clearance.isEligible ? null : (
          <section className={cn(panel(), CARD)} aria-labelledby="stu-deadline-title">
            <h2 id="stu-deadline-title" className="flex items-center gap-2 text-14">
              <Icon name="clock" size={16} className="text-muted" />
              Next deadline
            </h2>
            {next ? (
              <>
                <p>
                  <strong>{next.officeName}</strong>
                  <span className="text-muted">: {next.task}</span>
                </p>
                <Countdown due={next.dueAt as string} serverNow={serverNow} label={`Time left for ${next.officeName}`} />
                <p className="text-12 text-muted">{dueLine(next.dueAt as string)}</p>
                {!next.dueOwn && next.dueNote ? (
                  <p className="text-12 pl-2.5 border-l-2 border-border text-muted">{next.dueNote}</p>
                ) : null}
              </>
            ) : overdue.length > 0 ? (
              <p className="text-muted">No upcoming deadline.</p>
            ) : (
              <p className="text-muted">None of your offices has set a deadline yet.</p>
            )}

            {overdue.length > 0 ? (
              <div className={cn(alert('error'), 'text-13')}>
                <Icon name="alert" size={16} />
                <div className={alertBody}>
                  <strong>
                    {overdue.length === 1 ? `${overdue[0].officeName} is past its deadline` : `${overdue.length} offices are past their deadline`}
                  </strong>
                  <span>
                    {overdue.length === 1
                      ? 'You can still finish it, so do it as soon as you can.'
                      : 'You can still finish them, so do them as soon as you can.'}
                  </span>
                </div>
              </div>
            ) : null}

            {later.length > 0 ? (
              <div className="flex flex-col gap-1.5 pt-2.5 border-t border-rule">
                <h3 className="text-12 text-muted font-medium">Coming up after that</h3>
                <ul className="flex flex-col gap-1 m-0 p-0 list-none text-13">
                  {later.map((i) => (
                    <li key={i.itemId} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                      <span>{i.officeName}</span>
                      <span className="text-muted whitespace-nowrap">{dueLine(i.dueAt as string)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        )}
      </div>

      <section className={section} aria-labelledby="stu-offices-title">
        <div className={sectionHead}>
          <div>
            <h2 id="stu-offices-title">Your offices</h2>
            <p className="text-muted">
              {remaining === 0 ? 'Every office has cleared you.' : `${plural(remaining, 'office', 'offices')} still to clear.`}
            </p>
          </div>
          <Link href="/requirements">View all requirements</Link>
        </div>
        <ul className={studentLayout.tiles}>
          {items.map((item) => (
            <li key={item.itemId} className={cn(studentLayout.tile, TILE_TONE[item.status])}>
              <div className={studentLayout.tileHead}>
                <span className={cn(studentLayout.tileIcon, TILE_ICON_TONE[item.status])}>
                  <OfficeIcon icon={item.officeIcon} size={18} />
                </span>
                <h3 className="flex-auto min-w-0 text-14 wrap-anywhere">
                  <Link className="text-text" href={statusHref(item.officeCode)}>
                    {item.officeName}
                  </Link>
                </h3>
                <StatusPill status={item.status} />
              </div>
              <p className="font-medium">{item.task}</p>
              {item.remarks ? <p className="text-12 text-muted">{item.remarks}</p> : null}
              <DueLine item={item} serverNow={serverNow} showNote={false} />
              <EvidenceLine submission={item.submission} />
              <ItemActions itemId={item.itemId} show={['upload', 'chat']} className="mt-auto pt-1" />
            </li>
          ))}
        </ul>
      </section>
    </StudentDialogs>
  );
}
