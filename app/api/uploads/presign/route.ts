import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { checkOrigin, clientIp } from '@/lib/request';
import { fail, route } from '@/lib/result';
import { LIMITS, MB } from '@/lib/constants';
import { oneOf, posInt, str } from '@/lib/input';
import { randomHex } from '@/lib/ids';
import { EXT_FOR, isEvidenceMime, isImageMime } from '@/lib/files/sniff';
import { signTicket } from '@/lib/files/ticket';
import { storage } from '@/lib/files/storage';

async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    fail(415, 'json_required', 'Send the request body as application/json.');
  }
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    fail(400, 'invalid_json', 'The request body is not valid JSON.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'invalid_json', 'The request body is not valid JSON.');
  return data as Record<string, unknown>;
}

/**
 * POST /api/uploads/presign
 * { kind: 'evidence', itemId, contentType, size } (signed-in student, own item) or
 * { kind: 'photo', contentType, size } (public sign-up form).
 * → { url, method: 'PUT', headers, ticket }. The browser PUTs the file, then hands `ticket` to the finalize action.
 */
export const POST = route(async (req: Request) => {
  checkOrigin(req);
  const body = await readJson(req);
  const kind = oneOf(body.kind, ['evidence', 'photo'] as const);
  if (!kind) fail(400, 'invalid_kind', 'Choose what this file is for.');
  const contentType = str(body.contentType, 100).toLowerCase();
  const size = posInt(body.size);

  if (kind === 'evidence') {
    const user = await requireUser(['student']);
    const itemId = posInt(body.itemId);
    if (!itemId) fail(400, 'invalid_item', 'Choose which office this file is for.');
    const item = await db.clearanceItem.findFirst({
      where: { id: itemId, clearance: { student: { userId: user.id } } },
      select: { id: true, status: true, office: { select: { name: true } } },
    });
    if (!item) fail(404, 'item_not_found', 'That clearance item was not found on your account.');
    if (item.status === 'approved') fail(409, 'already_approved', `${item.office.name} has already cleared you. No upload needed.`);
    if (!size) fail(400, 'no_file', 'Choose a file to upload.');
    if (size > LIMITS.evidenceMB * MB) fail(413, 'file_too_large', `That file is too large. The limit is ${LIMITS.evidenceMB} MB.`);
    if (!isEvidenceMime(contentType)) fail(415, 'file_type', 'Upload a PDF, JPG, PNG or WEBP file.');

    const key = `evidence/${randomHex(16)}.${EXT_FOR[contentType]}`;
    const put = await storage().presignPut(key, contentType, size);
    const ticket = signTicket({ key, kind, userId: user.id, itemId: item.id, contentType, size });
    return { url: put.url, method: 'PUT' as const, headers: put.headers, ticket };
  }

  // Application photo: public, throttled like the legacy apply route (10 applications per IP per 15 minutes).
  const since = new Date(Date.now() - LIMITS.lockoutMinutes * 60_000);
  const recent = await db.loginAttempt.count({
    where: { ipAddress: await clientIp(), login: { startsWith: 'apply:' }, attemptedAt: { gt: since } },
  });
  if (recent >= LIMITS.applicationsPerIpPerWindow) {
    fail(429, 'too_many_attempts', `Too many applications from this computer. Try again in ${LIMITS.lockoutMinutes} minutes.`);
  }
  if (!size) fail(400, 'no_file', 'Choose a photo to upload.');
  if (size > LIMITS.photoMB * MB) fail(413, 'file_too_large', `Your photo is too large. The limit is ${LIMITS.photoMB} MB.`);
  if (!isImageMime(contentType)) fail(415, 'file_type', 'The photo must be a JPG, PNG or WEBP image.');

  const key = `photos/${randomHex(16)}.${EXT_FOR[contentType]}`;
  const put = await storage().presignPut(key, contentType, size);
  const ticket = signTicket({ key, kind, userId: null, contentType, size });
  return { url: put.url, method: 'PUT' as const, headers: put.headers, ticket };
});
