// Shapes for office messages (§8.6), shared by lib/services/messages.ts, GET/POST /api/messages and the chat UI.
import type { ItemStatus } from '@/lib/types';

export type ChatViewer = 'student' | 'office';

export type ChatMessage = {
  id: number;
  /** Staff and admins both show as "office". */
  from: 'student' | 'office';
  senderName: string;
  /** Sent by the signed-in account. */
  mine: boolean;
  body: string;
  createdAt: string;
  /** When the other side opened it; null while unread. */
  readAt: string | null;
};

export type ConversationItem = {
  itemId: number;
  status: ItemStatus;
  task: string;
  officeCode: string;
  officeName: string;
  studentName: string;
  studentNumber: string;
};

/** GET/POST /api/messages data: the item header and its messages, oldest first. */
export type Conversation = {
  item: ConversationItem;
  messages: ChatMessage[];
  /** How many of the other side's messages this request marked read (the sidebar badge needs a refresh when > 0). */
  markedRead: number;
};

/** One row of the staff Messages list. */
export type ThreadRow = {
  itemId: number;
  status: ItemStatus;
  task: string;
  officeCode: string;
  officeName: string;
  studentName: string;
  studentNumber: string;
  program: string;
  yearLevel: number;
  total: number;
  /** Student messages the office has not opened. */
  unread: number;
  lastAt: string;
  lastBody: string;
  lastFrom: 'student' | 'office';
};
