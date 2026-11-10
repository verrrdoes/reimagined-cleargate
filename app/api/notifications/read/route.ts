import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { checkOrigin } from '@/lib/request';
import { route } from '@/lib/result';
import { posInt } from '@/lib/input';

/**
 * POST /api/notifications/read
 * `{ id }` marks that notification read (only the caller's own); `{ upTo }` marks every one up to that id read (the
 * bell, when opened: what it showed, not anything that arrived since); `{}` marks every unread one read.
 */
export const POST = route(async (req: Request) => {
  checkOrigin(req);
  const user = await requireUser();

  let body: unknown = null;
  const text = await req.text();
  if (text.trim() !== '') {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  const fields = body && typeof body === 'object' ? (body as { id?: unknown; upTo?: unknown }) : {};
  const id = posInt(fields.id);
  const upTo = posInt(fields.upTo);

  if (id) {
    await db.notification.updateMany({ where: { id, userId: user.id }, data: { isRead: true } });
  } else if (upTo) {
    await db.notification.updateMany({ where: { userId: user.id, isRead: false, id: { lte: upTo } }, data: { isRead: true } });
  } else {
    await db.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
  }
  return null;
});
