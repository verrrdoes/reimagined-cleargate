import 'server-only';
import { appSecret, env } from '@/lib/env';
import { ApiError, fail } from '@/lib/result';
import { LIMITS, MB } from '@/lib/constants';
import { contentDisposition, isImageMime, sniff, type Sniffed } from '@/lib/files/sniff';
import type { VerifiedTicket } from '@/lib/files/ticket';
import { createStorage, verifyLocalPutUrl, type LocalPutGrant, type StorageDriver } from '@/lib/files/storage-core';

export type { StorageDriver, StoredObject, ObjectInfo, PresignedPut, LocalPutGrant } from '@/lib/files/storage-core';

let cached: StorageDriver | null = null;

/** True when S3_BUCKET is empty and files go to `.data/uploads` (development only). */
export const usesLocalDisk = () => !env().S3_BUCKET;

/**
 * The configured storage driver: the private S3/R2 bucket, or the local-disk driver when S3_BUCKET is
 * empty. The local driver refuses to run on Vercel, where the disk is read-only and not shared.
 */
export function storage(): StorageDriver {
  if (cached) return cached;
  const e = env();
  if (!e.S3_BUCKET && process.env.VERCEL) {
    fail(500, 'storage_not_configured', 'File storage is not set up. Add the S3_* settings to the Vercel project.');
  }
  cached = createStorage({
    bucket: e.S3_BUCKET,
    endpoint: e.S3_ENDPOINT,
    region: e.S3_REGION,
    accessKeyId: e.S3_ACCESS_KEY_ID,
    secretAccessKey: e.S3_SECRET_ACCESS_KEY,
    localSecret: appSecret,
  });
  return cached;
}

/** Local-driver upload URLs: the signed grant, or null when forged or expired. */
export function verifyLocalPut(params: URLSearchParams): LocalPutGrant | null {
  return verifyLocalPutUrl(params, appSecret());
}

/**
 * Streams a stored file through an authorising Route Handler (§11): the type from the database,
 * nosniff, a private cache and a safe Content-Disposition. 404 when the object is missing.
 */
export async function fileResponse(opts: {
  key: string;
  mime: string;
  name: string;
  download?: boolean;
  maxAge?: number;
}): Promise<Response> {
  const obj = await storage().get(opts.key);
  if (!obj) fail(404, 'file_missing', 'The file for this record is missing from storage.');
  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': opts.mime,
      'Content-Length': String(obj.size),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': `private, max-age=${Math.max(0, Math.floor(opts.maxAge ?? 0))}`,
      'Content-Disposition': contentDisposition(opts.name, Boolean(opts.download)),
      'X-Frame-Options': 'SAMEORIGIN',
    },
  });
}

const TYPE_MESSAGE = {
  evidence: 'Upload a PDF, JPG, PNG or WEBP file.',
  photo: 'The photo must be a JPG, PNG or WEBP image.',
} as const;

const SIZE_MESSAGE = {
  evidence: `That file is too large. The limit is ${LIMITS.evidenceMB} MB.`,
  photo: `Your photo is too large. The limit is ${LIMITS.photoMB} MB.`,
} as const;

/**
 * Finalize step for a presigned upload (§11): the object must exist, be no larger than the ticket allows,
 * and its first 16 bytes must be an allowed type. On any failure the object is deleted and the
 * matching 400/413/415 error is thrown. Returns the sniffed type and the stored size.
 */
export async function inspectUpload(ticket: VerifiedTicket): Promise<Sniffed & { size: number }> {
  const store = storage();
  const info = await store.head(ticket.key);
  if (!info || info.size < 1) {
    if (info) await removeQuietly(ticket.key);
    fail(400, 'upload_failed', 'The upload did not finish. Please try again.');
  }
  const limit = (ticket.kind === 'photo' ? LIMITS.photoMB : LIMITS.evidenceMB) * MB;
  if (info.size > ticket.size || info.size > limit) {
    await removeQuietly(ticket.key);
    fail(413, 'file_too_large', SIZE_MESSAGE[ticket.kind]);
  }
  const head = await store.readStart(ticket.key, 16);
  const type = head ? sniff(head) : null;
  if (!type || (ticket.kind === 'photo' && !isImageMime(type.mime))) {
    await removeQuietly(ticket.key);
    fail(415, 'file_type', TYPE_MESSAGE[ticket.kind]);
  }
  return { ...type, size: info.size };
}

/** Deletes an object, logging (not throwing) on failure. For cleanup after a failed finalize. */
export async function removeQuietly(key: string | null | undefined): Promise<void> {
  if (!key) return;
  try {
    await storage().remove(key);
  } catch (e) {
    if (e instanceof ApiError) return;
    console.error('ClearGate storage: could not delete', key, e);
  }
}
