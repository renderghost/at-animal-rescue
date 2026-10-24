'use client';

import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { Button } from './Button';

const noSubscription = () => () => {};

/**
 * Copies text to the clipboard. Only shown with JavaScript; without it, the text it sits
 * beside can be selected and copied by hand.
 */
export function CopyButton({ text }: { text: string }) {
  const t = useTranslations('Enquire');
  // False on the server and without a clipboard; true once running in a browser with one.
  const canCopy = useSyncExternalStore(
    noSubscription,
    () => Boolean(navigator.clipboard),
    () => false,
  );
  const [copied, setCopied] = useState(false);
  if (!canCopy) return null;
  return (
    <p className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
      >
        {t('copy')}
      </Button>
      <span role="status" className="text-sm">
        {copied ? t('copied') : ''}
      </span>
    </p>
  );
}
