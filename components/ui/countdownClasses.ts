/**
 * The countdown's layout, shared by <Countdown> and the route loading skeleton. It lives outside Countdown.tsx
 * because that is a client module: a Server Component cannot read properties of a client module's exports.
 */
export const countdownClasses = {
  root: 'inline-grid grid-flow-col auto-cols-fr gap-2',
  cell: 'min-w-16 px-2.5 py-2 rounded-card bg-raised text-center max-sm:min-w-0 max-sm:p-1.5',
  value: 'block text-28 font-normal leading-[1.15] tabular-nums max-sm:text-22',
  label: 'block text-12 text-muted',
};
