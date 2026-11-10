// The printable clearance certificate: one A4 page with the school, the student, every office and the day it
// cleared them, and a QR code that opens the public check page. Pure: the caller loads the data and signs the code.
import { A4, pdfString, textWidth, writePdf, type Font } from '@/lib/pdf';
import { qrModules, qrRuns } from '@/lib/qr';
import { TIME_ZONE, formatDate } from '@/lib/time';
import type { CertificateData } from '@/lib/certificate';

const INK = '0.067 0.094 0.153';
const GRAY = '0.42 0.45 0.5';
const RULE = '0.82 0.84 0.87';
const GREEN = '0.086 0.5 0.29';

/** A no-break space: the term and dates stay on one line. */
const NBSP = '\u00a0';

const fill = (c: string) => `${c} rg`;
const stroke = (c: string) => `${c} RG`;
const n = (v: number) => +v.toFixed(2);
/** PDF y for a distance from the top of the page. */
const y = (top: number) => n(A4.h - top);

function text(font: Font, size: number, color: string, x: number, top: number, s: string, spacing = 0): string {
  const tc = spacing ? `${spacing} Tc ` : '';
  return `q BT /${font} ${size} Tf ${tc}${fill(color)} ${n(x)} ${y(top)} Td (${pdfString(s)}) Tj ET Q`;
}

const widthOf = (s: string, font: Font, size: number, spacing = 0) => textWidth(s, font, size) + spacing * [...s].length;

function centered(font: Font, size: number, color: string, top: number, s: string, spacing = 0): string {
  return text(font, size, color, (A4.w - widthOf(s, font, size, spacing)) / 2, top, s, spacing);
}

function rightAligned(font: Font, size: number, color: string, right: number, top: number, s: string): string {
  return text(font, size, color, right - textWidth(s, font, size), top, s);
}

function line(x1: number, top1: number, x2: number, top2: number, color: string, width: number): string {
  return `q ${stroke(color)} ${width} w ${n(x1)} ${y(top1)} m ${n(x2)} ${y(top2)} l S Q`;
}

/** Greedy word wrap to `max` points. Only plain spaces break; keep words together with NBSP. */
function wrap(s: string, font: Font, size: number, max: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of s.split(/ +/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (current && textWidth(next, font, size) > max) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

/** "November 2, 2026", kept on one line. */
const longDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: TIME_ZONE }).format(new Date(iso)).replace(/ /g, NBSP);

