import { requireRegistrar } from '@/lib/auth/guards';
import { fail, route } from '@/lib/result';
import { posInt } from '@/lib/input';
import { fileResponse } from '@/lib/files/storage';
import { applicationPhoto } from '@/lib/services/applications';

/** GET /api/files/application-photo/{id}: an applicant's 2x2 photo, for the Registrar and admins. */
export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireRegistrar();
  const id = posInt((await ctx.params).id);
  if (!id) fail(404, 'not_found', 'That application was not found.');
  const photo = await applicationPhoto(id);
  return fileResponse({ key: photo.key, mime: photo.mime, name: photo.name, maxAge: 300 });
});
