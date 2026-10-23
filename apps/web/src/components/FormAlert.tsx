'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The problem after submitting, announced and focused so it's read first. Forms re-mount
 * after each submission, so this runs every time it appears.
 */
export function FormAlert({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <p
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="mb-6 rounded-md border border-conflict-line bg-conflict-soft p-4 text-conflict"
    >
      {children}
    </p>
  );
}
