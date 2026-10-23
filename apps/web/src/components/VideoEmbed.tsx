'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { parseVideoLink } from '@/lib/videos';
import { Button } from './Button';

const noSubscription = () => () => {};

/**
 * A video that loads from its host only when someone presses play (#32), so visiting a
 * page never tells YouTube, Vimeo or a PeerTube server about it. Without JavaScript, and
 * always alongside, there's a link to watch it on the host's site.
 */
export function VideoEmbed({
  url,
  label,
}: {
  url: string;
  /** Names the video in the play button and the player, e.g. 'video 2'. */
  label: string;
}) {
  const t = useTranslations('AnimalMedia');
  const common = useTranslations('GetStarted');
  const [playing, setPlaying] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const hintId = useId();
  const enhanced = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  useEffect(() => {
    if (playing) frame.current?.focus();
  }, [playing]);

  const video = parseVideoLink(url);
  if (!video) return null;
  const src = new URL(video.embedUrl);
  src.searchParams.set('autoplay', '1');

  return (
    <figure className="mb-6">
      {enhanced && (
        <div className="aspect-video w-full overflow-hidden rounded-md border border-line bg-surface">
          {playing ? (
            <iframe
              ref={frame}
              src={src.toString()}
              title={t('videoTitle', { label, host: video.host })}
              className="size-full"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="grid size-full place-content-center justify-items-center gap-2 p-4 text-center">
              <Button onClick={() => setPlaying(true)} aria-describedby={hintId}>
                <span aria-hidden="true">▶</span>
                {t('playLabel', { label })}
              </Button>
              <p id={hintId} className="text-sm text-muted">
                {t('playHint', { host: video.host })}
              </p>
            </div>
          )}
        </div>
      )}
      <figcaption className="mt-2">
        <a href={video.watchUrl} target="_blank" rel="noreferrer">
          {t('watchOn', { site: t(`sites.${video.site}`) })}
          <span className="sr-only"> {common('opensInNewTab')}</span>
          <span aria-hidden="true"> ↗</span>
        </a>
      </figcaption>
    </figure>
  );
}
