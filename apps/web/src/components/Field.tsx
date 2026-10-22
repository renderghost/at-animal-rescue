import { useId, type ComponentProps } from 'react';
import styles from './Field.module.css';

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
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      {hint && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className={styles.error}>
          {error}
        </span>
      )}
      <input
        id={inputId}
        className={[styles.input, className].filter(Boolean).join(' ')}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        {...inputProps}
      />
    </div>
  );
}
