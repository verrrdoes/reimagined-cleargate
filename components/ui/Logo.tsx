import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import logoOnDark from '@/public/img/logo-on-dark.png';
import logoOnLight from '@/public/img/logo-on-light.png';
import markOnDark from '@/public/img/logo-mark-on-dark.png';
import markOnLight from '@/public/img/logo-mark-on-light.png';
import { cn } from './cn';

/**
 * The logo pictures (the legacy logo redrawn with clean shapes, its chrome shading and an even glow), one per theme:
 * white and blue for the dark theme, ink and blue for the light theme and print. The hidden one is display:none,
 * so screen readers only meet the visible one.
 */
function ThemedImage({
  light,
  dark,
  width,
  height,
  alt,
  className,
}: {
  light: StaticImageData;
  dark: StaticImageData;
  width: number;
  height: number;
  alt: string;
  className?: string;
}) {
  return (
    <>
      <Image src={light} width={width} height={height} alt={alt} loading="eager" className={cn('shrink-0 dark:hidden print:block!', className)} />
      <Image src={dark} width={width} height={height} alt={alt} loading="eager" className={cn('hidden shrink-0 dark:block print:hidden!', className)} />
    </>
  );
}

/** The ClearGate mark: the "G" with the door. */
export function LogoMark({ size = 24, className, title }: { size?: number; className?: string; title?: string }) {
  return <ThemedImage light={markOnLight} dark={markOnDark} width={size} height={size} alt={title ?? ''} className={className} />;
}

/** The full logo: the mark above the "ClearGate" name. */
export function FullLogo({ width = 208, className }: { width?: number; className?: string }) {
  const height = Math.round((width * logoOnLight.height) / logoOnLight.width);
  return <ThemedImage light={logoOnLight} dark={logoOnDark} width={width} height={height} alt="ClearGate" className={className} />;
}

/** Mark plus the "ClearGate" wordmark. With `href` it is a link (e.g. to the portal home). */
export function Logo({
  size = 24,
  wordmark = true,
  href,
  className,
}: {
  size?: number;
  wordmark?: boolean;
  href?: string;
  className?: string;
}) {
  const cls = cn('inline-flex items-center gap-2 text-text no-underline hover:no-underline', className);
  const inner = (
    <>
      <LogoMark size={size} />
      {wordmark ? <span className="text-16 font-semibold tracking-[-0.01em]">ClearGate</span> : <span className="sr-only">ClearGate</span>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return <span className={cls}>{inner}</span>;
}
