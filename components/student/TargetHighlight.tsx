'use client';

import { useEffect } from 'react';

/**
 * Highlights the element named by the URL hash (`#office-registrar`) and scrolls it into view. CSS
 * `:target` alone misses hashes set by client navigation, so the element also gets `data-targeted`.
 * Renders nothing.
 */
export function TargetHighlight({ prefix }: { prefix: string }) {
  useEffect(() => {
    let current: HTMLElement | null = null;

    const apply = () => {
      const raw = window.location.hash.replace(/^#/, '');
      let id = raw;
      try {
        id = decodeURIComponent(raw);
      } catch {
        // A malformed escape: look the hash up as written.
      }
      current?.removeAttribute('data-targeted');
      current = null;
      if (!id.startsWith(prefix)) return;
      const el = document.getElementById(id);
      if (!el) return;
      el.setAttribute('data-targeted', 'true');
      current = el;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    };

    apply();
    // After a client navigation the router may write the URL (with its hash) just after this effect runs.
    const frame = window.requestAnimationFrame(() => {
      if (!current) apply();
    });
    window.addEventListener('hashchange', apply);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', apply);
      current?.removeAttribute('data-targeted');
    };
  }, [prefix]);

  return null;
}
