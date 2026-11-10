'use server';

import { revalidatePath } from 'next/cache';
import { requireRegistrar } from '@/lib/auth/guards';
import { runAction, type Result } from '@/lib/result';
import { decidePasswordRequest } from '@/lib/services/passwordRequests';

// Password requests (the student side is in lib/actions/auth.ts). The Registrar and admins decide after checking
// the student's school ID in person; every decision is logged.

async function decide(input: { id: number }, decision: 'allow' | 'decline' | 'withdraw'): Promise<Result> {
  return runAction(async () => {
    const user = await requireRegistrar();
    await decidePasswordRequest(user.id, input, decision);
    revalidatePath('/password-requests');
    return null;
  });
}

/** Opens the 15-minute window in which the requesting device may set a new password. */
export async function allowPasswordRequest(input: { id: number }): Promise<Result> {
  return decide(input, 'allow');
}

export async function declinePasswordRequest(input: { id: number }): Promise<Result> {
  return decide(input, 'decline');
}

/** Takes back an approval that has not been used yet. */
export async function withdrawPasswordRequest(input: { id: number }): Promise<Result> {
  return decide(input, 'withdraw');
}
