'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from './Icon';
import { iconButton, textTone } from './recipes';

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; kind: ToastKind; message: string };

export type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const HIDE_AFTER_MS = 5000;
const MAX_SHOWN = 3;

const KIND_ICON: Record<ToastKind, { name: IconName; className: string }> = {
  success: { name: 'check-circle', className: textTone.approved },
  error: { name: 'alert', className: textTone.overdue },
  info: { name: 'info', className: textTone.info },
};

/** Mounted once in the root layout. Toasts hide after 5 seconds; errors are announced assertively. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((list) => list.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const text = String(message ?? '').trim();
      if (!text) return;
      seq.current += 1;
      const id = seq.current;
      setItems((list) => [...list, { id, kind, message: text }].slice(-MAX_SHOWN));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), HIDE_AFTER_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  const polite = items.filter((t) => t.kind !== 'error');
  const urgent = items.filter((t) => t.kind === 'error');

  const render = (t: ToastItem) => (
    <div
      key={t.id}
      className={
        'flex items-start gap-2.5 py-3 pr-2 pl-3.5 border border-border rounded-card bg-surface text-text shadow-overlay ' +
        'pointer-events-auto animate-toast-in'
      }
    >
      <Icon name={KIND_ICON[t.kind].name} size={18} className={cn('mt-0.5', KIND_ICON[t.kind].className)} />
      <p className="flex-auto min-w-0 pt-px wrap-anywhere">{t.message}</p>
      <button type="button" className={cn(iconButton({ size: 'sm' }), '-my-1 mx-0')} aria-label="Dismiss" onClick={() => dismiss(t.id)}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );

  return (
    <ToastContext value={api}>
      {children}
      <div
        className={
          'fixed right-4 bottom-4 z-300 flex flex-col gap-2 w-[min(380px,calc(100vw-32px))] pointer-events-none ' +
          'max-sm:right-2 max-sm:left-2 max-sm:bottom-2 max-sm:w-auto print:hidden!'
        }
      >
        <div role="alert" aria-live="assertive" className="flex flex-col gap-2">
          {urgent.map(render)}
        </div>
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          {polite.map(render)}
        </div>
      </div>
    </ToastContext>
  );
}

/** `const toast = useToast(); toast.success('Saved.'); toast.error(result.error.message);` */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast() needs <ToastProvider> above it (it is in the root layout).');
  return ctx;
}
