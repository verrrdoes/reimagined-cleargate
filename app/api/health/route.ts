import { db } from '@/lib/db';
import { fail, route } from '@/lib/result';

/** GET /api/health: is the app up and can it reach the database? Never runs the scheduler. */
export const GET = route(async () => {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch (e) {
    console.error('ClearGate health check: database unreachable:', e);
    fail(503, 'database_unavailable', 'The database is not reachable right now. Try again in a moment.');
  }
  return { api: 'cleargate', database: 'connected' };
});
