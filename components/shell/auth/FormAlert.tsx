import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { alert, alertBody } from '@/components/ui/recipes';

type Tone = 'error' | 'success' | 'info' | 'warning';

const ICON: Record<Tone, IconName> = { error: 'alert', success: 'check-circle', info: 'info', warning: 'warning' };

/** A message above or below a form. Errors are announced at once (role="alert"); the rest politely. */
export function FormAlert({ tone = 'error', id, children }: { tone?: Tone; id?: string; children: ReactNode }) {
  return (
    <div id={id} className={alert(tone)} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={ICON[tone]} size={16} />
      <div className={alertBody}>{children}</div>
    </div>
  );
}
