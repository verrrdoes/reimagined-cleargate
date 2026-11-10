import 'server-only';
import { db, type Db } from '@/lib/db';
import { fail } from '@/lib/result';
import { staffOfficeId, type SessionUser } from '@/lib/auth/guards';
import { excerpt, notifyOffice, notifyUser } from '@/lib/services/notifications';
import { LIMITS } from '@/lib/constants';
import { Prisma, type Role } from '@/generated/prisma/client';
import type { ItemStatus } from '@/lib/types';
import type { ChatMessage, Conversation, ThreadRow } from '@/components/chat/types';

/* ---------- §8.6 one conversation ---------- */

const itemSelect = {
  id: true,
  status: true,
  task: true,
  officeId: true,
  office: { select: { code: true, name: true } },
  clearance: { select: { student: { select: { userId: true, firstName: true, lastName: true, studentNumber: true } } } },
} satisfies Prisma.ClearanceItemSelect;

type MessageItem = Prisma.ClearanceItemGetPayload<{ select: typeof itemSelect }>;

/** The item with its student and office, after the §8.6 access check (owning student, staff of the office, any admin). */
export async function loadItemForMessages(tx: Db, itemId: number, user: SessionUser): Promise<MessageItem> {
  const item = await tx.clearanceItem.findUnique({ where: { id: itemId }, select: itemSelect });
  if (!item) fail(404, 'not_found', 'That clearance item was not found.');
  const allowed =
    user.role === 'admin' ||
    (user.role === 'student' && item.clearance.student.userId === user.id) ||
    (user.role === 'staff' && user.staffProfile?.officeId === item.officeId);
  if (!allowed) fail(403, 'forbidden', 'You cannot see messages for this requirement.');
  return item;
}

type Sender = {
  email: string;
  role: Role;
  fullName: string | null;
  staffProfile: { fullName: string } | null;
  student: { firstName: string; lastName: string } | null;
} | null;

/** Staff full name → student "First Last" → users.full_name → "System Administrator" for admins → email. */
function senderName(sender: Sender, senderRole: Role): string {
  if (!sender) return senderRole === 'admin' ? 'System Administrator' : 'Deleted account';
  if (sender.staffProfile?.fullName) return sender.staffProfile.fullName;
  if (sender.student) return `${sender.student.firstName} ${sender.student.lastName}`;
  if (sender.fullName) return sender.fullName;
  if (senderRole === 'admin') return 'System Administrator';
  return sender.email;
}

