import { describe, expect, it } from 'vitest';
import { parseVideoLink } from './videos';

describe('parseVideoLink', () => {
  it('recognises YouTube links and plays them from the no-cookie domain', () => {
    const expected = {
      site: 'youtube',
      watchUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      host: 'youtube-nocookie.com',
    };
    for (const link of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      expect(parseVideoLink(link)).toEqual(expected);
    }
  });

  it('recognises Vimeo links and asks Vimeo not to track', () => {
    expect(parseVideoLink('https://vimeo.com/76979871')).toMatchObject({
      site: 'vimeo',
      embedUrl: 'https://player.vimeo.com/video/76979871?dnt=1',
    });
  });

  it('recognises PeerTube links on any instance', () => {
    expect(
      parseVideoLink('https://tube.example.eu/w/9c9de5e8-0a1e-484a-b099-e80766180a6d'),
    ).toEqual({
      site: 'peertube',
      watchUrl: 'https://tube.example.eu/w/9c9de5e8-0a1e-484a-b099-e80766180a6d',
      embedUrl: 'https://tube.example.eu/videos/embed/9c9de5e8-0a1e-484a-b099-e80766180a6d',
      host: 'tube.example.eu',
    });
    expect(
      parseVideoLink('https://peertube.example/videos/watch/kkGMgK9ZtnKfYAgnEtQxbv'),
    ).toMatchObject({ site: 'peertube', host: 'peertube.example' });
  });

  it('rejects everything else', () => {
    for (const link of [
      'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=short',
      'https://vimeo.com/channels/staffpicks',
      'https://example.com/video.mp4',
      'https://192.168.1.10/w/kkGMgK9ZtnKfYAgnEtQxbv',
      'https://tube.example:8443/w/kkGMgK9ZtnKfYAgnEtQxbv',
      'not a link',
    ]) {
      expect(parseVideoLink(link)).toBeUndefined();
    }
  });
});
