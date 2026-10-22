import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'match' | 'conflict' | 'unknown';

// Each status tone carries a glyph and a distinct border so meaning never relies on colour alone.
const tones: Record<BadgeTone, { className: string; icon: string | null }> = {
  neutral: { className: 'border-line bg-sunken text-fg', icon: null },
  match: { className: 'border-match-line bg-match-soft text-match', icon: '✓' },
  conflict: { className: 'border-conflict-line bg-conflict-soft text-conflict', icon: '✕' },
  unknown: {
    className: 'border-dashed border-unknown-line bg-unknown-soft text-unknown',
    icon: '?',
  },
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  const { className, icon } = tones[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm leading-tight font-semibold',
        className,
      )}
    >
      {icon && (
        <span className="font-bold" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
