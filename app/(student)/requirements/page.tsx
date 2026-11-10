import type { Metadata } from 'next';
import Link from 'next/link';
import { pageUser } from '@/lib/auth/guards';
import { getStudentClearance, type StudentItem } from '@/lib/services/student';
import { EmptyState, Icon, OfficeIcon, StatusPill } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import {
  alert,
  alertBody,
  button,
  pageHead,
  pageHeadActions,
  pageHeadSub,
  panel,
  panelHead,
  panelSub,
  pill,
  split,
  textTone,
} from '@/components/ui/recipes';
import { formatDate } from '@/lib/time';
import { DueLine } from '@/components/student/DueLine';
import { EvidenceLine } from '@/components/student/EvidenceLine';
import { ItemActions } from '@/components/student/ItemActions';
import { NoClearance } from '@/components/student/NoClearance';
import { ProgressBar } from '@/components/student/ProgressBar';
import { StudentDialogs } from '@/components/student/StudentDialogs';
import { matchesQuery, nextStepText, plural, statusHref, studentLine } from '@/components/student/format';
import { statusDot, studentLayout } from '@/components/student/layout';

export const metadata: Metadata = { title: 'My requirements' };

const MARK_TONE: Record<StudentItem['status'], string> = {
  approved: 'border-0 bg-positive text-on-accent',
  needs_action: 'border-solid border-action-line text-action-line',
  pending: '',
};

const CHECK_TASK = 'text-15 font-semibold wrap-anywhere';
const COUNT_ROW = 'flex items-center justify-between gap-3 py-2 border-t border-rule';
const COUNT_LABEL = 'inline-flex items-center gap-2 text-muted';
const COUNT_FIGURE = 'font-semibold tabular-nums';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function CheckMark({ status }: { status: StudentItem['status'] }) {
  if (status === 'approved') {
    return (
      <span className={cn(studentLayout.checkMark, MARK_TONE[status])} aria-hidden="true">
        <Icon name="check" size={14} strokeWidth={2.5} />
      </span>
    );
  }
  if (status === 'needs_action') {
    return (
      <span className={cn(studentLayout.checkMark, MARK_TONE[status])} aria-hidden="true">
        !
      </span>
    );
  }
  return <span className={cn(studentLayout.checkMark, MARK_TONE[status])} aria-hidden="true" />;
}