const ordinal = (k: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = k % 100;
  return `${k}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const countWord = (k: number) => COUNT_WORDS[k] ?? String(k);

/** A small green check mark with its lower left at (x, top). */
const check = (x: number, top: number) =>
  `q ${stroke(GREEN)} 1.4 w 1 J 1 j ${n(x)} ${y(top - 4)} m ${n(x + 3)} ${y(top - 1)} l ${n(x + 8.5)} ${y(top - 8)} l S Q`;

export function certificatePdf(data: CertificateData, verifyUrl: string): Uint8Array<ArrayBuffer> {
  const ops: string[] = [];
  const W = A4.w;

  // A double rule around the page.
  ops.push(`q ${stroke(INK)} 1.2 w 28 28 ${n(W - 56)} ${n(A4.h - 56)} re S Q`);
  ops.push(`q ${stroke(INK)} 0.4 w 34 34 ${n(W - 68)} ${n(A4.h - 68)} re S Q`);

  // School and title.
  const schoolSize = Math.min(17, 460 / widthOf(data.school, 'F2', 1, 0.1));
  ops.push(centered('F2', n(schoolSize), INK, 92, data.school, 1.5));
  ops.push(centered('F1', 10, GRAY, 110, 'End-of-term student clearance'));
  ops.push(line(W / 2 - 30, 126, W / 2 + 30, 126, INK, 0.8));
  ops.push(centered('F2', 30, INK, 180, 'Certificate of Clearance'));

  // The student.
  ops.push(centered('F1', 12, GRAY, 222, 'This certifies that'));
  const nameSize = n(Math.min(24, 440 / textWidth(data.student.name, 'F2', 1)));
  ops.push(centered('F2', nameSize, INK, 258, data.student.name));
  ops.push(line(W / 2 - 160, 270, W / 2 + 160, 270, RULE, 0.8));
  const s = data.student;
  ops.push(centered('F1', 11, INK, 290, `${s.programName} · ${ordinal(s.yearLevel)} year · Student no. ${s.number}`));

  const total = data.offices.length;
  const statement =
    `has been cleared by ${total === 6 ? 'all six' : `all ${countWord(total)}`} offices of the college for the ` +
    `${data.termText.replace(/ /g, NBSP)}, with no outstanding obligations` +
    (data.clearedAt ? ` as of ${longDate(data.clearedAt)}.` : '.');
  let top = 324;
  for (const l of wrap(statement, 'F1', 12, 420)) {
    ops.push(centered('F1', 12, INK, top, l));
    top += 18;
  }

  // The offices.
  const tableX = (W - 380) / 2;
  const tableRight = tableX + 380;
  top += 26;
  ops.push(text('F2', 8, GRAY, tableX, top, 'OFFICE', 0.6));
  ops.push(rightAligned('F2', 8, GRAY, tableRight - 4, top, 'CLEARED ON'));
  top += 8;
  ops.push(line(tableX, top, tableRight, top, INK, 0.6));
  for (const o of data.offices) {
    const row = top + 16;
    if (o.status === 'approved') ops.push(check(tableX + 2, row));
    ops.push(text('F1', 11, INK, tableX + 18, row, o.name));
    ops.push(rightAligned('F1', 11, INK, tableRight - 4, row, o.approvedAt && o.status === 'approved' ? formatDate(o.approvedAt) : 'Not cleared'));
    top += 24;
    ops.push(line(tableX, top, tableRight, top, RULE, 0.5));
  }

  // The QR code and the numbers to check it by.
  const qrTop = Math.max(top + 40, 610);
  const modules = qrModules(verifyUrl);
  const quiet = 2;
  const qrSize = 116;
  const unit = qrSize / (modules.length + 2 * quiet);
  const qrX = 72;
  ops.push(`q ${fill(INK)}`);
  for (const [r, c, len] of qrRuns(modules)) {
    const x = qrX + (c + quiet) * unit;
    const rowTop = qrTop + (r + quiet) * unit;
    // Slightly overlap neighbouring rows so viewers don't draw hairline gaps between them.
    ops.push(`${n(x)} ${n(A4.h - rowTop - unit - 0.05)} ${n(len * unit)} ${n(unit + 0.1)} re`);
  }
  ops.push('f Q');

  const infoX = qrX + qrSize + 20;
  const site = new URL(verifyUrl);
  ops.push(text('F2', 12, INK, infoX, qrTop + 18, 'Scan to check this certificate'));
  let infoTop = qrTop + 34;
  for (const l of [`Or open ${site.host}/verify`, 'and type the verification code.']) {
    ops.push(text('F1', 9.5, GRAY, infoX, infoTop, l));
    infoTop += 13;
  }
  const facts: [string, string][] = [
    ['Certificate no.', data.number],
    ['Verification code', data.code],
    ['Cleared on', data.clearedAt ? longDate(data.clearedAt) : 'Not yet cleared'],
  ];
  infoTop += 10;
  for (const [label, value] of facts) {
    ops.push(text('F1', 9.5, GRAY, infoX, infoTop, label));
    ops.push(text('F2', 10.5, INK, infoX + 96, infoTop, value));
    infoTop += 16;
  }

  // The fine print.
  const fine = [
    'No signature is needed: the QR code confirms it. The certificate is valid only while the check page says Valid,',
    `and stops being valid if an office reopens the clearance. Issued through ClearGate for ${data.school}.`,
  ];
  ops.push(centered('F1', 8, GRAY, 776, fine[0]));
  ops.push(centered('F1', 8, GRAY, 788, fine[1]));

  return writePdf(ops.join('\n'), A4, `Certificate of Clearance, ${data.student.name}`);
}
