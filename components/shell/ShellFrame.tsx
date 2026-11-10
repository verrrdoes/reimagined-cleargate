'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { signOut } from '@/lib/actions/auth';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { countBadge, iconButton } from '@/components/ui/recipes';
import type { ShellData } from '@/lib/types';
import { Bell } from './Bell';
import { isNavActive, navItems, portalHome } from './nav';
import { SearchBox, SearchFallback } from './SearchBox';
import { ShellProvider, useShell } from './ShellContext';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

const DESKTOP = '(min-width: 1024px)';

const NAV_LINK =
  'flex items-center gap-2.5 w-full h-[34px] px-2 py-0 border-0 rounded-control bg-transparent text-muted text-14 font-medium ' +
  'text-left no-underline cursor-pointer hover:bg-active hover:text-text hover:no-underline ' +
  'aria-[current=page]:bg-active aria-[current=page]:text-text aria-[current=page]:font-semibold';
const NAV_LABEL = 'flex-auto min-w-0 truncate';

/** Below 1024px the sidebar is an off-canvas drawer, opened by the menu button (data-nav-open on the shell). */
const SIDEBAR =
  'col-1 row-[1/span_2] sticky top-0 flex flex-col h-svh pt-2 px-3 pb-3 overflow-y-auto bg-ground ' +
  'max-lg:fixed max-lg:inset-[0_auto_0_0] max-lg:z-60 max-lg:w-[min(300px,86vw)] max-lg:h-full max-lg:border-r ' +
  'max-lg:border-border max-lg:[transform:translateX(-100%)] max-lg:invisible ' +
  'max-lg:[transition:transform_0.2s_ease-out,visibility_0s_linear_0.2s] ' +
  'max-lg:group-data-[nav-open=true]/shell:[transform:none] max-lg:group-data-[nav-open=true]/shell:visible ' +
  'max-lg:group-data-[nav-open=true]/shell:[transition:transform_0.2s_ease-out] print:hidden!';

const TOPBAR =
  'col-2 row-1 sticky top-0 z-30 grid grid-cols-[minmax(0,1fr)_minmax(0,480px)_minmax(0,1fr)] items-center gap-3 ' +
  'h-topbar pr-3 bg-ground max-lg:col-1 max-lg:grid-cols-[auto_minmax(0,1fr)_auto] max-lg:px-inset ' +
  'max-sm:grid-cols-[minmax(0,1fr)_auto] print:hidden!';

const SHEET =
  'col-2 row-2 min-w-0 mr-inset mb-inset p-pad border border-border rounded-sheet bg-surface focus:outline-none ' +
  'max-lg:col-1 max-lg:mx-inset max-sm:m-0 max-sm:border-x-0 max-sm:border-b-0 max-sm:rounded-none ' +
  'print:m-0 print:p-0 print:border-0 print:rounded-none';

function badgeText(n: number) {
  return n > 99 ? '99+' : String(n);
}

