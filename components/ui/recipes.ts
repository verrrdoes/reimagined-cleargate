import { cn } from './cn';
import type { PillTone } from './Pill';

/**
 * The shared kit as Tailwind class strings. Each recipe is the old class from the CSS kit, translated one to one,
 * so a page reads `className={panel()}` where it used to read `className="panel"`. Pass extra utilities through
 * cn() to adjust one use: `cn(button({ size: 'sm' }), 'w-full')`.
 *
 * Breakpoints: `max-lg:` is the old (max-width: 1023.98px) block and `max-sm:` the old (max-width: 639.98px) block.
 * Descendant rules (tables, kv, alerts) use `[&_th]:`-style variants, which outrank a plain utility on the child;
 * override one cell with an important utility (`text-right!`) rather than a plain one.
 */

/* ---------- Buttons ---------- */

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 h-control px-3 border border-control rounded-control bg-surface ' +
  'text-text text-14 font-medium leading-none whitespace-nowrap no-underline cursor-pointer select-none ' +
  'transition-[background-color,border-color,color] duration-120 ease-out ' +
  'hover:bg-raised hover:no-underline active:bg-active ' +
  'disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none ' +
  'aria-disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:pointer-events-none';

const BUTTON_VARIANT = {
  default: '',
  primary:
    'bg-ink border-ink text-ink-text hover:bg-ink-hover hover:border-ink-hover active:bg-ink-hover active:border-ink-hover',
  danger:
    'border-negative-line text-negative hover:bg-pill-overdue-bg hover:border-negative active:bg-pill-overdue-bg active:border-negative',
  ghost: 'border-transparent bg-transparent hover:bg-active',
} as const;

const BUTTON_SIZE = {
  sm: 'h-7 px-2.5 text-13',
  md: '',
  lg: 'h-10 px-4',
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANT;
export type ButtonSize = keyof typeof BUTTON_SIZE;

/** `.btn`, `.btn--primary|danger|ghost`, `.btn--sm|lg`, `.btn--block`. */
export function button({
  variant = 'default',
  size = 'md',
  block = false,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean } = {}): string {
  return cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], block && 'w-full');
}

/** `.icon-btn` (32px square, muted until hovered or expanded), `.icon-btn--sm` (28px). */
export function iconButton({ size = 'md' }: { size?: 'sm' | 'md' } = {}): string {
  return cn(
    'relative inline-grid place-items-center size-control p-0 border-0 rounded-control bg-transparent text-muted cursor-pointer',
    'hover:bg-active hover:text-text aria-expanded:bg-active aria-expanded:text-text',
    size === 'sm' && 'size-7',
  );
}

/** `.link-btn`: a button that looks like a link. Inside an alert add `text-inherit underline underline-offset-2`. */
export const linkButton =
  'inline p-0 border-0 bg-transparent text-accent cursor-pointer hover:underline hover:underline-offset-2';

/* ---------- Forms ---------- */

export const field = 'flex flex-col gap-1.5 min-w-0';
export const fieldRow = 'flex items-baseline justify-between gap-2';
export const fieldLabel = 'text-14 font-medium text-text';
export const fieldOptional = 'font-normal text-muted';
export const fieldHint = 'text-12 text-muted';
export const fieldError = 'text-12 text-negative';

const CONTROL =
  'block w-full h-control px-2.5 border border-control rounded-control bg-surface text-text text-14 leading-[1.4] ' +
  'transition-[border-color] duration-120 ease-out hover:border-muted ' +
  'focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-1 focus-visible:border-accent ' +
  'aria-invalid:border-negative disabled:bg-raised disabled:text-muted disabled:cursor-not-allowed';

/** `.input` (text, email, password, search, date, file). */
export const input = cn(
  CONTROL,
  'placeholder:text-muted placeholder:opacity-85',
  '[&[readonly]]:bg-raised [&[readonly]]:text-muted [&[readonly]]:cursor-not-allowed',
  '[&[type=file]]:h-auto [&[type=file]]:p-1.5',
);

/** `.select`: native select with the chevron from the `--chevron` token. */
export const select = cn(
  CONTROL,
  'appearance-none pr-8 bg-(image:--chevron) bg-no-repeat bg-[position:right_8px_center] bg-[length:16px_16px]',
);

/** `.textarea`. */
export const textarea = cn(CONTROL, 'h-auto min-h-24 py-2 leading-normal resize-y placeholder:text-muted placeholder:opacity-85');

/** `.input-wrap`: an input with a button inside its right edge (show password, clear search). */
export const inputWrap = 'relative [&>input]:pr-10';
export const inputWrapButton = 'absolute top-1/2 right-1 -translate-y-1/2';

/** `.check`: a label wrapping a checkbox or radio and its text. */
export const check =
  'inline-flex items-center gap-2 cursor-pointer select-none ' +
  '[&_input]:size-4 [&_input]:m-0 [&_input]:accent-accent [&_input]:cursor-pointer';

/** `.form-grid`: two columns, one below 640px. Full-width children take `formGridFull`. */
export const formGrid = 'grid grid-cols-2 gap-4 max-sm:grid-cols-1';
export const formGridFull = 'col-span-full';
export const formActions = 'flex flex-wrap items-center gap-2 mt-2';

