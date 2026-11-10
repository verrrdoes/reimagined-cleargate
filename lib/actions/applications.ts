'use server';

import { revalidatePath } from 'next/cache';
import { requireRegistrar } from '@/lib/auth/guards';
import { runAction, type Result } from '@/lib/result';
import {
  resetTempPassword as resetTempPasswordService,
  reviewApplication as reviewApplicationService,
  submitApplication,
  type ApplyInput,
} from '@/lib/services/applications';
import type { ApplicationDetail } from '@/components/applications/types';

// Sign-up and the Registrar's review (HANDOFF §8.3). Inputs are plain objects and are validated again here.

/**
 * Public: submits a sign-up application. Returns the reference and the status token; only the token's
 * sha256 is stored. The optional photo is uploaded first (POST /api/uploads/presign) and passed as `photoTicket`.
 */
export async function apply(input: ApplyInput): Promise<Result<{ reference: string; token: string }>> {
  return runAction(async () => {
    const out = await submitApplication(input);
    revalidatePath('/applications');
    return out;
  });
}

/** Registrar and admins: approve (creates the student account) or reject (with a reason) a pending application. */
export async function reviewApplication(input: {
  id: number;
  decision: 'approve' | 'reject';
  reason?: string;
}): Promise<Result<ApplicationDetail>> {
  return runAction(async () => {
    const user = await requireRegistrar();
    const detail = await reviewApplicationService({ id: user.id }, input ?? {});
    revalidatePath('/applications');
    revalidatePath(`/applications/${detail.id}`);
    return detail;
  });
}

/** Registrar and admins: a new temporary password for an approved application's account. */
export async function resetTempPassword(input: { id: number }): Promise<Result<ApplicationDetail>> {
  return runAction(async () => {
    await requireRegistrar();
    const detail = await resetTempPasswordService(input ?? {});
    revalidatePath(`/applications/${detail.id}`);
    return detail;
  });
}
