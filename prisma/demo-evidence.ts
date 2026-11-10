// Demo evidence PDFs for the test data: one document per student and office, printed with that student's
// name and number and matching what the office asked for (prisma/test-data.ts REQUIREMENT). `flawed` makes
// the version an office returned, showing the problem named in its return reason (test-data.ts RETURNS).
// Written with the dependency-free one-page PDF writer in lib/pdf.ts.
import { pdfString, writePdf } from '../lib/pdf';
import { TIME_ZONE, manilaYear } from '../lib/time';

export const DEMO_EVIDENCE_OFFICES = ['library', 'accounting', 'registrar', 'guidance', 'dean', 'property'] as const;
export type EvidenceOffice = (typeof DEMO_EVIDENCE_OFFICES)[number];

export type EvidenceInput = {
  office: string;
  /** As stored on the student record, e.g. "PATRICIA GONZALES". */
  studentName: string;
  studentNumber: string;
  /** "1st Semester, A.Y 2026 - 2027" */
  termText: string;
  /** The date printed on the document (Manila time). */
  issuedAt: Date;
  /** The returned version: shows the problem the office returned it for. */
  flawed?: boolean;
};

type Group = { head: string; lines: string[] };
type Doc = { eyebrow: string; title: string; docLine: string; box: Group[]; footer: string[] };

const isOffice = (code: string): code is EvidenceOffice => (DEMO_EVIDENCE_OFFICES as readonly string[]).includes(code);

const longDate = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TIME_ZONE }).format(d);

/** "1st Semester, A.Y 2026 - 2027" → "2nd Semester, A.Y 2025 - 2026" (the dean's returned grade sheet). */
function previousTerm(termText: string): string {
  const m = /^(1st Semester|2nd Semester|Summer), A\.Y (\d{4}) - (\d{4})$/.exec(termText);
  if (!m) return 'Previous semester';
  const [, term, from, to] = m;
  if (term === '1st Semester') return `2nd Semester, A.Y ${Number(from) - 1} - ${Number(to) - 1}`;
  if (term === '2nd Semester') return `1st Semester, A.Y ${from} - ${to}`;
  return `2nd Semester, A.Y ${from} - ${to}`;
}

function documentFor(office: EvidenceOffice, input: EvidenceInput): Doc {
  const flawed = input.flawed ?? false;
  const date = longDate(input.issuedAt);
  const year = manilaYear(input.issuedAt);
  const serial = input.studentNumber.replace(/\D/g, '').slice(-4).padStart(4, '0');
  const no = (prefix: string) => `${prefix}-${year}-${serial}`;

  switch (office) {
    case 'library': {
      const books: Group[] = [
        { head: 'Introduction to Computing', lines: ['Accession no. 004218'] },
        { head: 'Principles of Accounting', lines: ['Accession no. 005731'] },
      ];
      const shown = flawed ? books.slice(0, 1) : books;
      return {
        eyebrow: 'SAMPLE COLLEGE · LIBRARY',
        title: 'Book Return Acknowledgment',
        docLine: `Return no. ${no('LR')} · ${date}`,
        box: [...shown, { head: shown.length === 1 ? '1 book returned' : `${shown.length} books returned`, lines: [] }],
        footer: ['Received by: J. Resoso, Head Librarian (signed)'],
      };
    }
    case 'accounting':
      return {
        eyebrow: 'SAMPLE COLLEGE · ACCOUNTING',
        title: 'Official Receipt',
        docLine: `Issued ${date}`,
        box: [
          { head: 'Amount', lines: ['PHP 5,250.00'] },
          { head: 'Payment for', lines: [`Tuition balance, ${input.termText}`] },
        ],
        // The OR number and cashier sit at the bottom of the receipt; the returned photo cut them off.
        footer: flawed ? [] : [`OR no. 00${serial}${String(year).slice(-1)}`, 'Cashier: J. Ramos'],
      };
    case 'registrar':
      return flawed
        ? {
            eyebrow: 'SAMPLE NATIONAL HIGH SCHOOL',
            title: 'Form 138 (Report Card)',
            docLine: `Ref. no. ${no('RC')} · ${date}`,
            box: [{ head: 'Learner Progress Report Card', lines: ['Grade 12 · School year 2025 - 2026'] }],
            footer: ['Class adviser: L. Bautista (signed)'],
          }
        : {
            eyebrow: 'SAMPLE NATIONAL HIGH SCHOOL',
            title: 'Form 137 (Permanent Record)',
            docLine: `Ref. no. ${no('PR')} · ${date}`,
            box: [
              { head: 'Secondary School Permanent Record', lines: ['Grades 7 to 12 · Senior High School, STEM strand'] },
              { head: 'Certified true copy', lines: ['Released to Sample College on request'] },
            ],
            footer: ['School registrar: M. Villareal (signed)'],
          };
    case 'guidance':
      return {
        eyebrow: 'SAMPLE COLLEGE · GUIDANCE OFFICE',
        title: 'Exit Interview Form',
        docLine: `Form no. ${no('EI')} · ${date}`,
        box: [
          { head: 'Exit interview completed', lines: [input.termText] },
          { head: 'Counselor', lines: ['Yel Tapnio, Guidance Counselor'] },
        ],
        footer: [flawed ? 'Counselor signature: ________________ (not signed)' : 'Counselor signature: Y. Tapnio (signed)'],
      };
    case 'dean':
      return {
        eyebrow: "SAMPLE COLLEGE · DEAN'S OFFICE",
        title: 'Grade Sheet',
        docLine: `Ref. no. ${no('GS')} · ${date}`,
        box: [{ head: flawed ? previousTerm(input.termText) : input.termText, lines: ['All subjects graded · No incomplete grades'] }],
        footer: ['Adviser signature: Prof. R. Santos (signed)'],
      };
    case 'property':
      return {
        eyebrow: 'SAMPLE COLLEGE · PROPERTY CUSTODIAN',
        title: 'Equipment Return Form',
        docLine: `Form no. ${no('ER')} · ${date}`,
        box: [
          { head: 'Digital multimeter', lines: ['Property no. EQ-0417 · Returned in good condition'] },
          { head: '1 item returned', lines: [] },
        ],
        footer: [
          flawed
            ? 'Custodian acknowledgment: ________________ (no acknowledgment)'
            : 'Custodian acknowledgment: E. Maritinito (signed)',
        ],
      };
  }
}