function Sidebar({ onNavigate, onClose }: { onNavigate: () => void; onClose: () => void }) {
  const { data, unreadMessages } = useShell();
  const pathname = usePathname();
  const items = navItems(data);
  const home = portalHome(data.portal);

  return (
    <>
      <div className="flex items-center justify-between gap-2 h-8 px-2">
        <Logo href={home} size={24} />
        <button
          type="button"
          className={cn(iconButton(), 'hidden max-lg:inline-grid')}
          data-drawer-close
          aria-label="Close menu"
          onClick={onClose}
        >
          <Icon name="x" size={18} />
        </button>
      </div>
      <p className="mb-4 pr-2 pl-10 text-12 text-muted">{data.portal === 'student' ? 'Student portal' : 'Staff portal'}</p>

      <div className="hidden mb-3 max-sm:block [&_kbd]:hidden">
        <Suspense fallback={<SearchFallback />}>
          <SearchBox portal={data.portal} id="search-drawer" />
        </Suspense>
      </div>

      <nav aria-label="Main">
        <ul className="flex flex-col gap-0.5 m-0 p-0 list-none">
          {items.map((item) => {
            const active = isNavActive(pathname, item);
            const count = item.badge === 'messages' ? unreadMessages : 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={NAV_LINK}
                  aria-current={active ? 'page' : undefined}
                  onClick={onNavigate}
                  title={count > 0 && data.portal === 'student' ? `${count} unread ${count === 1 ? 'message' : 'messages'} from offices` : undefined}
                >
                  <Icon name={item.icon} size={16} />
                  <span className={NAV_LABEL}>{item.label}</span>
                  {count > 0 ? (
                    <span className={countBadge}>
                      {badgeText(count)}
                      <span className="sr-only"> unread {count === 1 ? 'message' : 'messages'}</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto pt-3">
        <form action={signOut}>
          <input type="hidden" name="portal" value={data.portal} />
          <button type="submit" className={NAV_LINK}>
            <Icon name="logout" size={16} />
            <span className={NAV_LABEL}>Log out</span>
          </button>
        </form>
      </div>
    </>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { data } = useShell();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [navPath, setNavPath] = useState(pathname);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  // A navigation (including back/forward) closes the drawer.
  if (navPath !== pathname) {
    setNavPath(pathname);
    setNavOpen(false);
  }

  function closeNav(returnFocus: boolean) {
    setNavOpen(false);
    if (returnFocus) menuButtonRef.current?.focus();
  }

  useEffect(() => {
    if (!navOpen) return;
    sidebarRef.current?.querySelector<HTMLElement>('[data-drawer-close]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNavOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    const media = window.matchMedia(DESKTOP);
    const onMedia = () => {
      if (media.matches) setNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    media.addEventListener('change', onMedia);
    return () => {
      document.removeEventListener('keydown', onKey);
      media.removeEventListener('change', onMedia);
    };
  }, [navOpen]);

  return (
    <div
      className={
        'group/shell grid grid-cols-[var(--sidebar-w)_minmax(0,1fr)] grid-rows-[var(--topbar-h)_minmax(0,1fr)] ' +
        'min-h-svh bg-ground max-lg:grid-cols-1 print:block'
      }
      data-nav-open={navOpen ? 'true' : undefined}
    >
      <aside ref={sidebarRef} id="shell-nav" className={SIDEBAR} aria-label="Menu">
        <Sidebar onNavigate={() => setNavOpen(false)} onClose={() => closeNav(true)} />
      </aside>

      {navOpen ? (
        <button
          type="button"
          className={
            'hidden max-lg:block max-lg:fixed max-lg:inset-0 max-lg:z-55 max-lg:border-0 max-lg:p-0 max-lg:bg-scrim ' +
            'max-lg:cursor-default print:hidden!'
          }
          tabIndex={-1}
          aria-label="Close menu"
          onClick={() => closeNav(true)}
        />
      ) : null}

      <header className={TOPBAR} inert={navOpen}>
        <div className="flex items-center gap-2 min-w-0">
          <button
            ref={menuButtonRef}
            type="button"
            className={cn(iconButton(), 'hidden max-lg:inline-grid')}
            aria-label="Open menu"
            aria-controls="shell-nav"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            <Icon name="menu" size={18} />
          </button>
          <Logo href={portalHome(data.portal)} size={22} className="hidden max-lg:inline-flex" />
        </div>
        <div className="max-lg:justify-self-center max-lg:w-full max-lg:max-w-[480px] max-sm:hidden">
          <Suspense fallback={<SearchFallback />}>
            <SearchBox portal={data.portal} id="search-top" />
          </Suspense>
        </div>
        <div className="flex items-center justify-end gap-1 min-w-0">
          <ThemeToggle />
          <Bell />
          <UserMenu />
        </div>
      </header>

      <main id="main" className={SHEET} tabIndex={-1} inert={navOpen}>
        <div className="max-w-[1440px] mx-auto">{children}</div>
      </main>
    </div>
  );
}

/** Client half of the app shell: live data, the drawer, the top bar and the sheet. */
export function ShellFrame({ data, children }: { data: ShellData; children: ReactNode }) {
  return (
    <ShellProvider data={data}>
      <Frame>{children}</Frame>
    </ShellProvider>
  );
}
