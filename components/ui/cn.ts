import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Joins class names and lets later Tailwind utilities win over earlier ones (`cn('px-3', 'px-4')` → `px-4`).
 * tailwind-merge only knows the default theme, so the project's own names from app/globals.css are listed here;
 * without them it would treat `text-13` as a colour and keep both `h-control h-7`.
 * The theme's text sizes set font-size only, so a later `text-13` must not drop an earlier `leading-none`.
 */
const twMerge = extendTailwindMerge({
  override: {
    conflictingClassGroups: { 'font-size': [] },
  },
  extend: {
    theme: {
      color: [
        'accent', 'action-line', 'active', 'border', 'control', 'ground', 'ink', 'ink-hover', 'ink-text', 'muted',
        'negative', 'negative-line', 'on-accent', 'on-negative', 'positive', 'raised', 'rule', 'scrim', 'surface',
        'text', 'warning', 'white', 'black',
        'pill-action-bg', 'pill-action-fg', 'pill-pending-bg', 'pill-pending-fg', 'pill-approved-bg', 'pill-approved-fg',
        'pill-overdue-bg', 'pill-overdue-fg', 'pill-info-bg', 'pill-info-fg', 'pill-muted-bg', 'pill-muted-fg',
      ],
      text: ['10', '11', '12', '13', '14', '15', '16', '22', '28', '32', '40'],
      radius: ['card', 'control', 'sheet'],
      spacing: ['control', 'row', 'pad', 'inset', 'sidebar', 'topbar'],
      shadow: ['overlay'],
      animate: ['spinner', 'toast-in', 'skel-in', 'skel-pulse'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
