'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { iconButton } from '@/components/ui/recipes';

export const THEME_KEY = 'cg-theme';
const THEME_COLOR = { light: '#f3f5f8', dark: '#0f1012' };

const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

function syncThemeColor(dark: boolean) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light);
}

function applyTheme(dark: boolean) {
  const root = document.documentElement;
  if (dark) root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  syncThemeColor(dark);
}

/**
 * Light/dark switch. The choice is kept in localStorage (`cg-theme`) and applied before paint by the
 * root layout's inline script; other open tabs follow through the storage event.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  useEffect(() => {
    syncThemeColor(isDark());
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) applyTheme(e.newValue === 'dark');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <button
      type="button"
      className={cn(iconButton(), className)}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => {
        const next = !isDark();
        applyTheme(next);
        try {
          localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
        } catch {
          // Private mode or storage turned off: the choice lasts for this page only.
        }
      }}
    >
      <Icon name="moon" size={18} className="dark:hidden" />
      <Icon name="sun" size={18} className="hidden dark:block" />
    </button>
  );
}
