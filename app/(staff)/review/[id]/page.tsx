import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { displayName, pageUser } from '@/lib/auth/guards';
import { ApiError } from '@/lib/result';
import { posInt } from '@/lib/input';
import { checklistFor } from '@/lib/constants';
import { submissionDetail } from '@/lib/services/review';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { backLink, button } from '@/components/ui/recipes';
import { ReviewWorkspace } from '@/components/staff/ReviewWorkspace';
import type { SubmissionDetail } from '@/components/staff/types';

export const metadata: Metadata = { title: 'Review item' };

/** /review/{id}: preview the evidence, tick the office checklist, then approve or return (§8.5). */
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser('staff');
  const { id: raw } = await params;
  const id = posInt(raw);
  if (!id) notFound();

  let detail: SubmissionDetail | null = null;
  let forbidden = false;
  try {
    detail = await submissionDetail(user, id);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (e.status === 404) notFound();
    if (e.status !== 403) throw e;
    forbidden = true;
  }

  if (forbidden || !detail) {
    return (
      <>
        <Link href="/staff" className={backLink}>
          <Icon name="arrow-left" size={16} />
          Pending list
        </Link>
        <EmptyState
          icon="lock"
          title="You cannot open this submission."
          body="It belongs to another office's requirement. Submissions for your office are on the pending list."
          action={
            <Link href="/staff" className={button()}>
              Go to the pending list
            </Link>
          }
        />
      </>
    );
  }

  // Keyed by id only: the decision revalidates this page, and the "Student updated" screen must survive that.
  return <ReviewWorkspace key={detail.id} detail={detail} checklist={checklistFor(detail.office.code)} reviewer={displayName(user)} />;
}
