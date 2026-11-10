import { requireUser } from '@/lib/auth/guards';
import { route } from '@/lib/result';
import { fileResponse } from '@/lib/files/storage';
import { ownApplicationPhoto } from '@/lib/services/applications';

/** GET /api/files/application-photo/me: the signed-in student's own application photo. */
export const GET = route(async () => {
  const user = await requireUser();
  const photo = await ownApplicationPhoto(user.id);
  return fileResponse({ key: photo.key, mime: photo.mime, name: photo.name, maxAge: 300 });
});
