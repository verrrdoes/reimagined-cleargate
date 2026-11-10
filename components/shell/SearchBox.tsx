'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { kbd } from '@/components/ui/recipes';
import type { Portal } from '@/lib/types';
import { searchScope } from './nav';

const DEBOUNCE_MS = 250;

const SEARCH = 'relative flex items-center w-full';
const SEARCH_ICON = 'absolute left-2.5 text-muted pointer-events-none';
const SEARCH_INPUT =
  'w-full h-control py-0 pr-10 pl-8 border border-border rounded-control bg-surface text-text text-14 ' +
  'placeholder:text-muted hover:border-control ' +
  'focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-1 focus-visible:border-accent ' +
  '[&::-webkit-search-cancel-button]:cursor-pointer';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

function isShown(el: HTMLElement): boolean {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/**
 * The top-bar search. On pages that filter themselves it writes ?q= onto the current URL as you type
 * (and drops ?page=); elsewhere Enter opens the matching list with ?q=. "/" focuses it.
 */
export function SearchBox({ portal, id }: { portal: Portal; id: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const scope = searchScope(portal, pathname);
  const urlQ = scope.live ? (searchParams.get('q') ?? '') : '';

  const [value, setValue] = useState(urlQ);
  const [seen, setSeen] = useState({ path: pathname, q: urlQ });
  const [written, setWritten] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The URL changed without us (navigation, a page's own "clear search" link): show what it says,
  // unless it is only our own debounced write catching up with what is being typed.
  if (seen.path !== pathname || seen.q !== urlQ) {
    setSeen({ path: pathname, q: urlQ });
    if (seen.path !== pathname || urlQ !== written) setValue(urlQ);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const input = inputRef.current;
      if (!input || !isShown(input)) return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function writeQuery(next: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    // Navigated away while the timer ran: leave the new page alone.
    if (window.location.pathname !== scope.target) return;
    const params = new URLSearchParams(window.location.search);
    const q = next.trim();
    if (q) params.set('q', q);
    else params.delete('q');
    params.delete('page');
    const qs = params.toString();
    setWritten(q);
    router.replace(qs ? `${scope.target}?${qs}` : scope.target, { scroll: false });
  }

  function onChange(next: string) {
    setValue(next);
    if (!scope.live) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => writeQuery(next), DEBOUNCE_MS);
  }

  function onSubmit() {
    const q = value.trim();
    if (scope.live) {
      writeQuery(q);
      return;
    }
    if (!q) return;
    router.push(`${scope.target}?q=${encodeURIComponent(q)}`);
  }

  return (
    <form
      role="search"
      className={SEARCH}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {scope.placeholder}
      </label>
      <Icon name="search" size={16} className={SEARCH_ICON} />
      <input
        ref={inputRef}
        id={id}
        type="search"
        className={cn(SEARCH_INPUT, 'peer')}
        placeholder={scope.placeholder}
        value={value}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        maxLength={100}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          if (value) {
            e.preventDefault();
            onChange('');
            if (scope.live) writeQuery('');
          } else {
            e.currentTarget.blur();
          }
        }}
      />
      <kbd
        className={cn(
          kbd,
          'absolute right-2 pointer-events-none peer-focus:hidden peer-[:not(:placeholder-shown)]:hidden',
        )}
        aria-hidden="true"
      >
        /
      </kbd>
    </form>
  );
}

/** Same footprint as the search while it waits for the URL on first render. */
export function SearchFallback() {
  return (
    <div className={SEARCH} aria-hidden="true">
      <Icon name="search" size={16} className={SEARCH_ICON} />
      <input className={SEARCH_INPUT} tabIndex={-1} disabled placeholder="Search" />
    </div>
  );
}
