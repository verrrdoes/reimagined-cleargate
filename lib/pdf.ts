// A dependency-free one-page PDF: the standard Helvetica fonts (F1 regular, F2 bold, WinAnsi encoding) and one
// uncompressed content stream. Used by the clearance certificate and by the demo evidence in prisma/.
// No 'server-only' here: prisma/ scripts run by tsx outside Next load it too.

/** A4 portrait, in points. */
export const A4 = { w: 595.28, h: 841.89 };

export type Font = 'F1' | 'F2';

// WinAnsi bytes for the punctuation people type that Latin-1 lacks.
const WIN_ANSI: Record<string, number> = {
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '…': 0x85,
};

/** The text as WinAnsi characters: punctuation mapped, anything else outside Latin-1 becomes "?". */
function winAnsi(s: string): string {
  return Array.from(s, (ch) => {
    const mapped = WIN_ANSI[ch];
    if (mapped) return String.fromCharCode(mapped);
    const code = ch.codePointAt(0)!;
    if (code < 0x20) return ' ';
    return code > 0xff ? '?' : ch;
  }).join('');
}

/** A PDF literal string body in WinAnsi, with \ ( ) escaped. */
export function pdfString(s: string): string {
  return Array.from(winAnsi(s), (ch) => (ch === '\\' || ch === '(' || ch === ')' ? `\\${ch}` : ch)).join('');
}

// Advance widths (per 1000 units of the font size) of the printable ASCII characters, space to tilde,
// from the Adobe metrics of the standard fonts. Character 39 is quotesingle under WinAnsi.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
  556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611,
  611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
// A no-break space is as wide as a space and letters with accents as the plain letter; anything else unlisted
// takes a typical width.
const PLAIN: Record<string, string> = { '\u00a0': ' ', Ñ: 'N', ñ: 'n', É: 'E', é: 'e', Á: 'A', á: 'a', Í: 'I', í: 'i', Ó: 'O', ó: 'o', Ú: 'U', ú: 'u' };

/** Width of `s` in points when set in `font` at `size`. */
export function textWidth(s: string, font: Font, size: number): number {
  const table = font === 'F2' ? HELVETICA_BOLD : HELVETICA;
  let units = 0;
  for (const raw of s) {
    const ch = PLAIN[raw] ?? raw;
    const code = ch.codePointAt(0)!;
    if (code >= 32 && code <= 126) units += table[code - 32];
    else if (ch === '·') units += 278;
    else units += font === 'F2' ? 611 : 556;
  }
  return (units * size) / 1000;
}

const latin1 = (s: string) => Buffer.from(s, 'latin1');

/** One page of `content` (PDF operators) on a `size` page, with F1 = Helvetica and F2 = Helvetica-Bold. */
export function writePdf(content: string, size: { w: number; h: number } = A4, title?: string): Uint8Array<ArrayBuffer> {
  const stream = latin1(content);
  const bodies = [
    latin1('<< /Type /Catalog /Pages 2 0 R >>'),
    latin1('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    latin1(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.w} ${size.h}] ` +
        '/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    ),
    latin1('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    latin1('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
    Buffer.concat([latin1(`<< /Length ${stream.length} >>\nstream\n`), stream, latin1('\nendstream')]),
  ];
  if (title) bodies.push(latin1(`<< /Title (${pdfString(title)}) /Producer (ClearGate) >>`));

  const parts = [latin1('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  let offset = parts[0].length;
  const offsets: number[] = [];
  bodies.forEach((body, i) => {
    const obj = Buffer.concat([latin1(`${i + 1} 0 obj\n`), body, latin1('\nendobj\n')]);
    offsets.push(offset);
    parts.push(obj);
    offset += obj.length;
  });
  // Each cross-reference entry is exactly 20 bytes: 18 characters, a space and a newline.
  const xref = ['xref', `0 ${bodies.length + 1}`, '0000000000 65535 f ', ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n `)];
  const info = title ? ` /Info ${bodies.length} 0 R` : '';
  parts.push(
    latin1(`${xref.join('\n')}\ntrailer\n<< /Size ${bodies.length + 1} /Root 1 0 R${info} >>\nstartxref\n${offset}\n%%EOF\n`),
  );
  return new Uint8Array(Buffer.concat(parts));
}
