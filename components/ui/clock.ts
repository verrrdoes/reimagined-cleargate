'use client';

import { useSyncExternalStore } from 'react';

/*
 * A shared ticking clock for deadline badges and countdowns.
 *
 * The server renders with the `serverNow` it was given, the first client render matches it (no hydration
 * mismatch), and after hydration the value follows the device clock corrected by the server's offset.
 * One interval per period serves every component that uses that period.
 */

let skewMs = 0;

/** Records the server's clock from a fresh response, so countdowns follow the server rather than a wrong device clock. */
export function syncServerClock(serverNowIso: string): void {
  const server = Date.parse(serverNowIso);
  if (Number.isFinite(server)) skewMs = server - Date.now();
}

type Clock = { now: number; listeners: Set<() => void>; timer: ReturnType<typeof setInterval> | null };

const clocks = new Map<number, Clock>();

const read = (period: number) => Math.floor((Date.now() + skewMs) / period) * period;

function clockFor(period: number): Clock {
  let clock = clocks.get(period);
  if (!clock) {
    clock = { now: read(period), listeners: new Set(), timer: null };
    clocks.set(period, clock);
  }
  return clock;
}

function subscribeTo(period: number) {
  return (listener: () => void) => {
    const clock = clockFor(period);
    clock.listeners.add(listener);
    if (clock.timer === null) {
      const tick = () => {
        const next = read(period);
        if (next !== clock.now) {
          clock.now = next;
          for (const l of clock.listeners) l();
        }
      };
      tick();
      clock.timer = setInterval(tick, Math.max(250, Math.min(period / 4, 5000)));
    }
    return () => {
      clock.listeners.delete(listener);
      if (clock.listeners.size === 0 && clock.timer !== null) {
        clearInterval(clock.timer);
        clock.timer = null;
      }
    };
  };
}

const subscribers = new Map<number, (listener: () => void) => () => void>();

function subscriber(period: number) {
  let s = subscribers.get(period);
  if (!s) {
    s = subscribeTo(period);
    subscribers.set(period, s);
  }
  return s;
}

/**
 * The current time in ms, rounded down to `periodMs`, re-rendering when it moves on.
 * `serverNow` (ISO) is what the server rendered with; it is used for the server render and hydration.
 */
export function useNow(periodMs: number, serverNow: string): number {
  return useSyncExternalStore(
    subscriber(periodMs),
    () => clockFor(periodMs).now,
    () => {
      const t = Date.parse(serverNow);
      return Number.isFinite(t) ? t : 0;
    },
  );
}
