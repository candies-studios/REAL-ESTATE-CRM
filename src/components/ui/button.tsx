import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-200 disabled:pointer-events-none disabled:opacity-55 whitespace-nowrap',
  {
    variants: {
      variant: {
        primary: 'bg-navy-900 text-ivory hover:bg-navy-700',
        gold: 'bg-gold-500 text-navy-950 hover:bg-gold-300',
        outline: 'border border-stone-300 bg-white text-navy-900 hover:border-navy-700 hover:bg-navy-50',
        ghost: 'text-navy-900 hover:bg-navy-50',
        light: 'border border-white/30 text-ivory hover:bg-white/10',
        danger: 'bg-danger-700 text-white hover:bg-danger-700/90',
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        md: 'h-11 px-5 text-sm',
        lg: 'h-12 px-7 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
