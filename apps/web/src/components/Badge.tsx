import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'match' | 'conflict' | 'unknown';

// Each status tone carries a glyph and a distinct border so meaning never relies on colour alone.
const icons: Record<BadgeTone, string | null> = {
  neutral: null,
  match: '✓',
  conflict: '✕',
  unknown: '?',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  const icon = icons[tone];
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
