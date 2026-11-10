import { EmptyState } from '@/components/ui';
import { panel } from '@/components/ui/recipes';

/** Shown on every student page while no clearance has been opened for the student. */
export function NoClearance() {
  return (
    <div className={panel()}>
      <EmptyState
        icon="clipboard"
        title="No clearance opened yet"
        body="Your school hasn’t opened a clearance for you this term. Check back later or contact the Registrar."
      />
    </div>
  );
}
