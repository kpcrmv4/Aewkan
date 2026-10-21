'use client';

import { Camera, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useLang } from '@/components/public/lang';
import { jobErrorText, jt } from '@/lib/copy/job';
import { formatTime } from '@/lib/format';
import { PhotoError, uploadJobPhoto, usePhotoUrl } from './job-client';
import type { PhotoKind, PhotoModel } from './model';
import { useJt } from './parts';

/** driver photo slot: camera input, compress + upload, then the signed-URL preview */
export function PhotoSlot({
  kind,
  bookingId,
  token,
  photo,
  onUploaded,
  readOnly = false,
}: {
  kind: PhotoKind;
  bookingId: string;
  token: string;
  photo: PhotoModel | null;
  onUploaded: () => void | Promise<void>;
  readOnly?: boolean;
}) {
  const { lang } = useLang();
  const t = useJt();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const url = usePhotoUrl(photo?.path ?? null);
  const label = kind === 'pickup' ? t('dvPhotoPickup') : t('dvPhotoDrop');

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { error } = await uploadJobPhoto(token, bookingId, kind, file);
      if (error) {
        toast.error(jobErrorText(error, lang));
        return;
      }
      await onUploaded();
    } catch (e) {
      toast.error(e instanceof PhotoError && e.kind === 'not_image' ? jt('photoNotImage', lang) : jt('photoFail', lang));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-3.5" data-testid={`photo-slot-${kind}`}>
      <div className="min-w-[200px] flex-1">
        {photo && url ? (
          // signed URL on a private bucket: next/image would proxy it for nothing
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="aspect-[4/3] w-full rounded-md border border-line object-cover" data-testid={`photo-${kind}`} />
        ) : (
          <div className="grid aspect-[4/3] w-full place-items-center rounded-md border-2 border-dashed border-line-strong bg-surface-2 p-3 text-center text-sm text-muted-token">
            <div>
              {busy ? <Loader2 className="mx-auto mb-1.5 size-7 animate-spin" aria-hidden /> : <Camera className="mx-auto mb-1.5 size-7" strokeWidth={1.5} aria-hidden />}
              {busy ? t('dvUploading') : photo ? '…' : label}
            </div>
          </div>
        )}
        {photo ? (
          <div className="mt-1 text-xs text-muted-token" data-testid={`photo-time-${kind}`}>
            {t('taken', { t: formatTime(photo.takenAt) })}
          </div>
        ) : null}
      </div>
      {readOnly ? null : (
      <div className="flex min-w-[180px] flex-1 flex-col gap-2">
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          data-testid={`photo-input-${kind}`}
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <button type="button" className="btn-secondary min-h-11" disabled={busy} aria-busy={busy || undefined} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
          {photo ? t('dvRetake') : label}
        </button>
        <p className="text-xs text-muted-token">{t('dvPhotoWhy')}</p>
      </div>
      )}
    </div>
  );
}
