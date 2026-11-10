import { env } from '@/lib/env';
import { fail, route } from '@/lib/result';
import { safeEqual } from '@/lib/files/sign';
import { runTick, stampTick } from '@/lib/services/scheduler';

/**
 * GET /api/cron/tick (HANDOFF §8.9). Called by Vercel Cron or any scheduler with
 * `Authorization: Bearer <CRON_SECRET>`. Sends due scheduled reminders, "deadline passed" notices and the
 * automatic student alerts, then returns what it did.
 */
export const GET = route(async (req: Request) => {
  const secret = env().CRON_SECRET;
  if (!secret) fail(503, 'cron_not_configured', 'The scheduler is off: set CRON_SECRET in the environment.');

  const header = req.headers.get('authorization') ?? '';
  if (!header || !safeEqual(header, `Bearer ${secret}`)) {
    fail(401, 'unauthorized', 'Missing or wrong cron secret.');
  }

  await stampTick();
  return runTick();
});
