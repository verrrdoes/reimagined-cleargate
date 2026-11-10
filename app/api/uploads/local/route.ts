import { checkOrigin } from '@/lib/request';
import { fail, route } from '@/lib/result';
import { storage, usesLocalDisk, verifyLocalPut } from '@/lib/files/storage';

/**
 * PUT /api/uploads/local?key=&type=&size=&exp=&sig=
 * Development stand-in for a presigned bucket URL, used only by the local-disk driver (S3_BUCKET empty).
 * The signed query string is the permission: same key, same type, at most the approved size, within 5 minutes.
 */
export const PUT = route(async (req: Request) => {
  if (!usesLocalDisk()) fail(404, 'not_found', 'Not found.');
  checkOrigin(req);

  const grant = verifyLocalPut(new URL(req.url).searchParams);
  if (!grant) fail(403, 'invalid_upload', 'The upload expired. Choose the file again.');

  const type = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (type !== grant.contentType) fail(400, 'invalid_upload', 'The upload expired. Choose the file again.');

  const declared = Number(req.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > grant.size) fail(413, 'file_too_large', 'That file is too large for this upload.');

  if (!req.body) fail(400, 'upload_failed', 'The upload did not finish. Please try again.');
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = req.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > grant.size) {
      await reader.cancel();
      fail(413, 'file_too_large', 'That file is too large for this upload.');
    }
    chunks.push(value);
  }
  if (received !== grant.size) fail(400, 'upload_failed', 'The upload did not finish. Please try again.');

  const body = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    body.set(c, offset);
    offset += c.byteLength;
  }
  await storage().put(grant.key, body, grant.contentType);
  return null;
});
