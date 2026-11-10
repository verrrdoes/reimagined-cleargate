import { pageLoading, spinner } from '@/components/ui/recipes';

/** Shown inside the sheet while a page's data loads. */
export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className={pageLoading} role="status" aria-live="polite">
      <span className={spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
