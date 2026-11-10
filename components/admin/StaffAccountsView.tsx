'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type MouseEvent } from 'react';
import { Avatar, Dialog, EmptyState, Icon, Pill, useToast } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import {
  actionsCell,
  alert,
  alertBody,
  button,
  chip,
  chipCount,
  chips as chipList,
  field,
  fieldHint,
  fieldLabel,
  fieldOptional,
  formGrid,
  formGridFull,
  iconButton,
  input,
  kpi,
  kpiLabel,
  kpiMeta,
  kpiValue,
  kpis,
  kv,
  menuItem,
  pageHead,
  pageHeadActions,
  pageHeadSub,
  section,
  select,
  spinner,
  table,
  tableFoot,
  tablePrimary,
  tableSecondary,
  tableWrap,
  toolbar,
} from '@/components/ui/recipes';
import { resetStaffPassword, saveStaff, setStaffStatus } from '@/lib/actions/staff';
import type { StaffAccount, StaffOfficeOption } from '@/lib/services/staff';
import { formatDate } from '@/lib/time';
import { ConfirmDialog } from './ConfirmDialog';
import { count, plural } from './format';

export type StaffShow = 'all' | 'active' | 'off';

/**
 * `total`, `admins`, `activeTotal` and `offTotal` count every account (the KPIs); `all`, `active` and `off`
 * count the accounts matching the search (the filter chips).
 */
export type StaffCounts = { total: number; admins: number; activeTotal: number; offTotal: number; all: number; active: number; off: number };

type TempShown = { name: string; email: string; password: string; self: boolean };

// The row menu is fixed to the viewport (w-52 = 208px) so the scrolling table wrapper can't clip it.
const MENU_WIDTH = 208;
const MENU_ITEM_H = 34;

const FIELD_FULL = cn(field, formGridFull);

