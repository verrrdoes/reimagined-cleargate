import { cn } from '@/components/ui/cn';
import { split } from '@/components/ui/recipes';

/** My profile's page layout, shared by the page and its loading skeleton. */
export const profileLayout = {
  /** Picture, name and picture buttons in one row; below 640px the buttons drop under the picture and name. */
  identity:
    'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-6 gap-y-4 pb-6 mb-6 border-b border-rule ' +
    'max-sm:grid-cols-[auto_minmax(0,1fr)]',
  identityText: 'min-w-0',
  /** The kit split with a 360px side column; stacked below 1024px. Complete on its own (includes `split`). */
  split: cn(split, 'grid-cols-[minmax(0,1fr)_360px]'),
};
