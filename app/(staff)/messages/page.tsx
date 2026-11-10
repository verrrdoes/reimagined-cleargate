import type { Metadata } from 'next';
import Link from 'next/link';
import { pageUser } from '@/lib/auth/guards';
import { posInt } from '@/lib/input';
import { timeAgo } from '@/lib/time';
import { officeChoices, pickOffice } from '@/lib/services/review';
import { threadList } from '@/lib/services/messages';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/EmptyState';
import { countBadge, mono, pageHead, pageHeadActions, pageHeadSub } from '@/components/ui/recipes';
import { Chips, OfficeSelect, SearchNote } from '@/components/staff/ListControls';
import { NoOffice } from '@/components/staff/NoOffice';
import { hrefWith, matches, param, plural } from '@/components/staff/format';
import { ConversationPanel } from '@/components/chat/ConversationPanel';
import { RefreshOnUnread } from '@/components/chat/RefreshOnUnread';

export const metadata: Metadata = { title: 'Messages' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PATH = '/messages';

/** Phones show one region at a time: the list, or the open conversation. */
const INBOX =
  'grid grid-cols-[340px_minmax(0,1fr)] h-[max(480px,calc(100svh-200px))] border border-border rounded-card overflow-hidden ' +
  'max-lg:grid-cols-[280px_minmax(0,1fr)] ' +
  'max-sm:block max-sm:h-auto max-sm:border-0 max-sm:rounded-none max-sm:overflow-visible';
const INBOX_LIST =
  'flex flex-col gap-3 min-h-0 pt-3 border-r border-border overflow-y-auto ' +
  'max-sm:p-0 max-sm:border-r-0 max-sm:overflow-visible';
const INBOX_PANEL = 'flex flex-col min-w-0 min-h-0';
const THREAD =
  'flex items-start gap-2.5 min-h-[72px] p-3 border-t border-rule text-text no-underline ' +
  'hover:bg-raised hover:no-underline aria-[current=true]:bg-active ' +
  'focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 max-sm:px-0';
const THREAD_COUNT = cn(countBadge, 'flex-none self-center');

/** /messages: student conversations about this office's requirements (§8.6). ?item=N opens one. */
export default async function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await pageUser('staff');
  if (user.role === 'staff' && !user.staffProfile) return <NoOffice title="Messages" />;
  const sp = await searchParams;

  const choices = await officeChoices(user);
  const office = pickOffice(choices, param(sp.office));
  const q = param(sp.q).trim();
  const only = param(sp.only) === 'unread' ? 'unread' : '';
  const selected = posInt(param(sp.item));
  const params: Record<string, string> = { q, office: office ?? '', only };

  const rows = await threadList(user, office);
  const unreadThreads = rows.filter((r) => r.unread > 0).length;
  const shown = rows
    .filter((r) => (only === 'unread' ? r.unread > 0 : true))
    .filter((r) => matches(q, [r.studentName, r.studentNumber, r.officeName, r.task, r.lastBody]));

  const showOffice = user.role === 'admin';
  const officeLabel = showOffice ? (choices?.find((o) => o.code === office)?.name ?? 'All offices') : (user.staffProfile?.office.name ?? '');
  const now = new Date();
  const listHref = hrefWith(PATH, params, { item: null });

  return (
    <>
      <RefreshOnUnread />
      <div className={pageHead}>
        <h1>Messages</h1>
        <p className={pageHeadSub}>
          Questions from students about {showOffice && !office ? 'every office’s' : `${officeLabel}’s`} requirements ·{' '}
          {plural(rows.length, 'conversation', 'conversations')}
        </p>
        {choices ? (
          <div className={pageHeadActions}>
            <OfficeSelect choices={choices} value={office} path={PATH} params={params} />
          </div>
        ) : null}
      </div>

      <div className={INBOX} data-open={selected ? 'true' : undefined}>
        <div className={cn(INBOX_LIST, selected && 'max-sm:hidden')}>
          <Chips
            className="px-3 max-sm:px-0"
            label="Show"
            items={[
              { href: hrefWith(PATH, params, { only: null, item: selected }), label: 'All', count: rows.length, current: only === '' },
              { href: hrefWith(PATH, params, { only: 'unread', item: selected }), label: 'Unread', count: unreadThreads, current: only === 'unread' },
            ]}
          />
          <SearchNote className="mb-0 px-3 max-sm:px-0" q={q} path={PATH} params={{ ...params, ...(selected ? { item: String(selected) } : {}) }} />

          {shown.length === 0 ? (
            rows.length === 0 ? (
              <EmptyState
                icon="messages"
                title="No messages yet."
                body="Students can message your office from their clearance pages, and you can start one from Clearance Status or Review Item."
              />
            ) : (
              <EmptyState icon="search" title="No conversations match." body="Try another filter, or search for a student or a word from the message." />
            )
          ) : (
            <ul className="m-0 p-0 list-none" aria-label="Conversations">
              {shown.map((r) => {
                const current = r.itemId === selected;
                return (
                  <li key={r.itemId}>
                    <Link
                      href={hrefWith(PATH, params, { item: r.itemId })}
                      className={THREAD}
                      aria-current={current ? 'true' : undefined}
                      scroll={false}
                    >
                      <Avatar name={r.studentName} size={32} />
                      <span className="flex flex-col flex-auto min-w-0 gap-0.5">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={r.unread > 0 ? 'font-semibold truncate' : 'font-medium truncate'}>{r.studentName}</span>
                          <time className="flex-none text-12 text-muted" dateTime={r.lastAt}>
                            {timeAgo(r.lastAt, now)}
                          </time>
                        </span>
                        <span className="text-12 text-muted truncate">
                          <span className={mono}>{r.studentNumber}</span> · {showOffice ? `${r.officeName} · ` : ''}
                          {r.task}
                        </span>
                        <span className={r.unread > 0 ? 'text-13 text-text truncate' : 'text-13 text-muted truncate'}>
                          {r.lastFrom === 'office' ? 'You: ' : ''}
                          {r.lastBody}
                        </span>
                      </span>
                      {r.unread > 0 ? (
                        <span className={THREAD_COUNT}>
                          {r.unread}
                          <span className="sr-only"> unread</span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={cn(INBOX_PANEL, selected ? 'max-sm:h-[calc(100svh-180px)] max-sm:min-h-[420px]' : 'max-sm:hidden')}>
          {selected ? (
            <ConversationPanel key={selected} itemId={selected} backHref={listHref} />
          ) : (
            <EmptyState
              className="m-auto"
              icon="message"
              title="Choose a conversation"
              body="Pick a student on the left to read their messages and reply. Unread conversations are listed first."
            />
          )}
        </div>
      </div>
    </>
  );
}
