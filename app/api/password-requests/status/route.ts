import { checkOrigin } from '@/lib/request';
import { fail, route } from '@/lib/result';
import { getPasswordRequestStatus } from '@/lib/services/passwordRequests';

/**
 * POST /api/password-requests/status (public; the Forgot password page asks every 15 s while a request is open).
 * `{ token }`: the secret of the device that asked → `{ state: 'waiting' | 'allowed' | 'closed', approvedUntil }`.
 * An unknown secret answers like a request no one has decided, so this never tells whether an account exists.
 */
export const POST = route(async (req: Request) => {
  checkOrigin(req);
  let body: unknown = null;
  try {
    const text = await req.text();
    body = text.trim() === '' ? {} : JSON.parse(text);
  } catch {
    fail(400, 'invalid_json', 'The request body is not valid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'invalid_json', 'The request body is not valid JSON.');
  return getPasswordRequestStatus((body as { token?: unknown }).token);
});
