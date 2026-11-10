import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { backLink, button } from '@/components/ui/recipes';

/** Inside the shell: the application id does not exist. */
export default function ApplicationNotFound() {
  return (
    <>
      <Link href="/applications" className={backLink}>
        <Icon name="arrow-left" size={16} />
        Applications
      </Link>
      <EmptyState
        icon="user-x"
        title="That application was not found."
        body="Check the link, or open it from the list of applications."
        action={
          <Link href="/applications" className={button()}>
            Go to applications
          </Link>
        }
      />
    </>
  );
}
