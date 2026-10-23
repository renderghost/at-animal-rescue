import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface GroupProps {
  /** A stable id, so a link can open the page at this question. */
  id?: string;
  legend: string;
  hint?: string;
  error?: string;
  className?: string;
}

/** A labelled group of controls, with hint and error text announced with the group. */
function Group({
  id: anchor,
  legend,
  hint,
  error,
  className,
  children,
}: GroupProps & { children: ReactNode }) {
  const generated = useId();
  const id = anchor ?? generated;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');
  return (
    <fieldset
      id={anchor}
      className={cn(
        'mb-6 target:rounded-sm target:outline-2 target:outline-offset-8 target:outline-accent',
        className,
      )}
      aria-describedby={describedBy || undefined}
    >
      <legend className="mb-1 font-semibold">{legend}</legend>
      {hint && (
        <p id={`${id}-hint`} className="mb-1 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mb-1 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">{children}</div>
    </fieldset>
  );
}

const control = 'size-5 shrink-0 accent-accent';

/** One answer from a set, as radio buttons. */
export function RadioGroup({
  name,
  options,
  defaultValue,
  ...group
}: GroupProps & {
  name: string;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
}) {
  return (
    <Group {...group}>
      {options.map(({ value, label }) => (
        <label key={value} className="flex items-center gap-2">
          <input
            type="radio"
            name={name}
            value={value}
            defaultChecked={defaultValue === value}
            className={control}
          />
          {label}
        </label>
      ))}
    </Group>
  );
}

/** Any number of answers, as checkboxes. Each has its own name, or shares one with a value. */
export function CheckboxGroup({
  options,
  checked,
  ...group
}: GroupProps & {
  options: Array<{ name: string; value?: string; label: string }>;
  checked: (name: string, value?: string) => boolean;
}) {
  return (
    <Group {...group}>
      {options.map(({ name, value, label }) => (
        <label key={`${name}=${value ?? ''}`} className="flex items-center gap-2">
          <input
            type="checkbox"
            name={name}
            value={value}
            defaultChecked={checked(name, value)}
            className={control}
          />
          {label}
        </label>
      ))}
    </Group>
  );
}
