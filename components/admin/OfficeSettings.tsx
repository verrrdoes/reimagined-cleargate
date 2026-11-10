'use client';

import { useId, useState, useTransition, type FormEvent } from 'react';
import { Dialog, Icon, OfficeIcon, Pill, useToast } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import {
  actionsCell,
  alert,
  alertBody,
  button,
  check,
  field,
  fieldHint,
  fieldLabel,
  formGrid,
  formGridFull,
  input,
  mono,
  numCell,
  spinner,
  table,
  tablePrimary,
  tableSecondary,
  tableWrap,
} from '@/components/ui/recipes';
import { saveOffice } from '@/lib/actions/settings';
import { OFFICE_ICONS, type OfficeIconKey } from '@/lib/constants';
import type { SettingsOffice } from '@/lib/services/settings';
import { plural } from './format';

const ICON_LABEL: Record<OfficeIconKey, string> = {
  book: 'Book',
  wallet: 'Wallet',
  file: 'Document',
  heart: 'Heart',
  cap: 'Graduation cap',
  box: 'Box',
};

const DEFAULT_HOURS = 'Mon to Fri · 8:00 AM to 5:00 PM';

/** One tile of the icon picker: the radio (`peer`) sits invisible over it. */
const ICON_BOX =
  'flex flex-col items-center justify-center gap-1 h-16 p-1 border border-control rounded-control text-muted text-12 ' +
  'text-center transition-[border-color,background-color] duration-120 ease-out group-hover:border-muted ' +
  'peer-checked:border-accent peer-checked:bg-pill-info-bg peer-checked:text-text ' +
  'peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-1';

type Editing = { office: SettingsOffice | null } | null;

