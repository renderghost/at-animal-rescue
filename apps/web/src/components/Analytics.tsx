'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { useEffect, useState } from 'react';
import { redactPath } from '@/lib/analytics';

type Payload = Record<string, unknown>;
type Umami = { track(payload: (props: Payload) => Payload): void };

/**
 * Cookie-free page views with self-hosted Umami (#46), only when it's configured. Page
 * views are sent by hand so share-link secrets are redacted and query strings never leave
 * the browser; Do Not Track is respected.
 */
export function Analytics({ src, websiteId }: { src: string; websiteId: string }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const shared = pathname.startsWith('/share/');
    (window as { umami?: Umami }).umami?.track((props) => ({
      ...props,
      url: redactPath(pathname),
      referrer: redactPath(String(props.referrer ?? '')),
      // A share page's title names the adopter.
      title: shared ? '' : props.title,
    }));
  }, [ready, pathname]);

  return (
    <Script
      src={src}
      data-website-id={websiteId}
      data-auto-track="false"
      data-do-not-track="true"
      strategy="afterInteractive"
      onReady={() => setReady(true)}
    />
  );
}