/** Staff accounts: KPIs, filter chips, the account table with a row menu, and the account dialogs. */
export function StaffAccountsView({
  accounts,
  offices,
  meId,
  show,
  q,
  counts,
}: {
  /** Already filtered by ?q= and ?show=. */
  accounts: StaffAccount[];
  offices: StaffOfficeOption[];
  meId: number;
  show: StaffShow;
  q: string;
  counts: StaffCounts;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<{ account: StaffAccount | null } | null>(null);
  const [resetting, setResetting] = useState<StaffAccount | null>(null);
  const [toggling, setToggling] = useState<StaffAccount | null>(null);
  const [temp, setTemp] = useState<TempShown | null>(null);
  const [menu, setMenu] = useState<{ id: number; top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement | null>(null);

  const menuAccount = menu ? (accounts.find((a) => a.id === menu.id) ?? null) : null;

  // The row menu closes on a press outside, Escape (focus back to its button), scrolling and resizing.
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || menuButton.current?.contains(t)) return;
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenu(null);
      menuButton.current?.focus();
    };
    const onFocus = (e: FocusEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || menuButton.current?.contains(t)) return;
      setMenu(null);
    };
    const onMove = () => setMenu(null);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [menu]);

  function toggleMenu(e: MouseEvent<HTMLButtonElement>, a: StaffAccount) {
    if (menu?.id === a.id) {
      setMenu(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const items = a.id === meId ? 2 : 3;
    const height = items * MENU_ITEM_H + 10;
    const left = Math.max(8, Math.min(window.innerWidth - MENU_WIDTH - 8, r.right - MENU_WIDTH));
    const below = r.bottom + 4;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 4) : below;
    menuButton.current = e.currentTarget;
    setMenu({ id: a.id, top, left });
  }

  function pick(action: () => void) {
    setMenu(null);
    action();
  }

  async function confirmReset() {
    if (!resetting) return;
    const res = await resetStaffPassword({ id: resetting.id });
    setResetting(null);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    setTemp({ name: res.data.name, email: res.data.email, password: res.data.tempPassword, self: res.data.self });
  }

  async function confirmToggle() {
    if (!toggling) return;
    const res = await setStaffStatus({ id: toggling.id, active: !toggling.isActive });
    setToggling(null);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    toast.success(res.data.active ? `${res.data.name} can sign in again.` : `${res.data.name} is turned off.`);
  }

  const chipHref = (s: StaffShow) => {
    const params = new URLSearchParams();
    if (s !== 'all') params.set('show', s);
    if (q) params.set('q', q);
    const qs = params.toString();
    return qs ? `/staff-accounts?${qs}` : '/staff-accounts';
  };
  const chips: { key: StaffShow; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: counts.all },
    { key: 'active', label: 'Active', n: counts.active },
    { key: 'off', label: 'Turned off', n: counts.off },
  ];
  const filtered = Boolean(q) || show !== 'all';

  return (
    <>
      <div className={pageHead}>
        <h1>Staff accounts</h1>
        <p className={pageHeadSub}>Office staff and administrators who sign in on the staff portal.</p>
        <div className={pageHeadActions}>
          <button type="button" className={button({ variant: 'primary' })} onClick={() => setEditing({ account: null })}>
            <Icon name="user-plus" />
            Create account
          </button>
        </div>
      </div>

      <div className={kpis}>
        <div className={kpi}>
          <span className={kpiLabel}>Accounts</span>
          <span className={kpiValue}>{count(counts.total)}</span>
          <span className={kpiMeta}>{plural(counts.admins, 'administrator')}</span>
        </div>
        <div className={kpi}>
          <span className={kpiLabel}>Active</span>
          <span className={kpiValue}>{count(counts.activeTotal)}</span>
          <span className={kpiMeta}>Can sign in</span>
        </div>
        <div className={kpi}>
          <span className={kpiLabel}>Turned off</span>
          <span className={kpiValue}>{count(counts.offTotal)}</span>
          <span className={kpiMeta}>Can&apos;t sign in</span>
        </div>
      </div>

      <section className={section} aria-label="Accounts">
        <nav className={cn(toolbar, chipList)} aria-label="Filter by status">
          {chips.map((c) => (
            <Link key={c.key} href={chipHref(c.key)} className={chip} aria-current={show === c.key ? 'true' : undefined} scroll={false}>
              {c.label} <span className={chipCount}>{count(c.n)}</span>
            </Link>
          ))}
        </nav>

        {accounts.length === 0 ? (
          <EmptyState
            icon="users"
            title="No accounts match."
            body={q ? `Nothing matches “${q}” with this filter.` : 'No account has this status.'}
            action={
              filtered ? (
                <Link className={button()} href="/staff-accounts" scroll={false}>
                  Show every account
                </Link>
              ) : null
            }
          />
        ) : (
          <>
            <div className={tableWrap}>
              <table className={table}>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Office</th>
                    <th scope="col">Status</th>
                    <th scope="col" className={actionsCell}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => {
                    const self = a.id === meId;
                    return (
                      <tr key={a.id}>
                        <td>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar name={a.name} url={a.avatarUrl} size={32} />
                            <div className="min-w-0">
                              <span className={tablePrimary}>
                                {a.name}
                                {self ? <span className="text-muted"> (you)</span> : null}
                              </span>
                              <span className={cn(tableSecondary, 'truncate')}>{a.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          {a.role === 'admin' ? (
                            <span>Administrator</span>
                          ) : a.officeName ? (
                            <span>{a.officeName}</span>
                          ) : (
                            <span className="text-muted">No office</span>
                          )}
                          {a.position ? <span className={tableSecondary}>{a.position}</span> : null}
                        </td>
                        <td>
                          {!a.isActive ? (
                            <Pill tone="muted">Turned off</Pill>
                          ) : a.mustChangePassword ? (
                            <Pill tone="pending">Temporary password</Pill>
                          ) : (
                            <Pill tone="approved">Active</Pill>
                          )}
                          <span className={tableSecondary}>
                            {a.lastLoginAt ? `Last sign-in: ${formatDate(a.lastLoginAt)}` : 'Never signed in'}
                          </span>
                        </td>
                        <td className={actionsCell}>
                          <button
                            type="button"
                            className={iconButton()}
                            aria-label={`Actions for ${a.name}`}
                            aria-expanded={menu?.id === a.id}
                            aria-controls={menu?.id === a.id ? 'staff-row-menu' : undefined}
                            onClick={(e) => toggleMenu(e, a)}
                          >
                            <Icon name="more-vertical" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={tableFoot}>
              Showing {count(accounts.length)} of {plural(counts.total, 'account')}
            </p>
          </>
        )}
      </section>

      {menu && menuAccount ? (
        <div
          id="staff-row-menu"
          ref={menuRef}
          className="fixed z-60 w-52 p-1 border border-border rounded-card bg-surface text-text shadow-overlay"
          style={{ top: menu.top, left: menu.left }}
        >
          <button type="button" className={menuItem} onClick={() => pick(() => setEditing({ account: menuAccount }))}>
            <Icon name="edit" />
            Edit
          </button>
          <button type="button" className={menuItem} onClick={() => pick(() => setResetting(menuAccount))}>
            <Icon name="key" />
            Reset password
          </button>
          {menuAccount.id === meId ? null : menuAccount.isActive ? (
            <button type="button" className={cn(menuItem, 'text-negative [&>svg]:text-negative')} onClick={() => pick(() => setToggling(menuAccount))}>
              <Icon name="user-x" />
              Turn off
            </button>
          ) : (
            <button type="button" className={menuItem} onClick={() => pick(() => setToggling(menuAccount))}>
              <Icon name="user-check" />
              Turn on
            </button>
          )}
        </div>
      ) : null}

      <StaffDialog
        open={editing !== null}
        account={editing?.account ?? null}
        offices={offices}
        meId={meId}
        onClose={() => setEditing(null)}
        onCreated={(shown) => setTemp(shown)}
      />

      <ConfirmDialog
        open={resetting !== null}
        onClose={() => setResetting(null)}
        title={resetting ? (resetting.id === meId ? 'Reset your password?' : `Reset ${resetting.name}’s password?`) : ''}
        body={
          resetting?.id === meId
            ? "Your current password stops working. You'll get a temporary one, then choose a new password."
            : "Their current password stops working. You'll get a temporary one to give them."
        }
        confirmLabel="Reset password"
        onConfirm={confirmReset}
      />

      <ConfirmDialog
        open={toggling !== null}
        onClose={() => setToggling(null)}
        title={toggling ? `${toggling.isActive ? 'Turn off' : 'Turn on'} ${toggling.name}’s account?` : ''}
        body={
          toggling?.isActive
            ? "They are signed out and can't sign in until you turn the account back on. Their review history is kept."
            : 'They will be able to sign in again with their current password.'
        }
        confirmLabel={toggling?.isActive ? 'Turn off' : 'Turn on'}
        danger={Boolean(toggling?.isActive)}
        onConfirm={confirmToggle}
      />

      <TempPasswordDialog
        shown={temp}
        onClose={() => {
          const self = temp?.self ?? false;
          setTemp(null);
          // Your own reset: the next render sends you to choose a new password.
          if (self) router.refresh();
        }}
      />
    </>
  );
}

function StaffDialog({
  open,
  account,
  offices,
  meId,
  onClose,
  onCreated,
}: {
  open: boolean;
  account: StaffAccount | null;
  offices: StaffOfficeOption[];
  meId: number;
  onClose: () => void;
  onCreated: (shown: TempShown) => void;
}) {
  const toast = useToast();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<'staff' | 'admin'>('staff');
  const [seen, setSeen] = useState<{ open: boolean; account: StaffAccount | null }>({ open, account });
  const isNew = account === null;
  const self = account?.id === meId;

  if (seen.open !== open || seen.account !== account) {
    setSeen({ open, account });
    if (open) {
      setError(null);
      setRole(account?.role ?? 'staff');
    }
  }

  const close = () => {
    if (!pending) onClose();
  };

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fullName = String(fd.get('fullName') ?? '').trim();
    const email = String(fd.get('email') ?? '').trim().toLowerCase();
    startTransition(async () => {
      const res = await saveStaff({
        id: account?.id ?? null,
        fullName,
        email,
        role,
        officeCode: role === 'staff' ? String(fd.get('officeCode') ?? '') : '',
        position: role === 'staff' ? String(fd.get('position') ?? '') : '',
      });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      onClose();
      if (res.data.tempPassword) onCreated({ name: fullName, email, password: res.data.tempPassword, self: false });
      else toast.success('Account saved.');
    });
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={isNew ? 'Create a staff account' : `Edit ${account.name}`}
      description={isNew ? 'A temporary password is shown after you save. They choose their own on first sign-in.' : account.email}
      footer={
        <>
          <button type="button" className={button()} onClick={close} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button({ variant: 'primary' })} disabled={pending}>
            {pending ? <span className={spinner} aria-hidden="true" /> : null}
            {isNew ? 'Create account' : 'Save changes'}
          </button>
        </>
      }
    >
      <form id={formId} className={formGrid} onSubmit={onSubmit}>
        {error ? (
          <div className={cn(alert('error'), formGridFull)} role="alert">
            <Icon name="alert" />
            <div className={alertBody}>{error}</div>
          </div>
        ) : null}

        <div className={FIELD_FULL}>
          <label className={fieldLabel} htmlFor={`${formId}-name`}>
            Full name
          </label>
          <input id={`${formId}-name`} name="fullName" className={input} maxLength={120} required autoComplete="off" defaultValue={account?.formName ?? ''} data-autofocus />
        </div>

        <div className={FIELD_FULL}>
          <label className={fieldLabel} htmlFor={`${formId}-email`}>
            ClearGate email
          </label>
          <input
            id={`${formId}-email`}
            name="email"
            type="email"
            className={input}
            maxLength={190}
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="surnamefirstnameoffice@cgateway.edu.ph"
            defaultValue={account?.email ?? ''}
            aria-describedby={`${formId}-email-hint`}
          />
          <span id={`${formId}-email-hint`} className={fieldHint}>
            Format: surname + first name + office, no spaces.
          </span>
        </div>

        <div className={cn(field, role === 'admin' && formGridFull)}>
          <label className={fieldLabel} htmlFor={`${formId}-role`}>
            Role
          </label>
          <select
            id={`${formId}-role`}
            className={select}
            value={role}
            disabled={self}
            onChange={(e) => setRole(e.target.value === 'admin' ? 'admin' : 'staff')}
            aria-describedby={self ? `${formId}-role-hint` : undefined}
          >
            <option value="staff">Office staff</option>
            <option value="admin">Administrator</option>
          </select>
          {self ? (
            <span id={`${formId}-role-hint`} className={fieldHint}>
              You can&apos;t remove your own admin role.
            </span>
          ) : null}
        </div>

        {role === 'staff' ? (
          <>
            <div className={field}>
              <label className={fieldLabel} htmlFor={`${formId}-office`}>
                Office
              </label>
              <select id={`${formId}-office`} name="officeCode" className={select} required defaultValue={account?.officeCode ?? ''}>
                <option value="" disabled>
                  Choose an office
                </option>
                {offices.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.isActive ? o.name : `${o.name} (turned off)`}
                  </option>
                ))}
              </select>
            </div>
            <div className={FIELD_FULL}>
              <label className={fieldLabel} htmlFor={`${formId}-position`}>
                Position <span className={fieldOptional}>(optional)</span>
              </label>
              <input id={`${formId}-position`} name="position" className={input} maxLength={80} placeholder="e.g. Head Librarian" defaultValue={account?.position ?? ''} />
            </div>
          </>
        ) : null}
      </form>
    </Dialog>
  );
}

