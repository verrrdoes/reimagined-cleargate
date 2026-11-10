'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { StatusPill } from '@/components/ui/Pill';
import { backLink } from '@/components/ui/recipes';
import { ChatThread } from './ChatThread';
import { chatEmptyText, chatSubtitle, chatTitle } from './ChatDialog';
import { useConversation } from './useConversation';

/**
 * The open conversation on the staff Messages page. Polls like the dialog; when it marks messages read
 * or sends one, the page refreshes so the thread list's unread counts and previews follow.
 */
export function ConversationPanel({ itemId, backHref }: { itemId: number; backHref: string }) {
  const router = useRouter();
  const convo = useConversation(itemId, 'office', () => router.refresh());
  const item = convo.data?.item ?? null;

  return (
    <section className="flex flex-col flex-auto min-h-0 p-4 max-sm:p-0" aria-labelledby="convo-title">
      <div className="pb-3 mb-1 border-b border-rule">
        <Link href={backHref} className={cn(backLink, 'hidden max-sm:inline-flex')} scroll={false}>
          <Icon name="arrow-left" size={16} />
          Conversations
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="convo-title" className="text-16 font-semibold wrap-anywhere">
              {item ? chatTitle('office', item) : 'Conversation'}
            </h2>
            {item ? <p className="text-muted text-13 wrap-anywhere">{chatSubtitle('office', item)}</p> : null}
          </div>
          {item ? <StatusPill status={item.status} /> : null}
        </div>
      </div>
      <ChatThread
        className="flex-auto min-h-0 pt-3"
        viewer="office"
        messages={convo.messages}
        loading={convo.loading}
        error={convo.error}
        sending={convo.sending}
        sendError={convo.sendError}
        emptyText={chatEmptyText('office', item)}
        onSend={convo.send}
      />
    </section>
  );
}
