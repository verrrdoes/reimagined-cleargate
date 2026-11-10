import 'server-only';
import { contentDisposition } from '@/lib/files/sniff';

export type CsvCell = string | number | boolean | null | undefined;

/** Excel reads the file as UTF-8 (ñ, ₱) only when it starts with a byte order mark. */
const BOM = '\uFEFF';

/**
 * A string cell that starts with = + - or @ is read by Excel as a formula, so it is prefixed with '
 * (HANDOFF §8.10). A leading tab or carriage return is treated the same way (OWASP CSV injection list).
 */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'string' ? value : String(value);
  if (typeof value === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  // Quote like PHP's fputcsv: when the value holds the delimiter, a quote, a line break, a tab or a space.
  return /[",\r\n\t ]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A CSV document: UTF-8 BOM, comma separated, CRLF line endings, quoted where needed. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [header.map(cell).join(',')];
  for (const row of rows) lines.push(row.map(cell).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** A download response for a CSV document. Never cached: the data is private and changes. */
export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition(filename, true),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
