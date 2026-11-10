'use client';

import Link from 'next/link';
import { useId } from 'react';
import { signOut } from '@/lib/actions/auth';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { menuHead, menuHeadLine, menuHeadName, menuItem, popoverAnchor, popoverMenu } from '@/components/ui/recipes';
import { useShell } from './ShellContext';
import { usePopover } from './usePopover';

export function UserMenu() {
  const { data } = useShell();
  const { open, setOpen, wrapRef, buttonRef } = usePopover();
  const menuId = useId();

  return (
    <div className={popoverAnchor} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={
          'flex items-center gap-2 h-control max-w-[240px] py-0 pr-1.5 pl-1 border-0 rounded-control bg-transparent ' +
          'text-text font-medium cursor-pointer hover:bg-active aria-expanded:bg-active'
        }
        aria-label={`Account menu for ${data.name}`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={data.name} url={data.avatarUrl} size={24} />
        <span className="min-w-0 truncate max-sm:hidden">{data.name}</span>
        <Icon name="chevron-down" size={14} className="text-muted max-sm:hidden" />
      </button>

      {open ? (
        <div id={menuId} className={popoverMenu}>
          <div className={menuHead}>
            <span className={cn(menuHeadName, 'truncate')}>{data.name}</span>
            <span className={menuHeadLine}>{data.roleLine}</span>
            <span className={cn(menuHeadLine, 'truncate')}>{data.email}</span>
          </div>
          <Link href="/profile" className={menuItem} onClick={() => setOpen(false)}>
            <Icon name="user" size={16} />
            My profile
          </Link>
          <form action={signOut}>
            <input type="hidden" name="portal" value={data.portal} />
            <button type="submit" className={menuItem}>
              <Icon name="logout" size={16} />
              Log out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
