import type { Metadata } from 'next';
import { adminPage } from '@/lib/auth/guards';
import { getSettings } from '@/lib/services/settings';
import { termText } from '@/lib/services/clearance';
import { Tabs } from '@/components/ui';
import { OfficeSettings } from '@/components/admin/OfficeSettings';
import { ProgramSettings } from '@/components/admin/ProgramSettings';
import { YearSettings } from '@/components/admin/YearSettings';
import { pageHead, pageHeadSub } from '@/components/ui/recipes';

export const metadata: Metadata = { title: 'Settings' };

const TABS = ['offices', 'programs', 'years'] as const;
type Tab = (typeof TABS)[number];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await adminPage();
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'offices';

  const settings = await getSettings();
  const currentText = settings.current ? termText(settings.current) : null;

  return (
    <>
      <div className={pageHead}>
        <h1>Settings</h1>
        <p className={pageHeadSub}>Manage offices, programs and academic terms. Every change is recorded in the audit log.</p>
      </div>

      <Tabs
        label="Settings sections"
        current={`/settings?tab=${tab}`}
        items={[
          { href: '/settings?tab=offices', label: 'Offices', count: settings.offices.length },
          { href: '/settings?tab=programs', label: 'Programs', count: settings.programs.length },
          { href: '/settings?tab=years', label: 'Academic years & terms', count: settings.years.length },
        ]}
      />

      {tab === 'offices' ? <OfficeSettings offices={settings.offices} currentText={currentText} /> : null}
      {tab === 'programs' ? <ProgramSettings programs={settings.programs} /> : null}
      {tab === 'years' ? <YearSettings years={settings.years} currentText={currentText} activeStudents={settings.activeStudents} /> : null}
    </>
  );
}
