import {
  AlarmClock,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Ban,
  Bell,
  BookOpen,
  Building,
  Calendar,
  Camera,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Download,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FolderCheck,
  Funnel,
  GraduationCap,
  HeartHandshake,
  Hourglass,
  Image as ImageIcon,
  Inbox,
  Info,
  KeyRound,
  LayoutGrid,
  ListChecks,
  LoaderCircle,
  Lock,
  LockOpen,
  LogOut,
  Mail,
  MailCheck,
  Maximize2,
  Megaphone,
  Menu,
  MessageCircle,
  MessagesSquare,
  Moon,
  Package,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  RotateCcwClock,
  Save,
  ScrollText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SquarePen,
  Stamp,
  Sun,
  Timer,
  Trash,
  TriangleAlert,
  Undo,
  Upload,
  User,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';

/**
 * Icon set. The first group keeps the legacy keys (HANDOFF §10.4) so ported markup maps one to one;
 * the rest are extras used by the shell and feature pages.
 */
const ICONS = {
  // Legacy keys
  book: BookOpen,
  wallet: Wallet,
  file: FileText,
  heart: HeartHandshake,
  cap: GraduationCap,
  box: Package,
  alert: CircleAlert,
  clock: Clock,
  check: Check,
  arrow: ArrowRight,
  external: ArrowUpRight,
  shield: ShieldCheck,
  lock: Lock,
  unlock: LockOpen, // taste-skill-ignore: icon key, not copy
  mail: Mail,
  search: Search,
  download: Download,
  upload: Upload,
  expand: Maximize2,
  undo: Undo,
  send: Send,
  bell: Bell,
  user: User,
  camera: Camera,
  x: X,
  message: MessageCircle,
  phone: Phone,
  // Extras
  'alarm': AlarmClock,
  'arrow-left': ArrowLeft,
  'ban': Ban,
  'building': Building,
  'calendar': Calendar,
  'chart': ChartColumn,
  'check-circle': CircleCheck,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'clipboard': ClipboardList,
  'clipboard-check': ClipboardCheck,
  'edit': SquarePen,
  'eye': Eye,
  'eye-off': EyeOff,
  'filter': Funnel,
  'folder-check': FolderCheck,
  'grid': LayoutGrid,
  'history': RotateCcwClock,
  'hourglass': Hourglass,
  'image': ImageIcon,
  'inbox': Inbox,
  'info': Info,
  'key': KeyRound,
  'link-out': ExternalLink,
  'list-checks': ListChecks,
  'loader': LoaderCircle,
  'logout': LogOut,
  'mail-check': MailCheck,
  'megaphone': Megaphone,
  'menu': Menu,
  'messages': MessagesSquare,
  'moon': Moon,
  'more': Ellipsis,
  'more-vertical': EllipsisVertical,
  'paperclip': Paperclip,
  'pencil': Pencil,
  'plus': Plus,
  'print': Printer,
  'refresh': RefreshCw,
  'rotate': RotateCcw,
  'save': Save,
  'scroll': ScrollText,
  'settings': Settings,
  'stamp': Stamp,
  'sun': Sun,
  'timer': Timer,
  'trash': Trash,
  'user-check': UserCheck,
  'user-plus': UserPlus,
  'user-x': UserX,
  'users': Users,
  'warning': TriangleAlert,
  'x-circle': CircleX,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export function isIconName(value: string): value is IconName {
  return Object.prototype.hasOwnProperty.call(ICONS, value);
}

type IconProps = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Gives the icon an accessible name. Without it the icon is decorative (aria-hidden). */
  label?: string;
};

export function Icon({ name, size = 16, strokeWidth = 1.75, className, label }: IconProps) {
  const Glyph = ICONS[name] ?? ICONS.file;
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      focusable="false"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}
