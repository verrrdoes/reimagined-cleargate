// Browser side of the presigned upload (HANDOFF §11). Client-safe: no server imports.
//   1. POST /api/uploads/presign  → { url, method, headers, ticket }
//   2. PUT the file straight to storage (XMLHttpRequest, so progress can be reported)
//   3. The caller passes `ticket` to its finalize Server Action.

export type UploadRequest = { kind: 'evidence'; itemId: number } | { kind: 'photo' };
export type UploadResult = { ticket: string } | { error: string };

type Presigned = { url: string; method: 'PUT'; headers: Record<string, string>; ticket: string };
type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

const UNFINISHED = 'The upload did not finish. Please try again.';

const BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** The type to declare for a file: the browser's, normalised, or a guess from the extension when it gave none. */
export function declaredType(file: File): string {
  const t = (file.type || '').toLowerCase();
  if (t === 'image/jpg' || t === 'image/pjpeg') return 'image/jpeg';
  if (t) return t;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[ext] ?? 'application/octet-stream';
}

function put(p: Presigned, file: File, contentType: string, onProgress?: (percent: number) => void): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(p.method || 'PUT', p.url, true);
    for (const [name, value] of Object.entries(p.headers ?? {})) xhr.setRequestHeader(name, value);
    if (!Object.keys(p.headers ?? {}).some((h) => h.toLowerCase() === 'content-type')) xhr.setRequestHeader('Content-Type', contentType);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve({ ticket: p.ticket });
        return;
      }
      // The local development driver answers with the JSON envelope; buckets answer with XML.
      try {
        const body = JSON.parse(xhr.responseText) as Envelope<unknown>;
        if (!body.ok && body.error?.message) {
          resolve({ error: body.error.message });
          return;
        }
      } catch {
        /* not JSON */
      }
      resolve({ error: xhr.status === 403 ? 'The upload expired. Choose the file again.' : UNFINISHED });
    };
    xhr.onerror = () => resolve({ error: UNFINISHED });
    xhr.onabort = () => resolve({ error: UNFINISHED });
    xhr.ontimeout = () => resolve({ error: UNFINISHED });
    xhr.send(file);
  });
}

/**
 * Presigns and uploads one file. Resolves to `{ ticket }` on success or `{ error }` with a message
 * to show the user (the server's exact message for size, type and permission problems).
 * `onProgress` receives 0–100 while the file uploads.
 */
export async function uploadFile(file: File, request: UploadRequest, onProgress?: (percent: number) => void): Promise<UploadResult> {
  if (!file || file.size < 1) return { error: request.kind === 'photo' ? 'Choose a photo to upload.' : 'Choose a file to upload.' };
  const contentType = declaredType(file);

  let presigned: Presigned;
  try {
    const res = await fetch('/api/uploads/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ ...request, contentType, size: file.size }),
    });
    const body = (await res.json().catch(() => null)) as Envelope<Presigned> | null;
    if (!body) return { error: UNFINISHED };
    if (!body.ok) return { error: body.error.message };
    presigned = body.data;
  } catch {
    return { error: UNFINISHED };
  }

  onProgress?.(0);
  return put(presigned, file, contentType, onProgress);
}