function TempPasswordDialog({ shown, onClose }: { shown: TempShown | null; onClose: () => void }) {
  const toast = useToast();
  const [last, setLast] = useState<TempShown | null>(shown);
  if (shown && shown !== last) setLast(shown);
  // Keep the text while the dialog closes.
  const s = shown ?? last;

  async function copyAndClose() {
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s.password);
      toast.success('Temporary password copied.');
      onClose();
    } catch {
      toast.error("Couldn't copy it. Select the password and copy it yourself.");
    }
  }

  return (
    <Dialog
      open={shown !== null}
      onClose={onClose}
      title="Temporary password"
      description={
        s?.self
          ? 'This is your new temporary password. It is shown only once. You will be asked to choose a new password next.'
          : `Give this to ${s?.name ?? 'them'}. It is shown only once, and they will be asked to choose a new password when they sign in.`
      }
      size="sm"
      footer={
        <>
          <button type="button" className={button()} onClick={onClose}>
            Close
          </button>
          <button type="button" className={button({ variant: 'primary' })} onClick={copyAndClose} data-autofocus>
            <Icon name="clipboard" />
            Copy and close
          </button>
        </>
      }
    >
      {s ? (
        <dl className={kv}>
          <dt>Email</dt>
          <dd>{s.email}</dd>
          <dt>Temporary password</dt>
          <dd>
            <span className="inline-block px-2.5 py-1.5 rounded-control bg-raised font-code text-16 tracking-[0.04em] select-all">
              {s.password}
            </span>
          </dd>
        </dl>
      ) : null}
    </Dialog>
  );
}
