import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { checkOrigin } from '@/lib/request';
import { route } from '@/lib/result';
import { posInt } from '@/lib/input';

/**
 * POST /api/notifications/read
 * `{ id }` marks that notification read (only the caller's own); `{}` marks every unread one read.
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
  const id = body && typeof body === 'object' ? posInt((body as { id?: unknown }).id) : null;

  if (id) {
    await db.notification.updateMany({ where: { id, userId: user.id }, data: { isRead: true } });
  } else {
    await db.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
  }
  return null;
});
