import type { ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from './Icon';

/** Says what will appear here and why it is empty now. `action` is an optional button or link. */
export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-1.5 px-4 py-12 text-center text-muted', className)}>
      {icon ? <Icon name={icon} size={24} className="mb-1.5" /> : null}
      <p className="text-text text-14 font-semibold">{title}</p>
      {body ? <p className="max-w-[52ch]">{body}</p> : null}
      {action ? <div className="mt-2.5">{action}</div> : null}
    </div>
  );
}
