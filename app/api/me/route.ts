import { after } from 'next/server';
import { requireUser } from '@/lib/auth/guards';
import { route } from '@/lib/result';
import { getShellData } from '@/lib/services/shell';
import { maybeTick } from '@/lib/services/scheduler';
import type { MePoll } from '@/lib/types';

/**
 * GET /api/me: the bell and message-badge poll (every 60 s from the shell).
 * Also the scheduler safety net: at most once a minute across all users, run the tick after the response.
 */
export const GET = route(async (): Promise<MePoll> => {
  const user = await requireUser();

  after(async () => {
    try {
      await maybeTick();
    } catch (e) {
      console.error('ClearGate scheduler (from /api/me):', e);
    }
  });

  const shell = await getShellData(user, user.role === 'student' ? 'student' : 'staff');
  return { unreadMessages: shell.unreadMessages, notifications: shell.notifications, serverNow: shell.serverNow };
});
