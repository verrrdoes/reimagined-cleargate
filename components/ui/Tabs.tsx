import Link from 'next/link';
import { cn } from './cn';
import { tabCount, tabLink, tabs } from './recipes';

export type TabItem = { href: string; label: string; count?: number | null };

/**
 * Underline tabs that are links (each tab is its own URL). `current` is the href of the selected tab.
 */
export function Tabs({ items, current, label = 'Sections', className }: { items: TabItem[]; current: string; label?: string; className?: string }) {
  return (
    <nav className={cn(tabs, className)} aria-label={label}>
      {items.map((item) => {
        const selected = item.href === current;
        return (
          <Link key={item.href} href={item.href} className={tabLink} aria-current={selected ? 'page' : undefined} scroll={false}>
            {item.label}
            {item.count !== undefined && item.count !== null ? (
              <span className={tabCount}>
                <span className="sr-only">(</span>
                {item.count}
                <span className="sr-only">)</span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
