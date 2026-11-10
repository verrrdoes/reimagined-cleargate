import type { Metadata } from 'next';
import Link from 'next/link';
import { pageUser } from '@/lib/auth/guards';
import { hasMoney, peso, templateFor } from '@/lib/officeRecords';
import { officeChoices } from '@/lib/services/review';
import { officeRecords, recordsOffice } from '@/lib/services/officeRecords';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs } from '@/components/ui/Tabs';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { alert, alertBody, button, pageHead, pageHeadActions, pageHeadSub, tableFoot } from '@/components/ui/recipes';
import { SearchNote } from '@/components/staff/ListControls';
import { NoOffice } from '@/components/staff/NoOffice';
import { UrlSelect } from '@/components/staff/UrlSelect';
import { hrefWith, matches, param, plural } from '@/components/staff/format';
import { RecordsActions, RecordsTable } from '@/components/staff/records/RecordsTable';

export const metadata: Metadata = { title: 'Records' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PATH = '/records';
const SHOW = ['open', 'settled', 'all'] as const;
type Show = (typeof SHOW)[number];

/**
 * /records: what the office keeps on record against students this term (incomplete grades, borrowed books,
 * balances...). Each open record puts the student's requirement at Needs action in the office's own words; settling
 * the last one hands it back to the office to clear.
 */
export default async function RecordsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await pageUser('staff');
  if (user.role === 'staff' && !user.staffProfile) return <NoOffice title="Records" />;
  const sp = await searchParams;

  // Admins pick one office (the first by default): every office keeps different records.
  const choices = await officeChoices(user);
  const picked = choices ? (choices.find((o) => o.code === param(sp.office)) ?? choices[0] ?? null) : null;
  const office = user.role === 'admin' && !picked ? null : await recordsOffice(user, picked?.code);
  const data = office ? await officeRecords(office) : null;

  const q = param(sp.q).trim();
  const show: Show = (SHOW as readonly string[]).includes(param(sp.show)) ? (param(sp.show) as Show) : 'open';
  const params: Record<string, string> = { q, office: choices && picked ? picked.code : '', show: show === 'open' ? '' : show };

  const template = templateFor(office?.code ?? '');
  const title = office ? template.title : 'Records';

  const head = (
    <div className={pageHead}>
      <h1>{title}</h1>
      <p className={pageHeadSub}>
        {office ? office.name : 'No office yet'}
        {data ? ` · ${data.termLabel}` : ''}
      </p>
      <div className={pageHeadActions}>
        {choices && picked ? (
          <div className="w-[200px] max-sm:w-full">
            <UrlSelect
              name="office"
              label="Office"
              value={picked.code}
              path={PATH}
              params={params}
              options={choices.map((o) => ({ value: o.code, label: o.name }))}
            />
          </div>
        ) : null}
        {office && data ? <RecordsActions officeCode={office.code} adminOffice={choices ? office.code : null} students={data.students} /> : null}
      </div>
    </div>
  );

  if (!office || !data) {
    return (
      <>
        {head}
        <EmptyState
          icon="calendar"
          title={office ? 'No academic year is set as current.' : 'No offices yet.'}
          body={
            office
              ? 'Records belong to the current term. They appear here once an administrator sets the current academic year in Settings.'
              : 'Add an office in Settings first.'
          }
        />
      </>
    );
  }

  const open = data.rows.filter((r) => !r.settledAt);
  const settled = data.rows.length - open.length;
  const openStudents = new Set(open.map((r) => r.itemId)).size;
  const openMoney = open.reduce((t, r) => t + r.money, 0);
  const shown = data.rows
    .filter((r) => (show === 'open' ? !r.settledAt : show === 'settled' ? r.settledAt : true))
    .filter((r) => {
      const d = template.describe(r.values);
      return matches(q, [r.studentName, r.studentNumber, d.main, ...d.details, r.settleNote]);
    });

  return (
    <>
      {head}
      <p className="max-w-[72ch] -mt-3 mb-5 text-muted">{template.intro}</p>

      <p className="mb-4">
        {open.length ? (
          <>
            <strong className="tabular-nums">{plural(open.length, `open ${template.noun[0]}`, `open ${template.noun[1]}`)}</strong>
            {' for '}
            {plural(openStudents, 'student', 'students')}
            {hasMoney(template) && openMoney > 0 ? (
              <>
                {' · '}
                <strong className="tabular-nums">{peso(openMoney)}</strong> outstanding
              </>
            ) : null}
          </>
        ) : (
          <span className="text-muted">Nothing open on record.</span>
        )}
      </p>

      {data.untracked ? (
        <div className={cn(alert('info'), 'mb-4')}>
          <Icon name="info" />
          <div className={alertBody}>
            <span>
              {plural(data.untracked, 'student is', 'students are')} marked Needs action on Clearance status with nothing on record
              here. Add what {data.untracked === 1 ? 'they owe' : 'each one owes'} here so they see it listed, item by item.{' '}
              <Link href={hrefWith('/office-status', { office: params.office }, { status: 'needs_action' })}>See who</Link>
            </span>
          </div>
        </div>
      ) : null}

      <Tabs
        label="Show"
        current={hrefWith(PATH, params, {})}
        items={[
          { href: hrefWith(PATH, params, { show: null }), label: 'Open', count: open.length },
          { href: hrefWith(PATH, params, { show: 'settled' }), label: template.settle.done, count: settled },
          { href: hrefWith(PATH, params, { show: 'all' }), label: 'All', count: data.rows.length },
        ]}
      />

      <SearchNote q={q} path={PATH} params={params} />

      {shown.length === 0 ? (
        data.rows.length === 0 ? (
          <EmptyState
            icon="clipboard"
            title={`No ${template.noun[1]} on record this term.`}
            body={`Add one for a student, or import a list from a spreadsheet. The student sees it on their requirements right away, and stays at Needs action with ${office.name} until it is settled.`}
          />
        ) : (
          <EmptyState
            icon="search"
            title={q ? 'No records match this search.' : show === 'open' ? 'Nothing open on record.' : `Nothing marked ${template.settle.done.toLowerCase()} yet.`}
            action={
              <Link href={hrefWith(PATH, params, { q: null, show: 'all' })} className={button()}>
                Show all records
              </Link>
            }
          />
        )
      ) : (
        <>
          <RecordsTable officeCode={office.code} officeName={office.name} rows={shown} />
          <div className={tableFoot}>
            <span>
              Showing {shown.length} of {plural(data.rows.length, template.noun[0], template.noun[1])}
            </span>
          </div>
        </>
      )}
    </>
  );
}
