'use client';

import { useState } from 'react';
import { cn } from './cn';
import { initialsOf } from './initials';

const AVATAR =
  'inline-grid place-items-center shrink-0 overflow-hidden rounded-full bg-active text-text font-semibold leading-none ' +
  'object-cover select-none';

/**
 * A round avatar: the photo when `url` is set (and loads), otherwise initials.
 * Decorative by default, because the name is shown next to it; pass `decorative={false}` when it stands alone.
 */
export function Avatar({
  name,
  url,
  size = 32,
  className,
  decorative = true,
}: {
  name: string;
  url?: string | null;
  size?: number;
  className?: string;
  decorative?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const cls = cn(AVATAR, className);
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };

  if (url && failedUrl !== url) {
    return (
      // An authenticated file route, so the image optimiser (which has no session) cannot fetch it.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={decorative ? '' : name}
        width={size}
        height={size}
        className={cls}
        style={style}
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(url)}
      />
    );
  }
  return (
    <span className={cls} style={style} aria-hidden={decorative ? true : undefined} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : name}>
      {initialsOf(name)}
    </span>
  );
}