/** My requirements (§8.4): every item as a checklist, searchable with `?q=`, and a completion snapshot. */
export default async function RequirementsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await pageUser('student');
  const { student, clearance, items, serverNow } = await getStudentClearance(user);
  const params = await searchParams;
  const rawQ = Array.isArray(params.q) ? params.q[0] : params.q;
  const q = (rawQ ?? '').trim().slice(0, 100);

  if (!clearance) {
    return (
      <>
        <header className={pageHead}>
          <h1>My requirements</h1>
          <p className={pageHeadSub}>{studentLine(student, null)}</p>
        </header>
        <NoClearance />
      </>
    );
  }

  const shown = q ? items.filter((i) => matchesQuery(i, q)) : items;
  const remaining = items.filter((i) => i.status !== 'approved').length;

  return (
    <StudentDialogs items={items} serverNow={serverNow}>
      <header className={pageHead}>
        <h1>My requirements</h1>
        <p className={pageHeadSub}>{studentLine(student, clearance)}</p>
        <div className={pageHeadActions}>
          <span className={pill(remaining === 0 ? 'approved' : 'pending')}>
            {remaining === 0 ? 'All tasks done' : `${plural(remaining, 'task', 'tasks')} remaining`}
          </span>
        </div>
      </header>

      <div className={split}>
        <section className={panel()} aria-labelledby="stu-req-title">
          <div className={panelHead}>
            <div>
              <h2 id="stu-req-title">Requirements to complete</h2>
              <p className={panelSub}>Outstanding items first, then the offices that have cleared you.</p>
            </div>
          </div>

          {q ? (
            <div className={cn(alert(), 'mb-3')} role="status">
              <Icon name="search" size={16} />
              <div className={alertBody}>
                <span>
                  Showing results for “{q}”.{' '}
                  <Link href="/requirements" replace>
                    Clear search
                  </Link>
                </span>
              </div>
            </div>
          ) : null}

          {shown.length === 0 ? (
            <EmptyState
              icon="search"
              title={`No requirements match “${q}”.`}
              body="Try an office name, a task or a status such as Pending."
              action={
                <Link className={button()} href="/requirements" replace>
                  Show all
                </Link>
              }
            />
          ) : (
            <ol className={studentLayout.checklist}>
              {shown.map((item) => (
                <li key={item.itemId} className={studentLayout.check}>
                  <CheckMark status={item.status} />
                  <div className={studentLayout.checkBody}>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1.5 text-13 font-medium text-muted">
                        <OfficeIcon icon={item.officeIcon} size={16} />
                        <Link className="text-inherit hover:text-text" href={statusHref(item.officeCode)}>
                          {item.officeName}
                        </Link>
                      </span>
                      <StatusPill status={item.status} />
                    </div>
                    <h3 className={cn(CHECK_TASK, item.status === 'approved' && 'text-muted font-medium')}>
                      {item.task}
                    </h3>
                    {item.remarks ? <p className="text-muted">{item.remarks}</p> : null}
                    {item.status === 'approved' ? (
                      <p className={cn('text-12', textTone.approved)}>
                        Cleared{item.approvedAt ? ` ${formatDate(item.approvedAt)}` : ''}
                      </p>
                    ) : (
                      <p className="flex items-start gap-1.5">
                        <Icon name="arrow" size={14} className="mt-[3px] text-muted" />
                        <span>
                          <span className="sr-only">Next step: </span>
                          {nextStepText(item)}
                        </span>
                      </p>
                    )}
                    <DueLine item={item} serverNow={serverNow} />
                    <EvidenceLine submission={item.submission} />
                    <ItemActions itemId={item.itemId} className="mt-1" />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="flex flex-col gap-4" aria-label="Completion snapshot">
          <section className={cn(panel(), 'flex flex-col gap-2.5')} aria-labelledby="stu-snapshot-title">
            <h2 id="stu-snapshot-title">Completion snapshot</h2>
            <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="text-28 leading-[1.2] tabular-nums">{clearance.percentComplete}%</span>
              <span className="text-muted text-12">
                {clearance.approvedCount} of {plural(clearance.totalOffices, 'office', 'offices')} cleared
              </span>
            </p>
            <ProgressBar clearance={clearance} />
            <dl className="flex flex-col m-0">
              <div className={COUNT_ROW}>
                <dt className={COUNT_LABEL}>
                  <span className={statusDot('approved')} aria-hidden="true" />
                  Cleared
                </dt>
                <dd className={COUNT_FIGURE}>{clearance.approvedCount}</dd>
              </div>
              <div className={COUNT_ROW}>
                <dt className={COUNT_LABEL}>
                  <span className={statusDot('pending')} aria-hidden="true" />
                  Pending
                </dt>
                <dd className={COUNT_FIGURE}>{clearance.pendingCount}</dd>
              </div>
              <div className={COUNT_ROW}>
                <dt className={COUNT_LABEL}>
                  <span className={statusDot('action')} aria-hidden="true" />
                  Needs action
                </dt>
                <dd className={COUNT_FIGURE}>{clearance.needsActionCount}</dd>
              </div>
            </dl>
          </section>

          <section
            className={cn(panel({ raised: true }), 'flex flex-col gap-1.5', clearance.isEligible && 'bg-pill-approved-bg')}
            aria-labelledby="stu-eligibility-title"
          >
            <h2
              id="stu-eligibility-title"
              className={cn('flex items-center gap-2 text-14', clearance.isEligible && 'text-pill-approved-fg')}
            >
              <Icon
                name={clearance.isEligible ? 'check-circle' : 'cap'}
                size={18}
                className={clearance.isEligible ? 'text-pill-approved-fg' : 'text-muted'}
              />
              {clearance.isEligible ? 'Eligible to enroll' : 'Future eligibility'}
            </h2>
            <p className="text-muted">
              {clearance.isEligible
                ? 'You’re fully cleared and can enroll next semester.'
                : 'Once fully cleared, you can enroll next semester.'}
            </p>
            <Link href="/clearance-status">See clearance status</Link>
          </section>
        </aside>
      </div>
    </StudentDialogs>
  );
}
