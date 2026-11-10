import type { IconName } from '@/components/ui/Icon';
import type { Portal, ShellData } from '@/lib/types';

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Other path prefixes that belong to this entry (e.g. /review/12 is part of the Pending list). */
  also?: string[];
  /** Shows the unread office-message count. */
  badge?: 'messages';
};

/** Sidebar entries in order (§10.1). Log out is added by the sidebar itself. */
export function navItems(d: Pick<ShellData, 'portal' | 'isRegistrar' | 'isAdmin'>): NavItem[] {
  if (d.portal === 'student') {
    return [
      { href: '/dashboard', label: 'Dashboard', icon: 'grid' },
      { href: '/requirements', label: 'My requirements', icon: 'clipboard', badge: 'messages' },
      { href: '/clearance-status', label: 'Clearance status', icon: 'folder-check' },
      { href: '/profile', label: 'My profile', icon: 'user' },
    ];
  }
  const items: NavItem[] = [
    { href: '/overview', label: 'Dashboard', icon: 'grid' },
    { href: '/staff', label: 'Pending list', icon: 'inbox', also: ['/review'] },
    { href: '/messages', label: 'Messages', icon: 'messages', badge: 'messages' },
    { href: '/history', label: 'Review history', icon: 'history' },
  ];
  if (d.isRegistrar) {
    items.push(
      { href: '/applications', label: 'Applications', icon: 'user-plus' },
      { href: '/password-requests', label: 'Password requests', icon: 'key' },
    );
  }
  items.push(
    { href: '/office-status', label: 'Clearance status', icon: 'folder-check' },
    { href: '/deadlines', label: 'Deadlines', icon: 'clock' },
  );
  if (d.isRegistrar) {
    items.push({ href: '/reports', label: 'Reports', icon: 'chart' }, { href: '/audit', label: 'Audit log', icon: 'scroll' });
  }
  if (d.isAdmin) {
    items.push({ href: '/settings', label: 'Settings', icon: 'settings' }, { href: '/staff-accounts', label: 'Staff accounts', icon: 'users' });
  }
  items.push({ href: '/profile', label: 'My profile', icon: 'user' });
  return items;
}

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isNavActive(pathname: string, item: NavItem): boolean {
  return under(pathname, item.href) || (item.also ?? []).some((p) => under(pathname, p));
}

export const portalHome = (portal: Portal) => (portal === 'student' ? '/dashboard' : '/overview');

/* ---------- Top-bar search ---------- */

export type SearchScope = {
  /** True when this page filters itself from ?q= as you type. */
  live: boolean;
  /** Where Enter goes when the page is not live. */
  target: string;
  placeholder: string;
};

/** Staff list pages that read ?q=, with their placeholder. */
const STAFF_SEARCH: Record<string, string> = {
  '/staff': 'Search pending submissions',
  '/history': 'Search review history',
  '/office-status': 'Search students',
  '/messages': 'Search conversations',
  '/applications': 'Search applications',
  '/audit': 'Search the audit log',
  '/staff-accounts': 'Search staff accounts',
};

/**
 * Students: /requirements filters live; anywhere else Enter opens /requirements?q=.
 * Staff: list pages filter live; their detail pages (and /review/*) send Enter to the list; other pages go to the Pending list.
 */
export function searchScope(portal: Portal, pathname: string): SearchScope {
  if (portal === 'student') {
    return { live: pathname === '/requirements', target: '/requirements', placeholder: 'Search requirements' };
  }
  const exact = STAFF_SEARCH[pathname];
  if (exact) return { live: true, target: pathname, placeholder: exact };
  const parent = Object.keys(STAFF_SEARCH).find((p) => pathname.startsWith(`${p}/`));
  if (parent) return { live: false, target: parent, placeholder: STAFF_SEARCH[parent] };
  return { live: false, target: '/staff', placeholder: STAFF_SEARCH['/staff'] };
}
