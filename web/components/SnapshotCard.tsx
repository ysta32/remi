'use client';

import { useEffect, useState } from 'react';
import type { ElderProfile } from '@/lib/api';
import { formatDay, formatDuration, formatTime } from '@/lib/format';
import { snapshotCaption } from '@/lib/snapshot';
import type { CallCard } from '@/lib/types';
import { PhotoWindow } from './PhotoWindow';
import { SimulatedBadge } from './SimulatedBadge';
import { useSeen } from './useSeen';

const MOOD: Record<NonNullable<CallCard['mood']>, string> = {
  positive: 'In good spirits',
  neutral: 'Steady',
  low: 'Seemed a bit low',
};

const NEW_TAG_MS = 8_000; // stays this long after the card has actually been on screen

export function SnapshotCard({
  call, variant, isNew, confirmed, photos, name,
}: {
  call: CallCard;
  variant: 'feature' | 'compact';
  isNew: boolean;
  confirmed: boolean;
  photos: ElderProfile['photos'];
  name: string;
}) {
  const [ref, seen] = useSeen<HTMLElement>();
  const [newExpired, setNewExpired] = useState(false);
  useEffect(() => {
    if (!isNew || !seen) return;
    const t = setTimeout(() => setNewExpired(true), NEW_TAG_MS);
    return () => clearTimeout(t);
  }, [isNew, seen]);

  const feature = variant === 'feature';
  const busy = call.status === 'processing' || call.status === 'in_progress';
  const { caption, body } = snapshotCaption(call);
  const photo = confirmed ? call.photosShown[0] ?? null : null;
  const duration = formatDuration(call.durationS);
  const showNew = isNew && !newExpired;

  return (
    <article
      ref={ref}
      className={`rounded-[10px] border border-line bg-card shadow-[0_16px_30px_-20px_rgba(0,0,0,0.35)] ${
        feature ? 'p-4 pb-7 md:-rotate-1 md:p-5 md:pb-8' : 'p-4 pb-6 md:rotate-[0.6deg]'
      } ${busy ? 'bg-[#f4f6f8]' : ''} ${isNew && call.status === 'done' ? 'animate-develop' : ''}`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className={`font-extrabold ${feature ? 'text-[22px]' : 'text-lg'}`}>{formatDay(call.startedAt)}</h3>
        <span className="text-base text-ink-2">
          {formatTime(call.startedAt)}
          {duration && ` · ${duration}`}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {showNew && <span className="rounded-full bg-family-strong px-3 py-0.5 text-base font-extrabold text-ink">New</span>}
        </span>
      </header>

      {busy ? (
        <div className="mt-4 space-y-2.5" role="status">
          <p className="font-bold text-ink">
            {call.status === 'in_progress' ? `${name} is chatting with Remi right now…` : 'Writing up today’s chat…'}
          </p>
          <div className="shimmer h-3 w-11/12 rounded-full" />
          <div className="shimmer h-3 w-4/5 rounded-full" />
          {feature && <div className="shimmer h-3 w-2/3 rounded-full" />}
        </div>
      ) : call.status === 'failed' ? (
        <p className="mt-3 text-ink-2">We couldn’t write up this chat. It still counts as a call.</p>
      ) : !confirmed ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-ink-2">
          Details appear after {name} confirms sharing.
          {call.isSimulated && <SimulatedBadge />}
        </p>
      ) : (
        <>
          {photo && (
            <div className="mt-3">
              <PhotoWindow photoId={photo.id} caption={photo.caption} photos={photos} size={variant} />
            </div>
          )}
          {caption && (
            <p className={`mt-3 font-caption leading-snug ${feature ? 'text-[26px]' : 'text-[22px]'}`}>{caption}</p>
          )}
          {body && <p className={`mt-1 text-ink ${feature ? '' : 'line-clamp-2'}`}>{body}</p>}
          {!caption && !body && <p className="mt-3 text-ink-2">No summary for this chat.</p>}

          {feature && call.familyQuestion && (
            <div className="mt-4 rounded-2xl bg-family px-4 py-3">
              <p className="text-base font-bold text-family-ink">
                {call.familyQuestion.askedBy} asked: “{call.familyQuestion.text}”
              </p>
              {call.familyQuestion.answer && <p className="mt-0.5">{call.familyQuestion.answer}</p>}
            </div>
          )}
          {(call.mood || call.isSimulated || (!feature && call.familyQuestion)) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!feature && call.familyQuestion && (
                <span className="rounded-full bg-family px-3 py-0.5 text-base font-bold text-family-ink">
                  {call.familyQuestion.askedBy}’s question
                </span>
              )}
              {call.mood && (
                <span className="rounded-full bg-ok px-3 py-0.5 text-base font-bold text-ok-ink">{MOOD[call.mood]}</span>
              )}
              {call.isSimulated && <SimulatedBadge />}
            </div>
          )}
        </>
      )}
    </article>
  );
}
