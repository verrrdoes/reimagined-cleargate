import type { Metadata } from 'next';
import Link from 'next/link';
import { pageUser } from '@/lib/auth/guards';
import { daysSince, deadlineState, waitedText } from '@/lib/officeOverview';
import { officeOverview, type OfficeOverview } from '@/lib/services/officeOverview';
import { officeChoices } from '@/lib/services/review';
import { formatDateTime, formatTime, formatWeekdayDate } from '@/lib/time';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { button, mono, pageHead, pageHeadActions, pageHeadSub, panel } from '@/components/ui/recipes';
import { NoOffice } from '@/components/staff/NoOffice';
import { UrlSelect } from '@/components/staff/UrlSelect';
import { param } from '@/components/staff/format';

export const metadata: Metadata = { title: 'Dashboard' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PATH = '/overview';
/** Rows per list before "View all". */
const LIST_MAX = 5;
const THREADS_MAX = 3;
/** An upload waiting this many days or more is shown in red. */
const LATE_DAYS = 7;

const h2 = 'text-16 font-semibold leading-[1.4]';
const subHead = 'flex items-baseline justify-between gap-3 mb-1 text-13 font-semibold text-muted';
const list = 'list-none m-0 p-0';
const listRow = 'grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 border-t border-rule first:border-t-0';
const textLink = 'text-accent font-medium hover:underline';
const quiet = 'py-2.5 text-muted';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Person({ name, number, sub }: { name: string; number?: string; sub?: string }) {
  return (
    <span className="min-w-0">
      <span className="block font-medium text-text truncate">{name}</span>
      <span className="block text-12 text-muted truncate">
        {number ? <span className={mono}>{number}</span> : null}
        {number && sub ? ' · ' : ''}
        {sub}
      </span>
    </span>
  );
}

function ViewAll({ href, shown, total }: { href: string; shown: number; total: number }) {
  if (total <= shown) return null;
  return (
    <p className="pt-2 text-13">
      <Link href={href} className={textLink}>
        View all {total}
      </Link>
    </p>
  );
}

/** /overview: the staff Dashboard. Where the office's students stand this term, and whose move it is. */
export default async function StaffDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await pageUser('staff');
  if (user.role === 'staff' && !user.staffProfile) return <NoOffice title="Dashboard" />;

  // Staff see their own office. Admins pick one (the first by default): every figure here belongs to one office.
  const choices = await officeChoices(user);
  const sp = await searchParams;
  const picked = choices ? (choices.find((o) => o.code === param(sp.office)) ?? choices[0] ?? null) : null;
  const which = user.staffProfile ? { id: user.staffProfile.officeId } : picked ? { code: picked.code } : null;

  const now = new Date();
  const data = which ? await officeOverview(which, now) : null;

  if (!data) {
    return (
      <>
        <div className={pageHead}>
          <h1>Dashboard</h1>
        </div>
        <EmptyState icon="clock" title="No term is open." body="The dashboard fills in once the Registrar opens a term." />
      </>
    );
  }

  /** Admins keep their office choice on every link. */
  const q = (path: string, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ ...(choices ? { office: data.office.code } : {}), ...extra });
    const s = p.toString();
    return s ? `${path}?${s}` : path;
  };

  return (
    <>
      <div className={pageHead}>
        <h1>Dashboard</h1>
        <p className={pageHeadSub}>
          {data.office.name} · {data.termLabel}
        </p>
        <div className={pageHeadActions}>
          {choices ? (
            <div className="w-[200px] max-sm:w-full">
              <UrlSelect
              name="office"
              label="Office"
              value={data.office.code}
              path={PATH}
              params={{}}
              options={choices.map((o) => ({ value: o.code, label: o.name }))}
              />
            </div>
          ) : null}
          <Link href={q('/office-status')} className={button()}>
            Clearance status
          </Link>
          {data.uploads.length > 0 ? (
            <Link href={`/review/${data.uploads[0].submissionId}`} className={button({ variant: 'primary' })}>
              <Icon name="inbox" />
              Review oldest upload
            </Link>
          ) : null}
        </div>
      </div>

      <Standing data={data} now={now} q={q} />

      <div className="mt-6 grid grid-cols-2 max-lg:grid-cols-1 gap-6">
        <WaitingPanel data={data} now={now} q={q} />
        <NotClearedPanel data={data} now={now} q={q} />
      </div>

      <div className="mt-6 grid grid-cols-2 max-lg:grid-cols-1 gap-6">
        <ActivityPanel data={data} now={now} />
        <OfficePanel data={data} now={now} q={q} />
      </div>
    </>
  );
}

type Props = { data: OfficeOverview; now: Date; q: (path: string, extra?: Record<string, string>) => string };

