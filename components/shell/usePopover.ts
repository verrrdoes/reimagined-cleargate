'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Open state for a disclosure popover (bell, account menu): closes on a press outside, on Escape
 * (returning focus to the button) and when focus leaves it.
 */
export function usePopover<B extends HTMLElement = HTMLButtonElement>() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<B>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onFocus = (e: FocusEvent) => {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open]);

  return { open, setOpen, wrapRef, buttonRef };
}
