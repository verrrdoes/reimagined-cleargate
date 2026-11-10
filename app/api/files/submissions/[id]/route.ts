import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { fail, route } from '@/lib/result';
import { posInt } from '@/lib/input';
import { fileResponse } from '@/lib/files/storage';
import { loadSubmission } from '@/lib/services/review';

/**
 * GET /api/files/submissions/{id}[?download=1]: streams an evidence file.
 * Admins, staff of the item's office and the student who uploaded it may open it (§8.5).
 * Inline by default (the review preview frames it; X-Frame-Options SAMEORIGIN), attachment with ?download=1.
 */
export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id: raw } = await ctx.params;
  const id = posInt(raw);
  if (!id) fail(400, 'invalid_id', 'Missing submission id.');
  const sub = await loadSubmission(db, id, user, true);
  const download = new URL(req.url).searchParams.get('download');
  return fileResponse({
    key: sub.storageKey,
    mime: sub.mimeType,
    name: sub.originalName,
    download: download === '1' || download === 'true',
  });
});
