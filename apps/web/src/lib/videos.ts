export type VideoSite = 'youtube' | 'vimeo' | 'peertube';

export interface VideoLink {
  site: VideoSite;
  /** The page to watch it on. */
  watchUrl: string;
  /** The player to load, only when someone asks for it. */
  embedUrl: string;
  /** Where the player comes from, to tell people before it loads. */
  host: string;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const PEERTUBE_ID =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[1-9A-HJ-NP-Za-km-z]{22})$/;

/**
 * Recognises a YouTube, Vimeo or PeerTube video link. YouTube plays from its no-cookie
 * domain, and Vimeo is asked not to track. Anything else is not a supported video link.
 */
export function parseVideoLink(input: string): VideoLink | undefined {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return undefined;
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const path = url.pathname.split('/').filter(Boolean);

  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    const id =
      host === 'youtu.be'
        ? path[0]
        : path[0] === 'watch'
          ? url.searchParams.get('v')
          : ['shorts', 'embed', 'live'].includes(path[0] ?? '')
            ? path[1]
            : undefined;
    if (!id || !YOUTUBE_ID.test(id)) return undefined;
    return {
      site: 'youtube',
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      host: 'youtube-nocookie.com',
    };
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = path.find((part) => /^\d{5,12}$/.test(part));
    if (!id) return undefined;
    return {
      site: 'vimeo',
      watchUrl: `https://vimeo.com/${id}`,
      embedUrl: `https://player.vimeo.com/video/${id}?dnt=1`,
      host: 'player.vimeo.com',
    };
  }

  // PeerTube runs on many independent servers: recognise its link shapes, on a real domain.
  const id =
    path[0] === 'w' && path.length === 2
      ? path[1]
      : path[0] === 'videos' && ['watch', 'embed'].includes(path[1] ?? '') && path.length === 3
        ? path[2]
        : undefined;
  if (id && PEERTUBE_ID.test(id) && host.includes('.') && !/^[\d.]+$/.test(host) && !url.port) {
    return {
      site: 'peertube',
      watchUrl: `https://${url.hostname}/w/${id}`,
      embedUrl: `https://${url.hostname}/videos/embed/${id}`,
      host: url.hostname.toLowerCase(),
    };
  }
  return undefined;
}
