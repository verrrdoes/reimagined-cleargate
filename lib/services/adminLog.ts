import 'server-only';
import type { Db } from '@/lib/db';
import { cut } from '@/lib/input';

/** Writes to admin_actions (staff deadline and reminder actions too). Details are cut to 500 characters. */
export async function logAdmin(tx: Db, userId: number, action: string, details: string): Promise<void> {
  await tx.adminAction.create({ data: { userId, action: cut(action, 60), details: cut(details, 500) } });
}

/** "1 student" / "3 students" */
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
