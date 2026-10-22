import { useId, type ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type FieldProps = ComponentProps<'input'> & {
  label: string;
  hint?: string;
  error?: string;
};

/** Labelled text input with hint and error text wired up via aria-describedby. */
export function Field({ label, hint, error, id, className, ...inputProps }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="mb-6 grid gap-1">
      <label htmlFor={inputId} className="font-semibold">
        {label}
      </label>
      {hint && (
        <span id={hintId} className="text-sm text-muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="text-sm font-semibold text-danger">
          {error}
        </span>
      )}
      <input
        id={inputId}
        className={cn(
          'min-h-11 rounded-sm border border-line-strong bg-surface px-3 py-2 text-fg aria-invalid:border-2 aria-invalid:border-danger',
          className,
        )}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        {...inputProps}
      />
    </div>
  );
}
