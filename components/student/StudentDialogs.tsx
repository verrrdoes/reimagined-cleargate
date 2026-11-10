'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChatDialog } from '@/components/chat/ChatDialog';
import { useShell } from '@/components/shell/ShellContext';
import type { StudentItem } from '@/lib/services/student';
import { OfficeDetailsDialog } from './OfficeDetailsDialog';
import { UploadDialog } from './UploadDialog';

export type StudentDialogKind = 'upload' | 'chat' | 'details';

type StudentDialogsApi = {
  items: StudentItem[];
  serverNow: string;
  open: (kind: StudentDialogKind, itemId: number) => void;
};

const StudentDialogsContext = createContext<StudentDialogsApi | null>(null);

/** The item with that id and the function that opens its dialogs. Only inside <StudentDialogs>. */
export function useStudentItem(itemId: number) {
  const ctx = useContext(StudentDialogsContext);
  if (!ctx) throw new Error('useStudentItem() needs <StudentDialogs> above it.');
  return { item: ctx.items.find((i) => i.itemId === itemId) ?? null, open: ctx.open, serverNow: ctx.serverNow };
}

/**
 * Holds the student pages' three dialogs (upload evidence, office details, messages) once per page.
 * Buttons anywhere below open them for one item through `useStudentItem(itemId).open(kind, itemId)`.
 * After an upload or a conversation the page data is refreshed from the server.
 */
export function StudentDialogs({ items, serverNow, children }: { items: StudentItem[]; serverNow: string; children: ReactNode }) {
  const router = useRouter();
  const { refresh: refreshShell } = useShell();
  // The item id stays after a dialog closes, so the native <dialog> elements stay mounted and can close cleanly.
  const [state, setState] = useState<{ kind: StudentDialogKind | null; itemId: number | null }>({ kind: null, itemId: null });

  const open = useCallback((kind: StudentDialogKind, itemId: number) => setState({ kind, itemId }), []);
  const close = useCallback(() => setState((s) => ({ ...s, kind: null })), []);

  const refreshData = useCallback(() => {
    router.refresh();
    void refreshShell();
  }, [router, refreshShell]);

  const api = useMemo<StudentDialogsApi>(() => ({ items, serverNow, open }), [items, serverNow, open]);
  const item = state.itemId === null ? null : (items.find((i) => i.itemId === state.itemId) ?? null);

  return (
    <StudentDialogsContext value={api}>
      {children}
      {item ? (
        <>
          {/* Details comes first: when it hands over to another dialog, it closes before that one opens,
              so focus returns to the page button once the second dialog closes. */}
          <OfficeDetailsDialog
            item={item}
            serverNow={serverNow}
            open={state.kind === 'details'}
            onClose={close}
            onUpload={() => open('upload', item.itemId)}
            onMessage={() => open('chat', item.itemId)}
          />
          <UploadDialog
            item={item}
            open={state.kind === 'upload'}
            onClose={close}
            onUploaded={() => {
              close();
              refreshData();
            }}
          />
          <ChatDialog
            itemId={item.itemId}
            open={state.kind === 'chat'}
            onClose={() => {
              close();
              // Opening the conversation marked the office's replies read: update the counts and the badge.
              refreshData();
            }}
            title={`Message ${item.officeName}`}
            viewer="student"
          />
        </>
      ) : null}
    </StudentDialogsContext>
  );
}
