import 'server-only';
import { headers } from 'next/headers';

/** "https://reimagined-cleargate.vercel.app" or "http://localhost:3000": the site this request came to. */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000').split(',')[0].trim();
  const forwarded = h.get('x-forwarded-proto')?.split(',')[0].trim();
  const proto = forwarded || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}
