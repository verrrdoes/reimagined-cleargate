import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import { kv } from '@/components/ui/recipes';
import { CodeForm } from '@/components/certificate/CodeForm';
import { SCHOOL_NAME } from '@/lib/constants';
import { numberHint, type CertificateData } from '@/lib/certificate';
import { certificateFromCode } from '@/lib/services/certificate';
import { formatDate, formatDateTime } from '@/lib/time';
import { ordinal } from '@/components/student/format';

export const metadata: Metadata = { title: 'Check a certificate' };

const BANNER = 'flex items-start gap-3 p-4 rounded-card [&>svg]:mt-0.5 [&>svg]:shrink-0';
const EYEBROW = 'text-12 font-semibold tracking-[0.08em] text-muted';

/**
 * Public: what a scanned or typed certificate code says right now. Reads the clearance live, so a certificate whose
 * clearance an office has reopened says so. Shows the student's name, program and year, and only the last four
 * digits of their student number.
 */
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).slice(0, 40);
  const data = await certificateFromCode(code);
  const checkedAt = formatDateTime(new Date());

  if (!data) return <NotFound code={code} />;
  return data.valid ? <Valid data={data} checkedAt={checkedAt} /> : <NoLongerValid data={data} checkedAt={checkedAt} />;
}

function Student({ data }: { data: CertificateData }) {
  const s = data.student;
  return (
    <div className="flex flex-col gap-1">
      <p className={EYEBROW}>{data.school}</p>
      <p className="text-22 font-semibold leading-[1.25] wrap-anywhere">{s.name}</p>
      <p className="text-muted">
        {s.programName} · {ordinal(s.yearLevel)} year · Student no. ending in {numberHint(s.number)}
      </p>
    </div>
  );
}

function Valid({ data, checkedAt }: { data: CertificateData; checkedAt: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className={cn(BANNER, 'bg-pill-approved-bg text-pill-approved-fg')} role="status">
        <Icon name="check-circle" size={24} />
        <div className="flex flex-col gap-0.5">
          <h1 className="text-22">Valid certificate</h1>
          <p>Every office has cleared this student. Checked {checkedAt}, Manila time.</p>
        </div>
      </div>

      <Student data={data} />

      <dl className={kv}>
        <dt>Certificate no.</dt>
        <dd className="font-code">{data.number}</dd>
        <dt>Term</dt>
        <dd>{data.termText}</dd>
        <dt>Cleared on</dt>
        <dd>{data.clearedAt ? formatDate(data.clearedAt) : ''}</dd>
      </dl>

      <section aria-labelledby="verify-offices" className="flex flex-col gap-2">
        <h2 id="verify-offices" className="text-14">
          Offices
        </h2>
        <ul className="m-0 p-0 list-none border-t border-rule">
          {data.offices.map((o) => (
            <li key={o.name} className="flex items-center gap-2.5 py-2.5 border-b border-rule">
              <Icon name="check" size={16} className="text-positive" />
              <span className="mr-auto">{o.name}</span>
              <span className="text-muted tabular-nums">{o.approvedAt ? formatDate(o.approvedAt) : ''}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-12 text-muted">
        This page reads the student’s clearance from {SCHOOL_NAME}’s records each time it opens. If an office reopens it,
        this page will say the certificate is no longer valid.
      </p>
    </div>
  );
}

function NoLongerValid({ data, checkedAt }: { data: CertificateData; checkedAt: string }) {
  const cleared = data.offices.filter((o) => o.status === 'approved').length;
  return (
    <div className="flex flex-col gap-6">
      <div className={cn(BANNER, 'bg-pill-overdue-bg text-pill-overdue-fg')} role="alert">
        <Icon name="x-circle" size={24} />
        <div className="flex flex-col gap-0.5">
          <h1 className="text-22">Not valid any more</h1>
          <p>
            An office has reopened this student’s clearance, so the certificate no longer counts. Checked {checkedAt},
            Manila time.
          </p>
        </div>
      </div>

      <Student data={data} />

      <dl className={kv}>
        <dt>Certificate no.</dt>
        <dd className="font-code">{data.number}</dd>
        <dt>Term</dt>
        <dd>{data.termText}</dd>
        <dt>Offices cleared now</dt>
        <dd>
          {cleared} of {data.offices.length}
        </dd>
      </dl>

      <p className="text-muted">
        The student should sign in to ClearGate to see what is needed. Once every office clears them again, this same
        certificate checks out as valid.
      </p>
    </div>
  );
}

function NotFound({ code }: { code: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className={cn(BANNER, 'bg-pill-pending-bg text-pill-pending-fg')} role="alert">
        <Icon name="warning" size={24} />
        <div className="flex flex-col gap-0.5">
          <h1 className="text-22">We can’t find this certificate</h1>
          <p>
            No certificate has the code <span className="font-code">{code || '(blank)'}</span>. Check it against the paper
            and try again. A certificate that was changed by hand won’t check out.
          </p>
        </div>
      </div>
      <CodeForm defaultValue={code} />
      <p className="text-12 text-muted">
        <Link href="/verify">Start over</Link>
      </p>
    </div>
  );
}
