'use client';

import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-lg border border-stone-300 bg-white px-3.5 text-[15px] text-stone-900 placeholder:text-stone-500 transition-colors focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-gold-300 aria-[invalid=true]:border-danger-700';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(control, 'h-11', className)} {...props} />,
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn(control, 'h-11 pr-8', className)} {...props} />
  ),
);
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-semibold text-navy-900', className)} {...props} />;
}

/**
 * Label + control + hint + error, wired up with ids for screen readers.
 * The child receives id / aria-describedby / aria-invalid via render prop.
 */
export function Field({
  label,
  hint,
  error,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional && <span className="ml-1.5 font-normal text-stone-500">(optional)</span>}
      </Label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-stone-600">{hint}</p>
      )}
      {error && (
        <p id={errId} className="text-xs font-medium text-danger-700">{error}</p>
      )}
    </div>
  );
}

export function FormAlert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: React.ReactNode }) {
  const tones = {
    error: 'border-danger-700/30 bg-danger-100 text-danger-700',
    success: 'border-success-700/30 bg-success-100 text-success-700',
    info: 'border-navy-600/20 bg-navy-50 text-navy-800',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-lg border px-4 py-3 text-sm', tones[tone])}>
      {children}
    </div>
  );
}
