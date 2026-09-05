'use client';

// Banani form atoms of the subject pages (add-matiere.md): `.card` /
// `.card-title` / `.card-subtitle`, `.form-group` / `.form-label` /
// `.form-label-hint` / `.form-required` / `.form-hint`, `.form-input` (8px 12px,
// 13px), `.form-select`, `.form-textarea`, `.toggle-row`, `.section-divider`.
// Sized deliberately tighter than the generic ui/Field (h-10, 14px) to match
// the mock's 36px controls; kept local to the subject screens.
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { useTranslations } from 'next-intl';
import { SelectItem } from '@/components/ui/Select';
import { cn } from '@/lib/utils';

export { SelectItem };

export function FormCard({
  id,
  icon,
  title,
  subtitle,
  className,
  children,
}: {
  id?: string;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn('scroll-mt-24 rounded-lg bg-card px-4 py-4 sm:px-5 sm:py-[18px]', className)}
    >
      <h2 className="mb-[3px] flex items-center gap-[7px] text-caption font-bold text-foreground">
        <span className="flex shrink-0 text-primary">{icon}</span>
        {title}
      </h2>
      {subtitle && <p className="mb-3.5 text-xs text-muted-foreground">{subtitle}</p>}
      {children}
    </section>
  );
}

export function FormGroup({
  label,
  required,
  optional,
  labelHint,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  /** Free-form suffix like "(h)". */
  labelHint?: string;
  hint?: string;
  error?: string | undefined;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations('Configuration.common');
  return (
    <div
      className={cn('flex flex-col gap-[5px]', className)}
      data-field-error={error ? 'true' : undefined}
    >
      <label htmlFor={htmlFor} className="text-xs font-semibold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive-foreground">*</span>}
        {optional && (
          <span className="ml-[3px] text-2xs font-normal text-muted-foreground">
            {t('optional')}
          </span>
        )}
        {labelHint && (
          <span className="ml-[3px] text-2xs font-normal text-muted-foreground">{labelHint}</span>
        )}
      </label>
      {children}
      {error ? (
        <span role="alert" className="text-2xs text-destructive-foreground">
          {error}
        </span>
      ) : (
        hint && <span className="text-2xs text-muted-foreground">{hint}</span>
      )}
    </div>
  );
}

const CONTROL =
  'w-full rounded-md border border-border bg-input px-3 py-2 text-caption text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-70';

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(CONTROL, className)} {...props} />
  ),
);
TextInput.displayName = 'TextInput';

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, 'min-h-[72px] resize-y', className)} {...props} />;
}

/** Radix select trigger styled like `.form-select` (no built-in label —
 * wrap in FormGroup). Pass `''` for "no selection". */
export function BareSelect({
  value,
  onValueChange,
  placeholder,
  disabled,
  id,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}) {
  // '' on the Root shows the placeholder; SelectItem maps a '' option to this
  // sentinel (Radix refuses empty item values), so translate it back.
  const EMPTY = '__empty__';
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(v) => onValueChange(v === EMPTY ? '' : v)}
      {...(disabled !== undefined ? { disabled } : {})}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          CONTROL,
          'flex items-center justify-between gap-2 text-left [&>span]:line-clamp-1',
          value === '' && 'text-muted-foreground',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-80 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-card p-1 text-foreground shadow-lg"
        >
          <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 [&+&]:border-t [&+&]:border-border">
      <div>
        <div className="text-caption font-semibold text-foreground">{title}</div>
        <div className="mt-px text-2xs text-muted-foreground">{description}</div>
      </div>
      {/* Banani `.toggle-track` 36×20 / `.toggle-knob` 14px (3px / 19px) — a
          hair smaller than the generic ui/Switch (44×24). */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] h-3.5 w-3.5 rounded-full bg-white transition-[left]',
            checked ? 'left-[19px]' : 'left-[3px]',
          )}
        />
      </button>
    </div>
  );
}

export function SectionDivider({ className }: { className?: string }) {
  return <div className={cn('my-3.5 h-px bg-border', className)} />;
}