/** Marks the other side's unread messages read, then returns the thread (oldest first). */
async function conversation(tx: Db, item: MessageItem, user: SessionUser): Promise<Conversation> {
  const marked = await tx.officeMessage.updateMany({
    where: { itemId: item.id, readAt: null, senderRole: user.role === 'student' ? { not: 'student' } : 'student' },
    data: { readAt: new Date() },
  });
  const rows = await tx.officeMessage.findMany({
    where: { itemId: item.id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      senderId: true,
      senderRole: true,
      body: true,
      createdAt: true,
      readAt: true,
      sender: {
        select: {
          email: true,
          role: true,
          fullName: true,
          staffProfile: { select: { fullName: true } },
          student: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  const student = item.clearance.student;
  const messages: ChatMessage[] = rows.map((m) => ({
    id: m.id,
    from: m.senderRole === 'student' ? 'student' : 'office',
    senderName: senderName(m.sender, m.senderRole),
    mine: m.senderId === user.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt ? m.readAt.toISOString() : null,
  }));
  return {
    item: {
      itemId: item.id,
      status: item.status,
      task: item.task,
      officeCode: item.office.code,
      officeName: item.office.name,
      studentName: `${student.firstName} ${student.lastName}`,
      studentNumber: student.studentNumber,
    },
    messages,
    markedRead: marked.count,
  };
}

/** GET /api/messages: opening a thread marks the other side's messages read. */
export async function openConversation(user: SessionUser, itemId: number): Promise<Conversation> {
  return db.$transaction(async (tx) => conversation(tx, await loadItemForMessages(tx, itemId, user), user));
}

/**
 * POST /api/messages: saves the message (20 a minute per sender) and notifies the other side.
 * Staff/admin → the student. Student → the office's active staff, replacing that thread's unread bell entry.
 */
export async function sendMessage(user: SessionUser, itemId: number, text: string): Promise<Conversation> {
  return db.$transaction(async (tx) => {
    const item = await loadItemForMessages(tx, itemId, user);

    const recent = await tx.officeMessage.count({
      where: { senderId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } },
    });
    if (recent >= LIMITS.messagesPerMinute) {
      fail(429, 'too_many_messages', 'You are sending messages too quickly. Wait a minute and try again.');
    }

    await tx.officeMessage.create({ data: { itemId: item.id, senderId: user.id, senderRole: user.role, body: text } });

    const student = item.clearance.student;
    if (user.role !== 'student') {
      await notifyUser(tx, student.userId, {
        itemId: item.id,
        tone: 'info',
        title: `${item.office.name} sent you a message`,
        body: excerpt(text),
      });
    } else {
      const link = `/messages?item=${item.id}`;
      await tx.notification.deleteMany({ where: { link, isRead: false } });
      await notifyOffice(tx, item.officeId, false, {
        itemId: item.id,
        tone: 'info',
        title: `${student.firstName} ${student.lastName} sent a message`,
        body: excerpt(text),
        link,
      });
    }

    return conversation(tx, item, user);
  });
}

/* ---------- §8.6 threads list ---------- */

type ThreadSql = {
  itemId: number;
  status: string;
  task: string;
  officeCode: string;
  officeName: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  program: string;
  yearLevel: number;
  total: number;
  unread: number;
  lastAt: Date;
  lastBody: string;
  lastRole: string;
};

/**
 * One row per item that has messages, office-filtered (staff: their office; admins: every office or ?office=),
 * unread threads first, then the latest; at most 300.
 */
export async function threadList(user: SessionUser, officeCode: string | null): Promise<ThreadRow[]> {
  const own = staffOfficeId(user);
  const officeFilter =
    own !== null ? Prisma.sql`ci.office_id = ${own}` : officeCode ? Prisma.sql`o.code = ${officeCode}` : Prisma.sql`TRUE`;

  const rows = await db.$queryRaw<ThreadSql[]>`
    SELECT ci.item_id            AS "itemId",
           ci.status::text       AS "status",
           ci.task               AS "task",
           o.code                AS "officeCode",
           o.name                AS "officeName",
           s.first_name          AS "firstName",
           s.last_name           AS "lastName",
           s.student_number      AS "studentNumber",
           p.code                AS "program",
           s.year_level::int     AS "yearLevel",
           agg.total             AS "total",
           agg.unread            AS "unread",
           agg.last_at           AS "lastAt",
           last.body             AS "lastBody",
           last.sender_role::text AS "lastRole"
      FROM (
            SELECT m.item_id,
                   COUNT(*)::int AS total,
                   (COUNT(*) FILTER (WHERE m.sender_role = 'student' AND m.read_at IS NULL))::int AS unread,
                   MAX(m.created_at) AS last_at
              FROM office_messages m
             GROUP BY m.item_id
           ) agg
      JOIN clearance_items ci ON ci.item_id = agg.item_id
      JOIN offices o          ON o.office_id = ci.office_id
      JOIN clearances c       ON c.clearance_id = ci.clearance_id
      JOIN students s         ON s.student_id = c.student_id
      JOIN programs p         ON p.program_id = s.program_id
      CROSS JOIN LATERAL (
            SELECT m2.body, m2.sender_role
              FROM office_messages m2
             WHERE m2.item_id = agg.item_id
             ORDER BY m2.created_at DESC, m2.message_id DESC
             LIMIT 1
           ) last
     WHERE ${officeFilter}
     ORDER BY (agg.unread > 0) DESC, agg.last_at DESC, ci.item_id DESC
     LIMIT ${LIMITS.threadsList}`;

  return rows.map((r) => ({
    itemId: Number(r.itemId),
    status: r.status as ItemStatus,
    task: r.task,
    officeCode: r.officeCode,
    officeName: r.officeName,
    studentName: `${r.firstName} ${r.lastName}`,
    studentNumber: r.studentNumber,
    program: r.program,
    yearLevel: Number(r.yearLevel),
    total: Number(r.total),
    unread: Number(r.unread),
    lastAt: new Date(r.lastAt).toISOString(),
    lastBody: r.lastBody,
    lastFrom: r.lastRole === 'student' ? 'student' : 'office',
  }));
}
