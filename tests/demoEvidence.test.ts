import { describe, expect, it } from 'vitest';
import { DEMO_EVIDENCE_OFFICES, evidencePdf, type EvidenceInput } from '@/prisma/demo-evidence';
import { sniff } from '@/lib/files/sniff';

const base: EvidenceInput = {
  office: 'library',
  studentName: 'PATRICIA GONZALES',
  studentNumber: '2024-00201',
  termText: '1st Semester, A.Y 2026 - 2027',
  issuedAt: new Date('2026-10-24T20:22:00Z'), // Oct 25, 4:22 AM in Manila
};

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

describe('evidencePdf', () => {
  it('is a PDF the upload sniffer accepts', () => {
    const bytes = evidencePdf(base);
    expect(sniff(bytes)?.mime).toBe('application/pdf');
    expect(text(bytes).trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('prints the student it was made for, not the old demo student', () => {
    const t = text(evidencePdf(base));
    expect(t).toContain('(PATRICIA GONZALES)');
    expect(t).toContain('(2024-00201)');
    expect(t).not.toContain('Ariel');
    expect(t).not.toContain('2024-00123');
  });

  it('has a valid cross-reference table and stream length', () => {
    const bytes = evidencePdf(base);
    const t = text(bytes);
    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(t)?.[1]);
    expect(t.slice(startxref, startxref + 4)).toBe('xref');
    const [, count] = /xref\n0 (\d+)\n/.exec(t.slice(startxref))!;
    const entries = t.slice(startxref).split('\n').slice(3, 2 + Number(count));
    entries.forEach((e, i) => {
      expect(e).toHaveLength(19); // "nnnnnnnnnn 00000 n " plus the newline makes the required 20 bytes
      const offset = Number(e.slice(0, 10));
      expect(t.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true);
    });
    const length = Number(/\/Length (\d+)/.exec(t)?.[1]);
    const start = t.indexOf('stream\n') + 'stream\n'.length;
    expect(t.slice(start + length, start + length + '\nendstream'.length)).toBe('\nendstream');
  });

  it('dates the document in Manila time', () => {
    expect(text(evidencePdf(base))).toContain('25 October 2026');
  });

  it('makes the right document for each office, matching what the office asked for', () => {
    const doc = (office: string) => text(evidencePdf({ ...base, office }));
    expect(doc('library')).toContain('Book Return Acknowledgment');
    expect(doc('library')).toContain('2 books returned');
    expect(doc('accounting')).toContain('Official Receipt');
    expect(doc('accounting')).toContain('PHP 5,250.00');
    expect(doc('registrar')).toContain('Form 137');
    expect(doc('guidance')).toContain('Exit Interview Form');
    expect(doc('dean')).toContain('Grade Sheet');
    expect(doc('dean')).toContain('1st Semester, A.Y 2026 - 2027');
    expect(doc('property')).toContain('Equipment Return Form');
    expect(DEMO_EVIDENCE_OFFICES).toEqual(['library', 'accounting', 'registrar', 'guidance', 'dean', 'property']);
  });

  it('shows the problem an office returned the file for', () => {
    const flawed = (office: string) => text(evidencePdf({ ...base, office, flawed: true }));
    expect(flawed('library')).toContain('1 book returned');
    expect(flawed('library')).not.toContain('2 books returned');
    expect(flawed('accounting')).not.toMatch(/OR no\. \d/);
    expect(flawed('registrar')).toContain('Form 138');
    expect(flawed('registrar')).not.toContain('Form 137');
    expect(flawed('guidance')).toContain('not signed');
    expect(flawed('dean')).toContain('2nd Semester, A.Y 2025 - 2026');
    expect(flawed('property')).toContain('no acknowledgment');
  });

  it('escapes PDF string characters in names', () => {
    const t = text(evidencePdf({ ...base, studentName: 'JUAN (JR.) DELA CRUZ\\' }));
    expect(t).toContain('(JUAN \\(JR.\\) DELA CRUZ\\\\)');
  });

  it('rejects an office it has no document for', () => {
    expect(() => evidencePdf({ ...base, office: 'clinic' })).toThrow(/clinic/);
  });
});
