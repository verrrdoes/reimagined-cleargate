'use client';

import { Dialog } from '@/components/ui/Dialog';
import { ChatThread } from './ChatThread';
import { useConversation } from './useConversation';
import type { ChatViewer, ConversationItem } from './types';

/** Legacy empty-thread texts (§8.6). */
export function chatEmptyText(viewer: ChatViewer, item: Pick<ConversationItem, 'officeName' | 'studentName'> | null): string {
  if (viewer === 'student') {
    const office = item?.officeName ?? 'the office';
    return `No messages yet. Ask ${office} a question about this requirement. Staff reply here, and you’ll see it under the bell.`;
  }
  const student = item?.studentName ?? 'the student';
  return `No messages yet. Write to ${student}; they’ll get a notification under the bell.`;
}

/** "Message Library" for students; "Juan Dela Cruz · Library" for the office. */
export function chatTitle(viewer: ChatViewer, item: ConversationItem): string {
  return viewer === 'student' ? `Message ${item.officeName}` : `${item.studentName} · ${item.officeName}`;
}

/** The line under the title: the requirement (and the student number for the office). */
export function chatSubtitle(viewer: ChatViewer, item: ConversationItem): string {
  return viewer === 'student' ? item.task : `${item.studentNumber} · ${item.task}`;
}

/**
 * The per-requirement conversation in a dialog (§8.6). Loads when opened, polls GET /api/messages every
 * 10 s while open and the tab is visible, and sends with POST /api/messages.
 *
 * `<ChatDialog itemId={12} open={open} onClose={() => setOpen(false)} viewer="student" />`
 * `title` replaces the title derived from the thread.
 */
export function ChatDialog({
  itemId,
  open,
  onClose,
  title,
  viewer,
}: {
  itemId: number;
  open: boolean;
  onClose: () => void;
  title?: string;
  viewer: ChatViewer;
}) {
  const convo = useConversation(open ? itemId : null, viewer);
  const item = convo.data?.item ?? null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title ?? (item ? chatTitle(viewer, item) : 'Messages')}
      description={item ? chatSubtitle(viewer, item) : undefined}
      className="h-[min(640px,86svh)] max-sm:h-[92svh]"
      bodyClassName="flex flex-col overflow-hidden pb-4"
    >
      <ChatThread
        viewer={viewer}
        messages={convo.messages}
        loading={convo.loading}
        error={convo.error}
        sending={convo.sending}
        sendError={convo.sendError}
        emptyText={chatEmptyText(viewer, item)}
        onSend={convo.send}
        autoFocus
      />
    </Dialog>
  );
}