/* ---------- Page structure inside the sheet ---------- */

/**
 * `.page-head`: the title on the left and actions on the right; below 640px the actions drop under the title.
 * The h1 needs no class. The subtitle takes `pageHeadSub` and the right-hand element `pageHeadActions` (a row of
 * buttons) or `pageHeadAside` (anything else), which places it beside both lines.
 */
export const pageHead = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 items-start mb-6 max-sm:grid-cols-1';
export const pageHeadSub = 'col-start-1 mt-1 text-muted';
export const pageHeadAside =
  'col-start-2 row-[1/span_2] justify-self-end max-sm:col-start-1 max-sm:row-auto max-sm:justify-self-start max-sm:mt-2';
export const pageHeadActions = cn(pageHeadAside, 'flex flex-wrap items-center justify-end gap-2 print:hidden');

export const backLink = 'inline-flex items-center gap-1 mb-2 text-muted font-medium hover:text-text';

export const section = 'mt-8';
export const sectionHead = 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3';

/** `.toolbar`: search, selects and filters above a list. */
export const toolbar = 'flex flex-wrap items-center gap-x-3 gap-y-2 mb-4';
/** The search input (or its wrapper) in a toolbar: 300px, full width below 640px. */
export const toolbarSearch = 'w-[min(300px,100%)] max-sm:w-full';
export const toolbarSelect = 'w-auto min-w-[140px]';
export const toolbarEnd = 'ml-auto';
export const toolbarCount = 'ml-auto text-muted whitespace-nowrap';

/* ---------- Panels and data ---------- */

/** `.panel`, `.panel--raised`. */
export function panel({ raised = false }: { raised?: boolean } = {}): string {
  return cn('bg-surface border border-border rounded-card p-4', raised && 'bg-raised border-transparent');
}
export const panelHead = 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3';
export const panelSub = 'mt-0.5 text-muted';

export const kpis = 'grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-6';
export const kpi = 'flex flex-col gap-1 min-w-0 p-4 border border-border rounded-card bg-surface';
export const kpiLabel = 'text-14 font-semibold';
export const kpiValue = 'text-28 font-normal leading-[1.2] tabular-nums';
export const kpiMeta = 'text-12 text-muted';

/** `.kv`: a definition list of label and value pairs; one column below 640px. */
export const kv =
  'grid grid-cols-[minmax(120px,max-content)_minmax(0,1fr)] gap-x-4 gap-y-2 ' +
  '[&_dt]:text-muted [&_dd]:min-w-0 [&_dd]:wrap-anywhere ' +
  'max-sm:grid-cols-1 max-sm:gap-0.5 max-sm:[&_dd+dt]:mt-2';

/** `.split`: main column and a 320px side column; stacked below 1024px. */
export const split = 'grid grid-cols-[minmax(0,1fr)_320px] gap-6 items-start max-lg:grid-cols-1';

/* ---------- Tables ---------- */

export const tableWrap = 'w-full overflow-x-auto print:overflow-visible';

/** `.table`: header and cell styling comes from here, so th and td need no classes of their own. */
export const table =
  'w-full border-collapse text-14 ' +
  '[&_th]:px-3 [&_th]:pt-0 [&_th]:pb-2 [&_th]:text-12 [&_th]:font-medium [&_th]:text-muted [&_th]:text-left ' +
  '[&_th]:align-bottom [&_th]:whitespace-nowrap ' +
  '[&_td]:h-row [&_td]:px-3 [&_td]:py-2.5 [&_td]:border-t [&_td]:border-rule [&_td]:align-middle ' +
  '[&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0 ' +
  '[&_tr[data-href]]:cursor-pointer [&_tr[data-href]:hover_td]:bg-raised print:[&_tr]:break-inside-avoid';
/** `.table--hover`: highlight every body row on hover, not only linked rows. */
export const tableHover = '[&_tbody_tr:hover_td]:bg-raised';
/** `.num` in a table: right-aligned tabular figures (th or td). */
export const numCell = 'text-right! tabular-nums';
/** `.actions` in a table: the shrink-to-fit buttons column. */
export const actionsCell = 'w-[1%] text-right! whitespace-nowrap';
export const tablePrimary = 'font-medium text-text';
export const tableSecondary = 'block text-12 text-muted';
export const tableFoot =
  'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-3 border-t border-rule text-muted';

/* ---------- Alerts, pills, badges ---------- */

export type AlertTone = 'info' | 'success' | 'warning' | 'action' | 'error';

const ALERT_TONE: Record<AlertTone, string> = {
  info: 'bg-pill-info-bg text-pill-info-fg',
  success: 'bg-pill-approved-bg text-pill-approved-fg',
  warning: 'bg-pill-pending-bg text-pill-pending-fg',
  action: 'bg-pill-action-bg text-pill-action-fg',
  error: 'bg-pill-overdue-bg text-pill-overdue-fg',
};

