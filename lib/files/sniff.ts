// File types from magic bytes, and safe file names (HANDOFF §11, legacy sniffType). Client-safe.

export const EVIDENCE_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type EvidenceMime = (typeof EVIDENCE_MIMES)[number];
export type ImageMime = (typeof IMAGE_MIMES)[number];

export const EXT_FOR: Record<EvidenceMime, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type Sniffed = { mime: EvidenceMime; ext: string };

const startsWith = (b: Uint8Array, sig: number[], at = 0) =>
  b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/** The real type of a file from its first 16 bytes (never from the name or the browser's type). */
export function sniff(bytes: Uint8Array): Sniffed | null {
  if (startsWith(bytes, ascii('%PDF-'))) return { mime: 'application/pdf', ext: 'pdf' };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg' };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', ext: 'png' };
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export const isEvidenceMime = (v: string): v is EvidenceMime => (EVIDENCE_MIMES as readonly string[]).includes(v);
export const isImageMime = (v: string): v is ImageMime => (IMAGE_MIMES as readonly string[]).includes(v);

/**
 * The name a student's file is shown under (legacy: basename, then anything other than letters,
 * digits, `_ . - ( )` and spaces becomes `_`, cut to 160). Falls back to `evidence.{ext}`.
 */
export function safeFileName(name: string, ext: string, fallbackBase = 'evidence'): string {
  const base = String(name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^\p{L}\p{N}_.\- ()]+/gu, '_').trim();
  const usable = cleaned !== '' && !/^[._ ]*$/.test(cleaned) ? cleaned : `${fallbackBase}.${ext}`;
  return Array.from(usable).slice(0, 160).join('');
}

/** A file name that is safe inside a Content-Disposition header: no quotes, CR, LF or other control characters. */
export function dispositionName(name: string): string {
  const cleaned = String(name ?? '').replace(/["\\\u0000-\u001f\u007f]/g, '').trim();
  return cleaned || 'file';
}

/** `inline|attachment; filename="ascii"; filename*=UTF-8''encoded` (header values must stay ASCII). */
export function contentDisposition(name: string, download: boolean): string {
  const safe = dispositionName(name);
  const fallback = safe.replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(safe).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `${download ? 'attachment' : 'inline'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
