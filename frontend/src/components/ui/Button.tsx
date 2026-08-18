import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'gold';
type ButtonSize = 'default' | 'sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'border border-border bg-card text-foreground hover:bg-muted',
  ghost: 'bg-transparent text-muted-foreground hover:bg-muted',
  // Upgrade / pay CTA — « or = plan payant ». Dark text on the gold gradient
  // (white on gold fails WCAG AA); see globals.css --color-gold-*.
  gold: 'bg-linear-to-br from-gold-300 to-gold-500 text-gold-900 hover:brightness-95',
};

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-10 gap-2 px-4 text-sm',
  sm: 'h-9 gap-1.5 px-3 text-xs',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'default',
      loading = false,
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'flex w-full items-center justify-center rounded-md font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
