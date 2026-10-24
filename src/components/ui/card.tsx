import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-[var(--radius-card)] border border-stone-200 bg-white shadow-[var(--shadow-card)]', className)}
      {...props}
    />
  );
}

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'gold' | 'navy' | 'success' | 'warning' | 'danger' }) {
  const tones = {
    neutral: 'bg-stone-100 text-stone-700',
    gold: 'bg-gold-100 text-gold-700',
    navy: 'bg-navy-100 text-navy-800',
    success: 'bg-success-100 text-success-700',
    warning: 'bg-warning-100 text-warning-700',
    danger: 'bg-danger-100 text-danger-700',
  };
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}
      {...props}
    />
  );
}

export function Logo({ name, light = false }: { name: string; light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <rect width="34" height="34" rx="9" className={light ? 'fill-ivory' : 'fill-navy-900'} />
        <path d="M8 24V14l9-6 9 6v10" fill="none" strokeWidth="2" className={light ? 'stroke-navy-900' : 'stroke-ivory'} />
        <path d="M14 24v-6h6v6" fill="none" strokeWidth="2" className="stroke-gold-500" />
      </svg>
      <span className={cn('font-display text-xl font-semibold tracking-tight', light ? 'text-ivory' : 'text-navy-900')}>
        {name}
      </span>
    </span>
  );
}
