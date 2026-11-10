import 'server-only';
import { headers } from 'next/headers';
import { fail } from '@/lib/result';

/** The client IP: first x-forwarded-for entry on Vercel. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (forwarded || h.get('x-real-ip') || '0.0.0.0').slice(0, 45);
}

/** Route Handlers that change state: when the browser sends an Origin, it must be this site. */
export function checkOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (!origin) return;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch {
    /* not a URL */
  }
  if (!host || originHost !== host) fail(403, 'bad_origin', 'Requests must come from the ClearGate site.');
}
