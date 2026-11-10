import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { backLink, button } from '@/components/ui/recipes';

/** Inside the shell: the submission id does not exist (or was removed with its clearance). */
export default function SubmissionNotFound() {
  return (
    <>
      <Link href="/staff" className={backLink}>
        <Icon name="arrow-left" size={16} />
        Pending list
      </Link>
      <EmptyState
        icon="file"
        title="That submission was not found."
        body="It may have been removed with the student's clearance. New uploads from students appear on the pending list."
        action={
          <Link href="/staff" className={button()}>
            Go to the pending list
          </Link>
        }
      />
    </>
  );
}
