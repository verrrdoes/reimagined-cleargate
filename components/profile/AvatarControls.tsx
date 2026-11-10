'use client';

import { useRef, useState, useTransition, type ChangeEvent } from 'react';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/deadlines/ConfirmDialog';
import { button, fieldHint } from '@/components/ui/recipes';
import { removeAvatar, uploadAvatar } from '@/lib/actions/profile';
import { IMAGE_MIMES } from '@/lib/files/sniff';
import { MB } from '@/lib/constants';

/** Originals up to this size are accepted; the browser re-encodes them well under the 2 MB upload limit. */
const MAX_ORIGINAL_MB = 15;
/** Longest side of the stored picture. */
const OUTPUT_PX = 512;

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() };
    } catch {
      // Older browsers: fall back to an <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Centre-crops the picture to a square, at most 512 px, as a JPEG (transparent areas become white). */
async function squareJpeg(file: File): Promise<Blob> {
  const { source, width, height, done } = await decode(file);
  try {
    const side = Math.min(width, height);
    if (!side) throw new Error('Empty image');
    const out = Math.min(OUTPUT_PX, side);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, out, out);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, out, out);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the picture'))), 'image/jpeg', 0.9),
    );
  } finally {
    done();
  }
}

/** "Upload a picture" / "Change picture" and "Remove", with the file picker. */
export function AvatarControls({ hasAvatar, hasPhotoFallback }: { hasAvatar: boolean; hasPhotoFallback: boolean }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!(IMAGE_MIMES as readonly string[]).includes(file.type)) {
      toast.error('Choose a JPG, PNG or WEBP picture.');
      return;
    }
    if (file.size > MAX_ORIGINAL_MB * MB) {
      toast.error(`That picture is too large. Choose one under ${MAX_ORIGINAL_MB} MB.`);
      return;
    }
    startTransition(async () => {
      let blob: Blob;
      try {
        blob = await squareJpeg(file);
      } catch {
        toast.error('That picture could not be opened. Try a different one.');
        return;
      }
      toast.info('Uploading your picture…');
      const form = new FormData();
      form.append('avatar', blob, 'avatar.jpg');
      const res = await uploadAvatar(form);
      if (res.ok) toast.success('Profile picture updated.');
      else toast.error(res.error.message);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5 text-right max-sm:col-span-full max-sm:items-start max-sm:text-left">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button({ size: 'sm' })} onClick={() => inputRef.current?.click()} disabled={pending}>
          {pending ? 'Uploading…' : hasAvatar ? 'Change picture' : 'Upload a picture'}
        </button>
        {hasAvatar ? (
          <button type="button" className={button({ variant: 'ghost', size: 'sm' })} onClick={() => setConfirming(true)} disabled={pending}>
            Remove
          </button>
        ) : null}
      </div>
      <p className={fieldHint}>JPG, PNG or WEBP, up to {MAX_ORIGINAL_MB} MB. It&apos;s cropped to a square.</p>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_MIMES.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onPick}
      />
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Remove your profile picture?"
        body={hasPhotoFallback ? 'Your application photo will show instead.' : 'Your initials will show instead.'}
        confirmLabel="Remove picture"
        success="Picture removed."
        run={() => removeAvatar()}
      />
    </div>
  );
}
