import { Fragment, type CSSProperties } from 'react';
import { cn } from '@/components/ui/cn';
import { countdownClasses, slipClasses } from '@/components/ui';
import {
  kpi,
  kpis,
  kv,
  pageHead,
  pageHeadAside,
  pageHeadSub,
  panel,
  panelHead,
  section,
  sectionHead,
  split,
  table,
  tableWrap,
  toolbar,
} from '@/components/ui/recipes';
import { studentLayout } from '@/components/student/layout';
import { profileLayout } from '@/components/profile/layout';

/**
 * Route loading states: the page's own layout (head, panels, slip cells, tiles, table rows) with grey
 * bars where the text will be, so the content lands in place instead of replacing a lone spinner.
 * It fades in after a short delay, so fast navigations show nothing at all.
 */
export type SkeletonVariant = 'dashboard' | 'status' | 'requirements' | 'list' | 'detail' | 'profile';

const SKEL = {
  sm: 'h-2.5',
  heading: 'h-3.5',
  title: 'w-[min(260px,70%)] h-6',
  figure: 'w-24 h-8',
  bar: 'w-full h-1.5 rounded-full',
  btn: 'w-[150px] h-control rounded-control',
  input: 'w-[min(300px,100%)] h-control rounded-control',
  chip: 'w-[88px] h-7 rounded-full',
  center: 'mx-auto',
  back: 'mb-3.5',
};

const BAR = 'block max-w-full h-3 rounded-[4px] bg-active animate-skel-pulse';
const STACK = 'flex flex-col gap-2';
const STACK_MD = 'flex flex-col gap-3';

function Bar({ w, className, style }: { w?: string; className?: string; style?: CSSProperties }) {
  return <span className={cn(BAR, className)} style={w ? { width: w, ...style } : style} />;
}

function Head({ action = true }: { action?: boolean }) {
  return (
    <header className={pageHead}>
      <Bar className={SKEL.title} />
      <Bar className={pageHeadSub} w="min(360px, 90%)" />
      {action ? <Bar className={cn(SKEL.btn, pageHeadAside)} /> : null}
    </header>
  );
}

