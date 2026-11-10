import { Icon, type IconName } from './Icon';

const OFFICE_GLYPHS: Record<string, IconName> = {
  book: 'book',
  wallet: 'wallet',
  file: 'file',
  heart: 'heart',
  cap: 'cap',
  box: 'box',
};

/** An office's icon from its `icon` column (book, wallet, file, heart, cap, box). Unknown keys show a file. */
export function OfficeIcon({
  icon,
  size = 16,
  className,
  label,
}: {
  icon: string | null | undefined;
  size?: number;
  className?: string;
  label?: string;
}) {
  const name = (icon && OFFICE_GLYPHS[icon]) || 'file';
  return <Icon name={name} size={size} className={className} label={label} />;
}
