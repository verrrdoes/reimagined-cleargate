import { checkOrigin } from '@/lib/request';
import { fail, route } from '@/lib/result';
import { applicationStatus } from '@/lib/services/applications';

/**
 * POST /api/applications/status (public; the status page polls it every 15 s while pending).
 * `{ reference, token }` from the browser that applied, or `{ reference, personalEmail, birthday }`.
 * → `{ reference, status, name, submittedAt, reviewedAt, rejectReason }`, plus
 *   `studentNumber`, `studentEmail` and `tempPassword` once approved. 404 when nothing matches.
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
  return applicationStatus(body as Record<string, unknown>);
});