/** Table rows; the first column carries a name and a second line, like the real lists. */
function Rows({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  const widths = ['70%', '50%', '40%', '60%', '30%'];
  return (
    <div className={tableWrap}>
      <table className={table}>
        <thead>
          <tr>
            {Array.from({ length: cols }, (_, c) => (
              <th key={c}>
                <Bar className={SKEL.sm} w={c === 0 ? '96px' : '64px'} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c}>
                  {c === 0 ? (
                    <span className={STACK}>
                      <Bar w={r % 2 ? '60%' : '75%'} />
                      <Bar className={SKEL.sm} w="40%" />
                    </span>
                  ) : (
                    <Bar w={widths[(r + c) % widths.length]} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SidePanel() {
  return (
    <section className={cn(panel(), STACK_MD)}>
      <Bar className={SKEL.heading} w="50%" />
      <Bar w="90%" />
      <Bar w="75%" />
      <Bar className={SKEL.bar} />
      <Bar w="60%" />
    </section>
  );
}

function Dashboard() {
  return (
    <>
      <Head />
      <section className={cn(panel(), studentLayout.summary)}>
        <div className={studentLayout.summaryFigures}>
          <Bar className={SKEL.heading} w="120px" />
          <Bar className={SKEL.figure} />
          <Bar className={SKEL.bar} />
          <Bar w="80%" />
        </div>
        <div className={cn(slipClasses.root, studentLayout.summarySlip)}>
          <ol className={slipClasses.grid}>
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className={slipClasses.item}>
                <div className={slipClasses.cell}>
                  <Bar w="70%" />
                  <Bar className={cn(SKEL.sm, slipClasses.foot)} w="45%" />
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <div className={studentLayout.now}>
        <section className={cn(panel(), STACK_MD)}>
          <Bar className={SKEL.heading} w="40%" />
          <Bar w="65%" />
          <Bar w="85%" />
          <Bar className={SKEL.btn} />
        </section>
        <section className={cn(panel(), STACK_MD)}>
          <Bar className={SKEL.heading} w="55%" />
          <div className={countdownClasses.root}>
            {Array.from({ length: 4 }, (_, i) => (
              <span key={i} className={cn(countdownClasses.cell, STACK)}>
                <Bar className={cn(SKEL.figure, SKEL.center)} w="32px" />
                <Bar className={cn(SKEL.sm, SKEL.center)} w="28px" />
              </span>
            ))}
          </div>
        </section>
      </div>
      <section className={section}>
        <div className={sectionHead}>
          <Bar className={SKEL.heading} w="120px" />
        </div>
        <ul className={studentLayout.tiles}>
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className={studentLayout.tile}>
              <div className={studentLayout.tileHead}>
                <span className={studentLayout.tileIcon} />
                <Bar w="50%" />
              </div>
              <Bar w="80%" />
              <Bar className={SKEL.sm} w="55%" />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Status() {
  return (
    <>
      <Head />
      <div className={kpis}>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={kpi}>
            <Bar className={SKEL.heading} w="50%" />
            <Bar className={SKEL.figure} w="72px" />
            <Bar className={SKEL.sm} w="70%" />
          </div>
        ))}
      </div>
      <div className={cn(split, section)}>
        <section className={panel()}>
          <div className={panelHead}>
            <Bar className={SKEL.heading} w="160px" />
          </div>
          <Rows rows={6} cols={4} />
        </section>
        <SidePanel />
      </div>
    </>
  );
}

function Requirements() {
  return (
    <>
      <Head />
      <div className={split}>
        <section className={panel()}>
          <div className={panelHead}>
            <Bar className={SKEL.heading} w="160px" />
            <Bar className={SKEL.input} />
          </div>
          <ol className={studentLayout.checklist}>
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className={studentLayout.check}>
                <span className={studentLayout.checkMark} />
                <span className={studentLayout.checkBody}>
                  <Bar className={SKEL.sm} w="25%" />
                  <Bar className={SKEL.heading} w={i % 2 ? '55%' : '70%'} />
                  <Bar w="85%" />
                </span>
              </li>
            ))}
          </ol>
        </section>
        <SidePanel />
      </div>
    </>
  );
}

function List() {
  return (
    <>
      <Head />
      <div className={toolbar}>
        <Bar className={SKEL.input} />
        <Bar className={SKEL.chip} />
        <Bar className={SKEL.chip} />
        <Bar className={SKEL.chip} />
      </div>
      <Rows rows={8} cols={5} />
    </>
  );
}

function DetailsPanel() {
  return (
    <section className={cn(panel(), STACK_MD)}>
      <Bar className={SKEL.heading} w="35%" />
      <div className={kv}>
        {Array.from({ length: 6 }, (_, i) => (
          <Fragment key={i}>
            <Bar w="70%" />
            <Bar w={i % 2 ? '45%' : '65%'} />
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function Detail() {
  return (
    <>
      <Bar className={cn(SKEL.sm, SKEL.back)} w="64px" />
      <Head />
      <div className={split}>
        <DetailsPanel />
        <SidePanel />
      </div>
    </>
  );
}

function Profile() {
  return (
    <>
      <Head action={false} />
      <section className={profileLayout.identity}>
        <span className={cn(BAR, 'inline-grid shrink-0 rounded-full')} style={{ width: 72, height: 72 }} />
        <div className={cn(profileLayout.identityText, STACK)}>
          <Bar className={SKEL.heading} w="180px" />
          <Bar w="140px" />
          <Bar className={SKEL.sm} w="200px" />
        </div>
      </section>
      <div className={profileLayout.split}>
        <DetailsPanel />
        <SidePanel />
      </div>
    </>
  );
}

const VARIANTS = {
  dashboard: Dashboard,
  status: Status,
  requirements: Requirements,
  list: List,
  detail: Detail,
  profile: Profile,
};

export function PageSkeleton({ variant = 'list', label = 'Loading the page…' }: { variant?: SkeletonVariant; label?: string }) {
  const Body = VARIANTS[variant];
  return (
    <div className="animate-skel-in" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        <Body />
      </div>
    </div>
  );
}