/** `.alert`, `.alert--success|warning|action|error` (info is the default). Links inside take the alert's colour. */
export function alert(tone: AlertTone = 'info'): string {
  return cn(
    'flex items-start gap-2.5 px-3 py-2.5 rounded-card text-14 [&>svg]:mt-0.5',
    '[&_a]:text-inherit [&_a]:underline [&_a]:underline-offset-2',
    ALERT_TONE[tone],
  );
}
export const alertBody = 'flex flex-col gap-1 min-w-0';

const PILL_TONE: Record<PillTone, string> = {
  action: 'bg-pill-action-bg text-pill-action-fg',
  pending: 'bg-pill-pending-bg text-pill-pending-fg',
  approved: 'bg-pill-approved-bg text-pill-approved-fg',
  overdue: 'bg-pill-overdue-bg text-pill-overdue-fg',
  info: 'bg-pill-info-bg text-pill-info-fg',
  muted: 'bg-pill-muted-bg text-pill-muted-fg',
};

/** `.pill`, `.pill--<tone>`. Prefer the <Pill> component; this is for elements that are not a plain span. */
export function pill(tone: PillTone = 'muted'): string {
  return cn(
    'inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-12 font-medium leading-none whitespace-nowrap align-middle',
    PILL_TONE[tone],
  );
}

export const countBadge =
  'inline-grid place-items-center min-w-5 h-5 px-1.5 rounded-full bg-accent text-on-accent ' +
  'text-12 font-semibold leading-none tabular-nums';

/** `.text-action|pending|approved|overdue|info|muted`. */
export const textTone: Record<PillTone, string> = {
  action: 'text-action-line',
  pending: 'text-warning',
  approved: 'text-positive',
  overdue: 'text-negative',
  info: 'text-accent',
  muted: 'text-muted',
};

/* ---------- Tabs and filter chips ---------- */

export const tabs =
  'flex gap-6 mb-6 border-b border-border overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
export const tabLink =
  'inline-flex items-center gap-1.5 h-10 -mb-px border-b-2 border-transparent text-muted font-medium whitespace-nowrap ' +
  'no-underline hover:text-text hover:no-underline ' +
  'aria-[current=page]:text-text aria-[current=page]:font-semibold aria-[current=page]:border-accent';
export const tabCount = 'text-12 font-medium text-muted tabular-nums';

/** `.chips` / `.chip`: links that set a ?filter=; the current one carries aria-current="true". */
export const chips = 'flex flex-wrap gap-2';
export const chip =
  'inline-flex items-center gap-1.5 h-7 px-3 border border-border rounded-full bg-surface text-muted text-13 font-medium ' +
  'whitespace-nowrap no-underline transition-[border-color,color] duration-120 ease-out ' +
  'hover:border-control hover:text-text hover:no-underline ' +
  'aria-[current=true]:border-transparent aria-[current=true]:bg-pill-info-bg aria-[current=true]:text-pill-info-fg ' +
  'aria-[current=true]:font-semibold';
export const chipCount = 'text-12 tabular-nums';

/* ---------- Loading and progress ---------- */

export const spinner =
  'inline-block size-4 shrink-0 border-2 border-current border-r-transparent rounded-full animate-spinner';
export const pageLoading = 'flex items-center gap-2.5 min-h-40 text-muted';
export const progress = 'h-1.5 rounded-full bg-active overflow-hidden';
export const progressBar = 'h-full rounded-[inherit] bg-positive transition-[width] duration-300 ease-out';

/* ---------- Popovers and menus (bell, account menu) ---------- */

export const popoverAnchor = 'relative';
/** `.popover`: anchored under its trigger; below 640px it spans the screen under the top bar. */
export const popover =
  'absolute top-[calc(100%+6px)] right-0 z-50 w-[360px] max-w-[calc(100vw-16px)] border border-border rounded-card ' +
  'bg-surface text-text shadow-overlay ' +
  'max-sm:fixed max-sm:top-[calc(var(--topbar-h)+4px)] max-sm:right-2 max-sm:left-2 max-sm:w-auto max-sm:max-w-none';
export const popoverMenu = cn(popover, 'w-[248px] p-1');
export const popoverHead = 'flex items-center justify-between gap-2 px-4 py-3 border-b border-rule';
export const menuHead = 'flex flex-col gap-0.5 min-w-0 px-2.5 pt-2 pb-2.5 mb-1 border-b border-rule';
export const menuHeadName = 'font-semibold';
export const menuHeadLine = 'text-12 text-muted';
export const menuItem =
  'flex items-center gap-2.5 w-full h-[34px] px-2.5 border-0 rounded-control bg-transparent text-text text-14 ' +
  'text-left no-underline cursor-pointer hover:bg-raised hover:no-underline [&>svg]:text-muted';

/* ---------- Small pieces ---------- */

/** `kbd` / `.kbd`. Put it on every <kbd>; there is no element rule any more. */
export const kbd =
  'inline-flex items-center h-5 px-1.5 border border-border rounded-[4px] bg-surface text-muted font-sans text-11 ' +
  'font-medium leading-none';
/** `.mono`: IDs and reference numbers. */
export const mono = 'font-code text-[0.95em] tabular-nums';