const when = (at: string, now: Date) => (daysSince(new Date(at), now) === 0 ? `Today, ${formatTime(at)}` : formatDateTime(at));

/** The one sentence that says what matters most right now. */
function finding({ data, now }: Pick<Props, 'data' | 'now'>): string {
  const { counts, uploads } = data;
  if (uploads.length > 0) {
    const oldest = uploads[0];
    const days = daysSince(new Date(oldest.submittedAt), now);
    const lead = uploads.length === 1 ? '1 upload is waiting for you.' : `${uploads.length} uploads are waiting for you.`;
    const age = days === 0 ? 'came in today' : `has waited ${waitedText(days)}`;
    return uploads.length === 1 ? `${lead} It's from ${oldest.name} and ${age}.` : `${lead} The oldest, from ${oldest.name}, ${age}.`;
  }
  if (counts.total === 0) return 'No students have a clearance with your office this term yet.';
  if (counts.notCleared === 0) return 'Every student is cleared. Nothing is waiting for you.';
  return `Nothing to review right now. ${count(counts.notCleared, 'student is', 'students are')} not cleared yet.`;
}

function Standing({ data, now, q }: Props) {
  const { counts } = data;
  const pct = (n: number) => `${(100 * n) / Math.max(1, counts.total)}%`;
  const segments = [
    { key: 'waiting', label: 'Waiting for you', n: counts.waiting, dot: 'bg-accent', meaning: 'Uploads to review', href: q('/staff', { sort: 'oldest' }), action: 'Review them' },
    { key: 'unreviewed', label: 'Not reviewed yet', n: counts.unreviewed, dot: 'bg-[#b9bfc8]', meaning: 'Pending, no upload', href: q('/office-status', { status: 'pending' }), action: 'Approve on Clearance status' },
    { key: 'student', label: 'With the student', n: counts.student, dot: 'bg-action-line', meaning: 'Marked Needs action', href: q('/office-status', { status: 'needs_action' }), action: 'See who' },
    { key: 'cleared', label: 'Cleared', n: counts.cleared, dot: 'bg-positive', meaning: 'Nothing more to do', href: q('/office-status', { status: 'approved' }), action: 'See who' },
  ];
  const due = data.deadline ? deadlineState(new Date(data.deadline.dueAt), now) : null;

  return (
    <section className={cn(panel(), 'p-0 grid grid-cols-[minmax(0,1fr)_300px] max-lg:grid-cols-1')} aria-labelledby="standing">
      <div className="p-5 min-w-0">
        <h2 id="standing" className={h2}>
          Where your {count(counts.total, 'student stands', 'students stand')}
        </h2>
        <p className="mt-1 text-muted">{finding({ data, now })}</p>

        <p className="mt-4 flex items-baseline gap-2">
          <span className="text-32 leading-none tabular-nums">{counts.cleared}</span>
          <span className="text-16 text-muted">of {counts.total} cleared</span>
        </p>

        {counts.total > 0 ? (
          <div
            className="mt-3 flex h-3 gap-[2px] rounded-full overflow-hidden bg-rule"
            role="img"
            aria-label={segments.map((s) => `${s.label} ${s.n}`).join(', ')}
          >
            {segments.map((s) => (s.n > 0 ? <span key={s.key} className={s.dot} style={{ width: pct(s.n) }} /> : null))}
          </div>
        ) : null}

        <dl className="mt-4 grid grid-cols-4 max-md:grid-cols-2 gap-x-4 gap-y-4">
          {segments.map((s, i) => (
            <div key={s.key} className={cn('min-w-0 flex flex-col gap-0.5', i > 0 && 'md:border-l md:border-border md:pl-4')}>
              <dt className="flex items-center gap-2 text-14 font-semibold">
                <span className={cn('size-2 rounded-full flex-none', s.dot)} aria-hidden="true" />
                {s.label}
              </dt>
              <dd className="text-22 leading-tight tabular-nums">{s.n}</dd>
              <dd className="text-12 text-muted">{s.meaning}</dd>
              {s.n > 0 ? (
                <dd className="mt-1 text-13">
                  <Link href={s.href} className={textLink}>
                    {s.action}
                  </Link>
                </dd>
              ) : null}
            </div>
          ))}
        </dl>
      </div>

      <aside
        className="p-5 bg-raised rounded-r-card border-l border-border max-lg:border-l-0 max-lg:border-t max-lg:rounded-r-none max-lg:rounded-b-card flex flex-col gap-2"
        aria-labelledby="deadline"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="deadline" className={h2}>
            Deadline
          </h2>
          {due ? <Pill tone={due.passed ? 'overdue' : 'info'}>{due.passed ? 'Passed' : 'Coming up'}</Pill> : null}
        </div>
        {data.deadline && due ? (
          <>
            <p className="text-22 leading-tight">{formatWeekdayDate(data.deadline.dueAt)}</p>
            <p className="text-muted">
              {formatTime(data.deadline.dueAt)} · {due.text}
            </p>
            {counts.notCleared > 0 ? (
              <p className="text-14">
                <strong className="font-semibold tabular-nums">{counts.notCleared}</strong>{' '}
                {counts.notCleared === 1 ? 'student is' : 'students are'} still not cleared.
              </p>
            ) : (
              <p className="text-14">Every student is cleared.</p>
            )}
            {data.deadline.note ? <p className="text-12 text-muted">“{data.deadline.note}”</p> : null}
          </>
        ) : (
          <p className="text-muted">Your office has no deadline this term. Students see no due date for it.</p>
        )}
        <div className="mt-auto pt-2 flex flex-wrap gap-2">
          <Link href={q('/deadlines')} className={button({ size: 'sm' })}>
            {data.deadline ? 'Change the deadline' : 'Set a deadline'}
          </Link>
          {counts.notCleared > 0 ? (
            <Link href={q('/deadlines')} className={button({ size: 'sm', variant: 'ghost' })}>
              Remind {counts.notCleared === 1 ? 'the student' : `all ${counts.notCleared}`}
            </Link>
          ) : null}
        </div>
      </aside>
    </section>
  );
}

