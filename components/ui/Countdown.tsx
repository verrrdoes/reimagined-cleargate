'use client';

import { countdownParts } from '@/lib/deadline';
import { prettyDue } from '@/lib/time';
import { useNow } from './clock';
import { cn } from './cn';
import { countdownClasses } from './countdownClasses';

const twoDigits = (n: number) => (n < 10 ? `0${n}` : String(n));

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Days, hours, minutes and seconds until `due`, ticking each second. Stops at zero once the time has passed. */
export function Countdown({
  due,
  serverNow,
  label,
  className,
}: {
  due: string;
  serverNow: string;
  /** What the countdown is for, read by screen readers, e.g. "Time left to finish your clearance". */
  label?: string;
  className?: string;
}) {
  const now = useNow(1000, serverNow);
  const raw = Date.parse(due) - now;
  const left = Number.isFinite(raw) ? raw : 0;
  const over = left <= 0;
  const p = countdownParts(left);
  const cells = [
    { key: 'days', value: String(p.days), label: p.days === 1 ? 'Day' : 'Days' },
    { key: 'hours', value: twoDigits(p.hours), label: p.hours === 1 ? 'Hour' : 'Hours' },
    { key: 'minutes', value: twoDigits(p.minutes), label: p.minutes === 1 ? 'Minute' : 'Minutes' },
    { key: 'seconds', value: twoDigits(p.seconds), label: p.seconds === 1 ? 'Second' : 'Seconds' },
  ];
  const spoken = over
    ? `The deadline, ${prettyDue(due)}, has passed.`
    : `${plural(p.days, 'day', 'days')}, ${plural(p.hours, 'hour', 'hours')} and ${plural(p.minutes, 'minute', 'minutes')} left, until ${prettyDue(due)}.`;

  return (
    <div
      className={cn(countdownClasses.root, className)}
      role="timer"
      aria-label={label ?? `Time left until ${prettyDue(due)}`}
    >
      {cells.map((c) => (
        <span key={c.key} className={countdownClasses.cell} aria-hidden="true">
          <span className={cn(countdownClasses.value, over && 'text-negative')}>{c.value}</span>
          <span className={countdownClasses.label}>{c.label}</span>
        </span>
      ))}
      <span className="sr-only">{spoken}</span>
    </div>
  );
}
