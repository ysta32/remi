'use client';

import { useState } from 'react';
import type { ElderProfile } from '@/lib/api';

// The family photo discussed on a call. No licensed photos exist yet, so a missing or broken
// image falls back to an honest panel with a photo icon, never a gradient.
export function PhotoWindow({
  photoId, caption, photos, size,
}: { photoId: string | null; caption: string | null; photos: ElderProfile['photos']; size: 'feature' | 'compact' }) {
  const url = photoId ? photos.find((p) => p.id === photoId)?.imageUrl : undefined;
  const [failed, setFailed] = useState(false);
  const height = size === 'feature' ? 'h-40 md:h-[220px]' : 'h-24';

  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- API-served family photo of unknown size
      <img src={url} alt={caption ?? 'Family photo'} onError={() => setFailed(true)} className={`${height} w-full rounded-[4px] object-cover`} />
    );
  }
  return (
    <div className={`${height} grid place-items-center rounded-[4px] bg-sky-soft text-[#3a6aa0]`} role="img" aria-label={caption ? `Photo: ${caption}` : 'Family photo'}>
      <svg width="48" height="40" viewBox="0 0 24 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1.5" y="3.5" width="21" height="15" rx="2.5" />
        <path d="M8 3.5 9.5 1.5h5L16 3.5" />
        <circle cx="12" cy="11" r="4" />
      </svg>
    </div>
  );
}