function WaitingPanel({ data, now, q }: Props) {
  const uploads = data.uploads.slice(0, LIST_MAX);
  const threads = data.threads.slice(0, THREADS_MAX);
  return (
    <section className={cn(panel(), 'p-5')} aria-labelledby="waiting">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 id="waiting" className={h2}>
          Waiting for you
        </h2>
        <Link href={q('/staff')} className={cn(textLink, 'text-13 whitespace-nowrap')}>
          Pending list
        </Link>
      </div>

      <p className={subHead}>
        <span>Uploads to review · {data.uploads.length}</span>
        {uploads.length > 0 ? <span className="font-normal">Waited</span> : null}
      </p>
      {uploads.length === 0 ? (
        <p className={quiet}>Nothing to review right now.</p>
      ) : (
        <ul className={list}>
          {uploads.map((u) => {
            const days = daysSince(new Date(u.submittedAt), now);
            return (
              <li key={u.submissionId} className={listRow}>
                <Avatar name={u.name} size={28} />
                <Person name={u.name} number={u.number} sub={u.resubmitted ? `${u.file} · sent again` : u.file} />
                <span className="flex items-center gap-3">
                  <span className={cn('tabular-nums text-right w-[56px]', days >= LATE_DAYS ? 'text-negative font-medium' : 'text-muted')}>
                    {waitedText(days)}
                  </span>
                  <Link href={`/review/${u.submissionId}`} className={button({ size: 'sm' })}>
                    Review<span className="sr-only"> {u.name}</span>
                  </Link>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <ViewAll href={q('/staff', { sort: 'oldest' })} shown={uploads.length} total={data.uploads.length} />

      <p className={cn(subHead, 'mt-4')}>
        <span>Unread messages · {data.unreadMessages}</span>
      </p>
      {threads.length === 0 ? (
        <p className={quiet}>No unread messages.</p>
      ) : (
        <ul className={list}>
          {threads.map((t) => (
            <li key={t.itemId} className={listRow}>
              <Avatar name={t.name} size={28} />
              <Person
                name={t.name}
                number={t.number}
                sub={`${t.unread > 1 ? `${t.unread} unread · ` : ''}${daysSince(new Date(t.lastAt), now) === 0 ? `Sent today, ${formatTime(t.lastAt)}` : `Sent ${formatDateTime(t.lastAt)}`}`}
              />
              <Link href={q('/messages', { item: String(t.itemId) })} className={button({ size: 'sm' })}>
                Open<span className="sr-only"> {t.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ViewAll href={q('/messages', { only: 'unread' })} shown={threads.length} total={data.threads.length} />
    </section>
  );
}

function NotClearedPanel({ data, now, q }: Props) {
  const { counts } = data;
  const owed = data.owed.slice(0, LIST_MAX);
  const more = counts.unreviewed - data.unreviewedNames.length;
  return (
    <section className={cn(panel(), 'p-5')} aria-labelledby="not-cleared">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 id="not-cleared" className={h2}>
          Not cleared yet · <span className="tabular-nums">{counts.notCleared}</span>
        </h2>
        <Link href={q('/office-status')} className={cn(textLink, 'text-13 whitespace-nowrap')}>
          Clearance status
        </Link>
      </div>

      {counts.notCleared === 0 ? (
        <p className={quiet}>{counts.total === 0 ? 'No students yet.' : 'Every student is cleared.'}</p>
      ) : (
        <>
          <p className={subHead}>
            <span>With the student · {counts.student}</span>
            {owed.length > 0 ? <span className="font-normal">Since</span> : null}
          </p>
          {owed.length === 0 ? (
            <p className={quiet}>No one is marked Needs action.</p>
          ) : (
            <ul className={list}>
              {owed.map((s) => (
                <li key={s.itemId} className={listRow}>
                  <Avatar name={s.name} size={28} />
                  <Person name={s.name} number={s.number} sub={s.remarks} />
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums text-right w-[56px] text-muted">{waitedText(daysSince(new Date(s.since), now))}</span>
                    <Link href={q('/messages', { item: String(s.itemId) })} className={button({ size: 'sm' })}>
                      Message<span className="sr-only"> {s.name}</span>
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ViewAll href={q('/office-status', { status: 'needs_action' })} shown={owed.length} total={counts.student} />

          {counts.unreviewed > 0 ? (
            <>
              <p className={cn(subHead, 'mt-4')}>
                <span>Not reviewed yet · {counts.unreviewed}</span>
              </p>
              <div className="py-2.5 flex flex-col gap-3">
                <p className="text-14">
                  {data.unreviewedNames.join(', ')}
                  {more > 0 ? ` and ${more} more` : ''} {counts.unreviewed === 1 ? 'has' : 'have'} no upload, and no one has reviewed{' '}
                  them yet. If they owe nothing, clear them together.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href={q('/office-status', { status: 'pending' })} className={button({ size: 'sm' })}>
                    <Icon name="check" />
                    Approve selected…
                  </Link>
                  <Link href={q('/deadlines')} className={button({ size: 'sm', variant: 'ghost' })}>
                    Send a reminder
                  </Link>
                </div>
              </div>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

function ActivityPanel({ data, now }: Pick<Props, 'data' | 'now'>) {
  return (
    <section className={cn(panel(), 'p-5')} aria-labelledby="activity">
      <h2 id="activity" className={cn(h2, 'mb-2')}>
        Recent activity
      </h2>
      {data.activity.length === 0 ? (
        <p className={quiet}>Nothing has happened this term yet.</p>
      ) : (
        <ul className={list}>
          {data.activity.map((a, i) => (
            <li key={`${a.at}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] max-sm:grid-cols-1 gap-x-4 py-2 border-t border-rule first:border-t-0">
              <span className="min-w-0 truncate max-sm:whitespace-normal">
                <span className="font-medium">{a.who}</span> <span className="text-muted">{a.what}</span>
              </span>
              <time dateTime={a.at} className="text-12 text-muted tabular-nums whitespace-nowrap">
                {when(a.at, now)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OfficePanel({ data, now, q }: Props) {
  const onOff = (on: boolean) => (on ? 'On' : 'Off');
  return (
    <section className={cn(panel(), 'p-5')} aria-labelledby="office">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 id="office" className={h2}>
          Your office
        </h2>
        <Link href={q('/deadlines')} className={cn(textLink, 'text-13 whitespace-nowrap')}>
          Deadlines and reminders
        </Link>
      </div>
      {data.staff.length > 0 ? (
        <ul className={list}>
          {data.staff.map((s) => (
            <li key={s.name} className={cn(listRow, 'py-2')}>
              <Avatar name={s.name} size={28} />
              <Person name={s.name} sub={s.position ?? undefined} />
              <span className="text-12 text-muted whitespace-nowrap">
                {!s.active ? 'Account turned off' : s.lastLoginAt ? `Signed in ${when(s.lastLoginAt, now).replace(/^Today/, 'today')}` : 'Never signed in'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-14 pt-3 border-t border-rule">
        <dt className="text-muted whitespace-nowrap">Last reminder</dt>
        <dd className="text-right tabular-nums">
          {data.lastReminder
            ? `${formatWeekdayDate(data.lastReminder.sentAt)}${data.lastReminder.recipients !== null ? ` · ${count(data.lastReminder.recipients, 'student', 'students')}` : ''}`
            : 'None sent yet'}
        </dd>
        {data.nextReminder ? (
          <>
            <dt className="text-muted whitespace-nowrap">Next reminder</dt>
            <dd className="text-right tabular-nums">{formatDateTime(data.nextReminder.sendAt)}</dd>
          </>
        ) : null}
        <dt className="text-muted whitespace-nowrap">Auto-clear</dt>
        <dd className="text-right">{onOff(data.office.autoClear)}</dd>
        <dt className="text-muted whitespace-nowrap">Morning email</dt>
        <dd className="text-right">{onOff(data.office.dailyDigest)}</dd>
      </dl>
    </section>
  );
}
