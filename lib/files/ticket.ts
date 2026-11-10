import 'server-only';
import { appSecret } from '@/lib/env';
import { ApiError } from '@/lib/result';
import { hmac, safeEqual } from '@/lib/files/sign';
import { isEvidenceMime, isImageMime } from '@/lib/files/sniff';

// A ticket is handed out with a presigned upload URL and comes back with the finalize call. It proves
// that this server authorised that exact object key, kind, owner, type and size within the last 10 minutes.

export type UploadKind = 'evidence' | 'photo';

export type TicketPayload = {
  key: string;
  kind: UploadKind;
  userId: number | null;
  itemId?: number;
  contentType: string;
  size: number;
};

export type VerifiedTicket = {
  key: string;
  kind: UploadKind;
  itemId?: number;
  contentType: string;
  size: number;
};

const TICKET_TTL_MS = 10 * 60_000;
const KEY_PATTERN: Record<UploadKind, RegExp> = {
  evidence: /^evidence\/[0-9a-f]{32}\.(pdf|jpg|png|webp)$/,
  photo: /^photos\/[0-9a-f]{32}\.(jpg|png|webp)$/,
};

const sign = (body: string) => hmac(appSecret(), `cleargate-upload-ticket\n${body}`);

/** Signs a ticket that expires in 10 minutes. */
export function signTicket(payload: TicketPayload): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TICKET_TTL_MS }), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

const expired = (): never => {
  throw new ApiError(400, 'invalid_upload', 'The upload expired. Choose the file again.');
};

/**
 * Checks the signature, the expiry, the kind and (when given) the owner. Throws 400 `invalid_upload`
 * for anything that doesn't match. The caller still compares `itemId` with the item it is finalizing.
 */
export function verifyTicket(ticket: unknown, expect: { kind: UploadKind; userId?: number | null }): VerifiedTicket {
  if (typeof ticket !== 'string' || ticket.length > 2000) return expired();
  const dot = ticket.indexOf('.');
  if (dot < 1) return expired();
  const body = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  if (!safeEqual(sig, sign(body))) return expired();

  let p: Partial<TicketPayload> & { exp?: unknown };
  try {
    p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return expired();
  }
  if (typeof p.exp !== 'number' || p.exp < Date.now()) return expired();
  if (p.kind !== expect.kind || typeof p.key !== 'string' || !KEY_PATTERN[expect.kind].test(p.key)) return expired();
  if (expect.userId !== undefined && (p.userId ?? null) !== expect.userId) return expired();
  if (typeof p.contentType !== 'string' || !(p.kind === 'photo' ? isImageMime(p.contentType) : isEvidenceMime(p.contentType))) return expired();
  if (typeof p.size !== 'number' || !Number.isSafeInteger(p.size) || p.size < 1) return expired();
  if (p.itemId !== undefined && (typeof p.itemId !== 'number' || !Number.isSafeInteger(p.itemId))) return expired();

  return {
    key: p.key,
    kind: p.kind,
    ...(p.itemId !== undefined ? { itemId: p.itemId } : {}),
    contentType: p.contentType,
    size: p.size,
  };
}
