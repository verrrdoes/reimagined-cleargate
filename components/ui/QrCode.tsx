import { qrModules, qrPath } from '@/lib/qr';
import { cn } from './cn';

const QUIET = 2;

/** A QR code as an SVG: always dark on white, whatever the theme, so phones can read it. */
export function QrCode({ value, size = 120, label, className }: { value: string; size?: number; label: string; className?: string }) {
  const modules = qrModules(value);
  const dim = modules.length + 2 * QUIET;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${dim} ${dim}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn('shrink-0 rounded-[4px] bg-white', className)}
    >
      <path d={qrPath(modules, QUIET)} fill="#111827" />
    </svg>
  );
}
