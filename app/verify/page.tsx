import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CodeForm } from '@/components/certificate/CodeForm';
import { SCHOOL_NAME } from '@/lib/constants';
import { verifyPath } from '@/lib/certificate';

export const metadata: Metadata = { title: 'Check a certificate' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Public: type the code from a printed certificate (the form sends ?code=, which goes to /verify/<code>). */
export default async function VerifyLookupPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.code) ? sp.code[0] : sp.code;
  const code = (raw ?? '').replace(/\s+/g, '').toUpperCase().slice(0, 40);
  if (code) redirect(verifyPath(encodeURIComponent(code)));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <p className="text-12 font-semibold tracking-[0.08em] text-muted">{SCHOOL_NAME}</p>
        <h1>Check a clearance certificate</h1>
        <p className="text-muted">
          Scan the QR code on the certificate, or type its verification code here. You’ll see whether the student is still
          cleared by every office, read from the college’s records right now.
        </p>
      </div>
      <CodeForm />
    </div>
  );
}