/* ---------- PDF writing ---------- */

const PAGE = { w: 595.28, h: 841.89, x: 56, width: 483.28 };
const DARK = '0.067 0.094 0.153 rg';
const GRAY = '0.42 0.45 0.5 rg';
const BOX_FILL = '0.937 0.949 0.965 rg';

const text = (font: 'F1' | 'F2', size: number, color: string, y: number, s: string, x = PAGE.x) =>
  `BT /${font} ${size} Tf ${color} ${x} ${y} Td (${pdfString(s)}) Tj ET`;
const BOX_TEXT_X = PAGE.x + 16;

function contentStream(doc: Doc, input: EvidenceInput): string {
  const ops = [
    text('F1', 10, GRAY, 772, doc.eyebrow),
    text('F2', 24, DARK, 740, doc.title),
    text('F1', 10, GRAY, 720, doc.docLine),
    text('F1', 10, GRAY, 676, 'Student name'),
    text('F2', 14, DARK, 658, input.studentName),
    text('F1', 10, GRAY, 628, 'Student ID'),
    text('F2', 14, DARK, 610, input.studentNumber),
  ];

  const top = 586;
  const inner = doc.box.reduce((h, g) => h + 16 + 16 * g.lines.length, 0) + 8 * (doc.box.length - 1);
  const boxHeight = 18 + inner + 8;
  ops.push(`q ${BOX_FILL} ${PAGE.x} ${top - boxHeight} ${PAGE.width} ${boxHeight} re f Q`);
  let y = top - 27;
  for (const g of doc.box) {
    ops.push(text('F2', 11, DARK, y, g.head, BOX_TEXT_X));
    y -= 16;
    for (const line of g.lines) {
      ops.push(text('F1', 10, GRAY, y, line, BOX_TEXT_X));
      y -= 16;
    }
    y -= 8;
  }

  let fy = top - boxHeight - 32;
  for (const line of doc.footer) {
    ops.push(text('F1', 10, GRAY, fy, line));
    fy -= 16;
  }
  ops.push(text('F1', 9, GRAY, 60, 'Demo evidence for the ClearGate sample data. Not a real document.'));
  return ops.join('\n');
}

/** The demo document a student uploaded to `office`, with their own name and number on it. */
export function evidencePdf(input: EvidenceInput): Uint8Array {
  if (!isOffice(input.office)) throw new Error(`No demo document for office "${input.office}".`);
  return writePdf(contentStream(documentFor(input.office, input), input));
}
