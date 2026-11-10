import { requireUser } from '@/lib/auth/guards';
import { checkOrigin } from '@/lib/request';
import { fail, route } from '@/lib/result';
import { posInt, str } from '@/lib/input';
import { openConversation, sendMessage } from '@/lib/services/messages';
import type { Conversation } from '@/components/chat/types';

/**
 * GET /api/messages?itemId=N (legacy `item_id` also accepted): the thread for one clearance item.
 * Opening it marks the other side's messages read (§8.6).
 */
export const GET = route(async (req: Request): Promise<Conversation> => {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;
  const itemId = posInt(params.get('itemId') ?? params.get('item_id'));
  if (!itemId) fail(400, 'invalid_item', 'Missing item_id.');
  return openConversation(user, itemId);
});

/**
 * POST /api/messages `{ itemId, body }` (legacy `item_id` also accepted): sends a message and returns the thread.
 * 1–1000 characters; 20 messages a minute per account.
 */
export const POST = route(async (req: Request): Promise<Conversation> => {
  checkOrigin(req);
  const user = await requireUser();

  let input: Record<string, unknown> = {};
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) input = parsed as Record<string, unknown>;
  } catch {
    input = {};
  }

  const itemId = posInt(input.itemId ?? input.item_id);
  if (!itemId) fail(400, 'invalid_item', 'Missing item_id.');
  // 1–1000 characters after trimming: longer text is refused (as the legacy str() did), not cut short.
  const raw = typeof input.body === 'string' ? input.body.trim() : '';
  if (Array.from(raw).length > 1000) fail(400, 'invalid_field', 'Your message is too long (max 1000 characters).');
  const text = str(raw, 1000);
  if (text === '') fail(400, 'empty_message', 'Write a message first.');

  return sendMessage(user, itemId, text);
});
