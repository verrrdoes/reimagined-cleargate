// Small display helpers for the staff pages. Client-safe.

/** 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "BSCS · 3rd year" */
export function programYear(program: string, yearLevel: number): string {
  return `${program} · ${ordinal(yearLevel)} year`;
}

/** "1 conversation", "3 conversations" */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "PDF document", "JPG image" */
export function fileKind(mime: string): string {
  if (mime === 'application/pdf') return 'PDF document';
  if (mime === 'image/jpeg') return 'JPG image';
  if (mime === 'image/png') return 'PNG image';
  if (mime === 'image/webp') return 'WEBP image';
  return 'File';
}

/** "820 KB", "1.4 MB" */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const isImage = (mime: string) => mime.startsWith('image/');

/** The submission file route. `download` adds ?download=1 (Content-Disposition: attachment). */
export function submissionFileUrl(id: number, download = false): string {
  return `/api/files/submissions/${id}${download ? '?download=1' : ''}`;
}

/** First value of a search param. */
export function param(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

/** Case-insensitive "contains" across several fields. An empty query matches everything. */
export function matches(q: string, fields: (string | null | undefined)[]): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => (f ?? '').toLowerCase().includes(needle));
}

/**
 * Builds a link to `path` that keeps the current query, applies `changes` (null or '' removes a key)
 * and drops `page` unless it is one of the changes.
 */
export function hrefWith(path: string, current: Record<string, string>, changes: Record<string, string | number | null>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) if (v && k !== 'page') params.set(k, v);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === '') params.delete(k);
    else params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
