import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface LabelProps {
  label: string;
  hint?: string;
  error?: string;
}

const control =
  'min-h-11 min-w-0 rounded-sm border border-line-strong bg-surface px-3 py-2 text-base text-fg aria-invalid:border-2 aria-invalid:border-danger';

/** Label, hint and error text for one control, wired up via aria-describedby. */
function Labelled({
  id,
  label,
  hint,
  error,
  children,
}: LabelProps & {
  id?: string;
  children: (props: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: true;
  }) => ReactNode;
}) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;

  return (
    <div className="mb-6 grid min-w-0 gap-1">
      <label htmlFor={controlId} className="font-semibold">
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
      {children({
        id: controlId,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
        'aria-invalid': error ? true : undefined,
      })}
    </div>
  );
}

/** Labelled text input. */
export function Field({
  label,
  hint,
  error,
  id,
  className,
  ...inputProps
}: ComponentProps<'input'> & LabelProps) {
  return (
    <Labelled id={id} label={label} hint={hint} error={error}>
      {(aria) => <input className={cn(control, className)} {...aria} {...inputProps} />}
    </Labelled>
  );
}

/** Labelled multi-line text input. */
export function TextArea({
  label,
  hint,
  error,
  id,
  className,
  ...textareaProps
}: ComponentProps<'textarea'> & LabelProps) {
  return (
    <Labelled id={id} label={label} hint={hint} error={error}>
      {(aria) => (
        <textarea
          rows={6}
          className={cn(control, 'leading-relaxed', className)}
          {...aria}
          {...textareaProps}
        />
      )}
    </Labelled>
  );
}

/** Labelled select. */
export function Select({
  label,
  hint,
  error,
  id,
  className,
  ...selectProps
}: ComponentProps<'select'> & LabelProps) {
  return (
    <Labelled id={id} label={label} hint={hint} error={error}>
      {(aria) => <select className={cn(control, className)} {...aria} {...selectProps} />}
    </Labelled>
  );
}
