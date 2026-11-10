import Link from 'next/link';
import { Icon } from '@/components/ui';
import { QrCode } from '@/components/ui/QrCode';
import { cn } from '@/components/ui/cn';
import { button, panel } from '@/components/ui/recipes';
import { certificateCode, certificateNumber, verifyPath } from '@/lib/certificate';
import { appSecret } from '@/lib/env';
import { requestOrigin } from '@/lib/requestOrigin';

/**
 * The student dashboard once every office has cleared them: the certificate to download or print, and its QR code
 * to show from a phone. The QR opens this site's public check page for the certificate.
 */
export async function CertificateCard({ clearanceId, academicYear }: { clearanceId: number; academicYear: string }) {
  const number = certificateNumber(clearanceId, academicYear);
  const verifyUrl = `${await requestOrigin()}${verifyPath(certificateCode(clearanceId, appSecret()))}`;

  return (
    <section
      className={cn(panel(), 'flex items-start gap-6 min-w-0 border-l-[3px] border-l-positive max-sm:flex-col max-sm:gap-4')}
      aria-labelledby="stu-cert-title"
    >
      <div className="flex flex-col flex-auto gap-2.5 min-w-0">
        <div className="flex items-center gap-2.5">
          <Icon name="check-circle" size={20} className="text-positive" />
          <h2 id="stu-cert-title" className="text-16 font-semibold">
            You’re fully cleared
          </h2>
        </div>
        <p>Every office has signed off. You are eligible to enroll next semester.</p>
        <p className="text-muted">
          Your clearance certificate is ready. Print it, or show the QR code from your phone: whoever scans it sees that
          you’re cleared, checked against the college’s records.
        </p>
        <div className="flex flex-wrap gap-2 mt-1">
          <a className={button({ variant: 'primary' })} href="/api/certificate?download=1">
            <Icon name="download" size={16} />
            Download certificate
          </a>
          <a className={button()} href="/api/certificate" target="_blank" rel="noopener">
            <Icon name="print" size={16} />
            Open to print
          </a>
        </div>
        <p className="text-12 text-muted">
          Certificate no. <span className="font-code">{number}</span> · <Link href="/clearance-status">See your clearance status</Link>
        </p>
      </div>
      <figure className="flex flex-col items-center gap-1.5 m-0 max-sm:self-center">
        <QrCode value={verifyUrl} size={136} label={`QR code that opens the check page for certificate ${number}`} className="border border-border" />
        <figcaption className="text-12 text-muted">Scan to check</figcaption>
      </figure>
    </section>
  );
}