/** Settings, Offices tab: the office list with add and edit. */
export function OfficeSettings({ offices, currentText }: { offices: SettingsOffice[]; currentText: string | null }) {
  const [editing, setEditing] = useState<Editing>(null);
  const active = offices.filter((o) => o.isActive).length;
  const nextOrder = offices.reduce((max, o) => Math.max(max, o.sortOrder), 0) + 1;

  return (
    <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-x-10 gap-y-6 items-start max-[1200px]:grid-cols-1 max-[1200px]:gap-4">
      <div className="flex flex-col items-start gap-2">
        <h2>Offices</h2>
        <p className="text-muted">Students need a sign-off from every active office. An office that is turned off is left out of new clearances.</p>
        <p className="text-muted">
          {plural(offices.length, 'office')}, {active} active
        </p>
        <button type="button" className={cn(button({ variant: 'primary' }), 'mt-2')} onClick={() => setEditing({ office: null })}>
          <Icon name="plus" />
          Add an office
        </button>
      </div>

      <div className="min-w-0">
        {offices.length === 0 ? (
          <p className="text-muted">No offices yet. Add the first one to start signing clearances.</p>
        ) : (
          <div className={tableWrap}>
            <table className={table}>
              <thead>
                <tr>
                  <th scope="col">Office</th>
                  <th scope="col">Contact</th>
                  <th scope="col" className={numCell}>
                    Staff
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col" className={actionsCell}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {offices.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="grid place-items-center shrink-0 size-8 rounded-control bg-raised text-muted">
                          <OfficeIcon icon={o.icon} />
                        </span>
                        <div className="min-w-0">
                          <span className={tablePrimary}>{o.name}</span>
                          <span className={cn(mono, tableSecondary)}>{o.code}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span>{o.contactEmail}</span>
                      <span className={tableSecondary}>{o.officeHours}</span>
                    </td>
                    <td className={numCell}>{o.staff}</td>
                    <td>
                      {o.isActive ? <Pill tone="approved">Active</Pill> : <Pill tone="muted">Turned off</Pill>}
                      {o.autoClear || o.dailyDigest ? (
                        <span className={cn(tableSecondary, 'mt-1 whitespace-nowrap')}>
                          {[o.autoClear ? 'Auto-clear' : null, o.dailyDigest ? 'Morning email' : null].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                    </td>
                    <td className={actionsCell}>
                      <button type="button" className={button({ variant: 'ghost', size: 'sm' })} onClick={() => setEditing({ office: o })} aria-label={`Edit ${o.name}`}>
                        <Icon name="edit" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <OfficeDialog
        open={editing !== null}
        office={editing?.office ?? null}
        nextOrder={nextOrder}
        currentText={currentText}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function OfficeDialog({
  open,
  office,
  nextOrder,
  currentText,
  onClose,
}: {
  open: boolean;
  office: SettingsOffice | null;
  nextOrder: number;
  currentText: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [seen, setSeen] = useState<{ open: boolean; office: SettingsOffice | null }>({ open, office });
  const isNew = office === null;

  // A fresh form each time the dialog opens.
  if (seen.open !== open || seen.office !== office) {
    setSeen({ open, office });
    if (open) {
      setError(null);
      setIsActive(office?.isActive ?? true);
    }
  }

  const close = () => {
    if (!pending) onClose();
  };

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    startTransition(async () => {
      const res = await saveOffice({
        id: office?.id ?? null,
        code: String(fd.get('code') ?? ''),
        name,
        contactEmail: String(fd.get('contactEmail') ?? ''),
        officeHours: String(fd.get('officeHours') ?? ''),
        icon: String(fd.get('icon') ?? ''),
        sortOrder: String(fd.get('sortOrder') ?? '0'),
        isActive: fd.get('isActive') === 'on',
        autoClear: fd.get('autoClear') === 'on',
        dailyDigest: fd.get('dailyDigest') === 'on',
        addToOpen: fd.get('addToOpen') === 'on',
      });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      toast.success(isNew ? `${name} added${res.data.addedTo ? ` to ${plural(res.data.addedTo, 'clearance')}` : ''}.` : 'Office saved.');
      onClose();
    });
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={isNew ? 'Add an office' : `Edit ${office.name}`}
      description={isNew ? "Offices sign student clearances. Add a staff account for it afterwards." : `Code: ${office.code}`}
      size="lg"
      footer={
        <>
          <button type="button" className={button()} onClick={close} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className={button({ variant: 'primary' })} disabled={pending}>
            {pending ? <span className={spinner} aria-hidden="true" /> : null}
            {isNew ? 'Add office' : 'Save changes'}
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

        <div className={cn(field, !isNew && formGridFull)}>
          <label className={fieldLabel} htmlFor={`${formId}-name`}>
            Office name
          </label>
          <input id={`${formId}-name`} name="name" className={input} maxLength={80} required defaultValue={office?.name ?? ''} data-autofocus />
        </div>

        {isNew ? (
          <div className={field}>
            <label className={fieldLabel} htmlFor={`${formId}-code`}>
              Short code
            </label>
            <input
              id={`${formId}-code`}
              name="code"
              className={cn(mono, input)}
              maxLength={20}
              required
              pattern="[a-z][a-z0-9\-]{1,19}"
              placeholder="e.g. clinic"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby={`${formId}-code-hint`}
            />
            <span id={`${formId}-code-hint`} className={fieldHint}>
              Lowercase letters, numbers or dashes. It can&apos;t be changed later.
            </span>
          </div>
        ) : null}

        <div className={field}>
          <label className={fieldLabel} htmlFor={`${formId}-email`}>
            Contact email
          </label>
          <input
            id={`${formId}-email`}
            name="contactEmail"
            type="email"
            className={input}
            maxLength={190}
            required
            placeholder="office@cgateway.edu.ph"
            defaultValue={office?.contactEmail ?? ''}
          />
        </div>

        <div className={field}>
          <label className={fieldLabel} htmlFor={`${formId}-hours`}>
            Office hours
          </label>
          <input id={`${formId}-hours`} name="officeHours" className={input} maxLength={80} required defaultValue={office?.officeHours ?? DEFAULT_HOURS} />
        </div>

        <fieldset className={cn(field, formGridFull)}>
          <legend className={fieldLabel}>Icon</legend>
          <div className="grid grid-cols-6 gap-2 max-sm:grid-cols-3">
            {OFFICE_ICONS.map((key) => (
              <label key={key} className="group relative block">
                <input
                  type="radio"
                  name="icon"
                  value={key}
                  className="peer absolute inset-0 size-full m-0 opacity-0 cursor-pointer"
                  defaultChecked={(office?.icon ?? 'file') === key}
                  required
                />
                <span className={ICON_BOX}>
                  <OfficeIcon icon={key} size={20} />
                  {ICON_LABEL[key]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={field}>
          <label className={fieldLabel} htmlFor={`${formId}-order`}>
            Order
          </label>
          <input
            id={`${formId}-order`}
            name="sortOrder"
            type="number"
            inputMode="numeric"
            className={input}
            min={0}
            max={32767}
            step={1}
            defaultValue={office?.sortOrder ?? nextOrder}
            aria-describedby={`${formId}-order-hint`}
          />
          <span id={`${formId}-order-hint`} className={fieldHint}>
            Offices are listed from the lowest number.
          </span>
        </div>

        <div className={cn(formGridFull, 'flex flex-col gap-2')}>
          <label className={check}>
            <input type="checkbox" name="isActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active (students need this office&apos;s sign-off)
          </label>
          {isNew && currentText ? (
            <label className={check}>
              <input type="checkbox" name="addToOpen" defaultChecked disabled={!isActive} />
              Add it to the open {currentText} clearances
            </label>
          ) : null}
        </div>

        <fieldset className={cn(formGridFull, 'flex flex-col gap-3 pt-4 border-t border-rule')}>
          <legend className={cn(fieldLabel, 'float-left mb-1')}>Less work for quiet offices</legend>
          <div className="clear-left flex flex-col gap-1">
            <label className={check}>
              <input type="checkbox" name="autoClear" defaultChecked={office?.autoClear ?? false} aria-describedby={`${formId}-auto-hint`} />
              Clear students automatically at the office deadline
            </label>
            <span id={`${formId}-auto-hint`} className={cn(fieldHint, 'pl-6')}>
              Students still Pending who have no upload waiting, and whom the office never updated, are cleared when the
              deadline passes. Staff are warned 2 days before; marking a student Needs action holds them. Nothing is
              cleared for a deadline that has already passed.
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <label className={check}>
              <input type="checkbox" name="dailyDigest" defaultChecked={office?.dailyDigest ?? false} aria-describedby={`${formId}-digest-hint`} />
              Email the office&apos;s staff a morning summary
            </label>
            <span id={`${formId}-digest-hint`} className={cn(fieldHint, 'pl-6')}>
              At 8:00 AM, only on days when uploads, unread student messages or an auto-clear are waiting. Sent to the
              office&apos;s staff accounts, or to the contact email when it has none.
            </span>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
