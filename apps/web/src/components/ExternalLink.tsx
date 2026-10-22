import { getTranslations } from 'next-intl/server';
import type { ComponentProps } from 'react';

/** Opens in a new tab, telling screen-reader users so. */
export async function ExternalLink({ children, ...props }: ComponentProps<'a'>) {
  const t = await getTranslations('GetStarted');
  return (
    <a target="_blank" rel="noreferrer" {...props}>
      {children}
      <span className="sr-only"> {t('opensInNewTab')}</span>
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}
