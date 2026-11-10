import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { ApiError, fail, route } from '@/lib/result';
import { posInt } from '@/lib/input';
import { fileResponse } from '@/lib/files/storage';
import { EXT_FOR, isImageMime } from '@/lib/files/sniff';

const ONE_DAY = 86_400;

/**
 * GET /api/files/avatar/{userId}: a profile picture. Any signed-in account may see staff and admin pictures
 * and its own; students cannot see other students' pictures. The URL carries a version (`?v=`) taken from
 * the stored key, so a new picture gets a new URL and the old one can be cached for a day.
 */
export const GET = route(async (_req: Request, ctx: { params: Promise<{ userId: string }> }) => {
  const viewer = await requireUser();
  const { userId: raw } = await ctx.params;
  const id = posInt(raw);
  if (!id) fail(400, 'invalid_id', 'Missing id.');

  const owner = await db.user.findUnique({
    where: { id },
    select: { id: true, role: true, avatarKey: true, avatarMime: true },
  });
  if (viewer.role === 'student' && id !== viewer.id && (!owner || owner.role === 'student')) {
    fail(403, 'forbidden', 'You cannot see that picture.');
  }
  if (!owner?.avatarKey || !owner.avatarMime || !isImageMime(owner.avatarMime)) fail(404, 'not_found', 'No profile picture.');

  try {
    return await fileResponse({
      key: owner.avatarKey,
      mime: owner.avatarMime,
      name: `avatar.${EXT_FOR[owner.avatarMime]}`,
      maxAge: ONE_DAY,
    });
  } catch (e) {
    if (e instanceof ApiError && e.code === 'file_missing') fail(404, 'not_found', 'No profile picture.');
    throw e;
  }
});
