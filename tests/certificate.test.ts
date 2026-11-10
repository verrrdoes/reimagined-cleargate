import { describe, expect, it } from 'vitest';
import {
  certificateCode,
  certificateNumber,
  clearedOn,
  numberHint,
  readCertificateCode,
} from '@/lib/certificate';
import { certificatePdf } from '@/lib/certificatePdf';
import { textWidth } from '@/lib/pdf';
import type { CertificateData } from '@/lib/certificate';

const SECRET = 'test-secret-for-certificates';

describe('certificateCode / readCertificateCode', () => {
  it('reads back the clearance id from a code it made', () => {
    const code = certificateCode(482, SECRET);
    expect(code).toMatch(/^482-[0-9A-F]{10}$/);
    expect(readCertificateCode(code, SECRET)).toBe(482);
  });

  it('accepts the code typed in lower case or with spaces around it', () => {
    const code = certificateCode(7, SECRET);
    expect(readCertificateCode(`  ${code.toLowerCase()} `, SECRET)).toBe(7);
  });

  it('rejects a code for another clearance, a changed signature, or another secret', () => {
    const code = certificateCode(482, SECRET);
    const sig = code.split('-')[1];
    expect(readCertificateCode(`483-${sig}`, SECRET)).toBeNull();
    expect(readCertificateCode(`482-${sig.slice(0, -1)}${sig.endsWith('0') ? '1' : '0'}`, SECRET)).toBeNull();
    expect(readCertificateCode(code, 'another-secret')).toBeNull();
  });

  it('rejects anything that is not a code', () => {
    for (const bad of ['', '482', '482-', 'abc-0123456789', '0-0123456789', '482-01234', '482-0123456789-1', '1'.repeat(40)]) {
      expect(readCertificateCode(bad, SECRET)).toBeNull();
    }
  });
});

describe('certificateNumber / numberHint / clearedOn', () => {
  it('numbers a certificate by the start of its academic year and the clearance', () => {
    expect(certificateNumber(42, '2026 - 2027')).toBe('CLR-2026-00042');
    expect(certificateNumber(123456, '2026 - 2027')).toBe('CLR-2026-123456');
  });

  it('shows only the last four digits of the student number', () => {
    expect(numberHint('2023-00123')).toBe('0123');
    expect(numberHint('12')).toBe('12');
  });

  it('is cleared on the day the last office cleared, and not before every office has', () => {
    const at = (iso: string) => ({ status: 'approved' as const, approvedAt: iso });
    expect(clearedOn([at('2026-10-20T01:00:00Z'), at('2026-11-02T03:00:00Z'), at('2026-10-30T09:00:00Z')])).toBe(
      '2026-11-02T03:00:00.000Z',
    );
    expect(clearedOn([at('2026-10-20T01:00:00Z'), { status: 'pending', approvedAt: null }])).toBeNull();
    expect(clearedOn([])).toBeNull();
  });
});

describe('textWidth', () => {
  it('measures Helvetica and Helvetica-Bold like the PDF viewer will', () => {
    // "Hello": H 722 + e 556 + l 222 + l 222 + o 556 = 2278 per 1000 at size 10.
    expect(textWidth('Hello', 'F1', 10)).toBeCloseTo(22.78, 2);
    // Bold: H 722 + e 556 + l 278 + l 278 + o 611 = 2445.
    expect(textWidth('Hello', 'F2', 10)).toBeCloseTo(24.45, 2);
  });
});

const sample: CertificateData = {
  clearanceId: 42,
  number: 'CLR-2026-00042',
  code: '42-0123456789',
  school: 'IMMACULADA CONCEPTION COLLEGE',
  student: { name: 'ANDREA SANTOS', number: '2023-00123', program: 'BSIT', programName: 'BS Information Technology', yearLevel: 3 },
  termText: '1st Semester, A.Y 2026 - 2027',
  offices: [
    { name: 'Library', status: 'approved', approvedAt: '2026-10-20T01:00:00.000Z' },
    { name: "Dean's Office", status: 'approved', approvedAt: '2026-11-02T03:00:00.000Z' },
  ],
  clearedAt: '2026-11-02T03:00:00.000Z',
  valid: true,
};

describe('certificatePdf', () => {
  const pdf = Buffer.from(certificatePdf(sample, 'https://example.test/verify/42-0123456789')).toString('latin1');

  it('is a PDF with the student, the school, the offices and the code on it', () => {
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    for (const s of ['ANDREA SANTOS', 'IMMACULADA CONCEPTION COLLEGE', 'CLR-2026-00042', '42-0123456789', 'Library', "Dean's Office"]) {
      expect(pdf).toContain(s);
    }
  });

  it('points startxref at the cross-reference table', () => {
    const at = Number(/startxref\n(\d+)\n/.exec(pdf)?.[1]);
    expect(pdf.slice(at, at + 4)).toBe('xref');
  });

  it('draws the QR code as filled squares', () => {
    expect((pdf.match(/ re\n/g) ?? []).length).toBeGreaterThan(50);
  });
});
