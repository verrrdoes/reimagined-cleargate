import { EmptyState } from '@/components/ui/EmptyState';
import { pageHead } from '@/components/ui/recipes';

/** Shown instead of an office list when a staff account has no office yet (the API answers 403 no_office). */
export function NoOffice({ title }: { title: string }) {
  return (
    <>
      <div className={pageHead}>
        <h1>{title}</h1>
      </div>
      <EmptyState
        icon="building"
        title="Your staff account is not linked to an office."
        body="Office lists appear here once an administrator assigns you to an office."
      />
    </>
  );
}
