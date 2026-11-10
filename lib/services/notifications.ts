import 'server-only';
import { db, type Db } from '@/lib/db';
import { cut } from '@/lib/input';
import { LIMITS } from '@/lib/constants';
import type { NotificationTone } from '@/generated/prisma/client';
import type { NotificationView } from '@/lib/types';

export type NewNotification = {
  itemId?: number | null;
  tone: NotificationTone;
  title: string;
  body: string;
  link?: string | null;
};

const row = (userId: number, n: NewNotification) => ({
  userId,
  itemId: n.itemId ?? null,
  tone: n.tone,
  title: cut(n.title, 120),
  body: cut(n.body, 255),
  link: n.link ?? null,
});

export async function notifyUser(tx: Db, userId: number, n: NewNotification) {
  await tx.notification.create({ data: row(userId, n) });
}

/** Active staff of one office, plus every active admin when `includeAdmins`. Returns how many were notified. */
export async function notifyOffice(tx: Db, officeId: number, includeAdmins: boolean, n: NewNotification): Promise<number> {
  const staff = await tx.officeStaff.findMany({ where: { officeId, user: { isActive: true } }, select: { userId: true } });
  const ids = new Set(staff.map((s) => s.userId));
  if (includeAdmins) {
    for (const a of await tx.user.findMany({ where: { role: 'admin', isActive: true }, select: { id: true } })) ids.add(a.id);
  }
  if (!ids.size) return 0;
  await tx.notification.createMany({ data: [...ids].map((id) => row(id, n)) });
  return ids.size;
}

export async function notifyAdmins(tx: Db, n: NewNotification): Promise<number> {
  const admins = await tx.user.findMany({ where: { role: 'admin', isActive: true }, select: { id: true } });
  if (!admins.length) return 0;
  await tx.notification.createMany({ data: admins.map((a) => row(a.id, n)) });
  return admins.length;
}

/** Message excerpt for the bell: over 120 characters becomes the first 117 plus "...". */
export function excerpt(body: string): string {
  const chars = Array.from(body);
  return chars.length > 120 ? chars.slice(0, 117).join('') + '...' : body;
}

/** The latest 30 notifications for the bell. */
export async function notificationList(userId: number): Promise<NotificationView[]> {
  const rows = await db.notification.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: LIMITS.notificationsShown,
    include: { item: { select: { office: { select: { icon: true } } } } },
  });
  return rows.map((n) => ({
    id: n.id,
    tone: n.tone,
    title: n.title,
    body: n.body,
    link: n.link && n.link.startsWith('/') && !n.link.startsWith('//') ? n.link : null,
    officeIcon: n.item?.office.icon ?? null,
    unread: !n.isRead,
    createdAt: n.createdAt.toISOString(),
  }));
}
