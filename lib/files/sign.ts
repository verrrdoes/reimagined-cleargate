// HMAC helpers shared by upload tickets and local-driver upload URLs.
// No 'server-only' here: prisma/seed.ts (run by tsx outside Next) loads the storage core, which uses this.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC-SHA256 of `data`, base64url. */
export function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/** Constant-time string comparison (hashing first so different lengths don't leak through timing). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}
