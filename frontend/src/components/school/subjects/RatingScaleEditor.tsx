'use client';

// Ordered scale of a qualitative subject (2 to 6 labels). Renaming is always
// allowed; moving is hidden once ratings exist (`lockedOrder`) because the
// server cannot tell a rename from a permutation (spec 2026-09-05 §4).
import { type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { RATING_LABEL_MAX, RATING_SCALE_MAX, RATING_SCALE_MIN } from '@/lib/qualitative';
import { TextInput } from './form-primitives';

export function RatingScaleEditor({
  value,
  onChange,
  lockedOrder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  lockedOrder: boolean;
}) {
  const t = useTranslations('Configuration.matieres.form.structure');
  const update = (index: number, label: string) =>
    onChange(value.map((l, i) => (i === index ? label : l)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item ?? '');
    onChange(next);
  };
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col gap-2">
      {value.map((label, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-center text-2xs font-bold text-muted-foreground">
            {index + 1}
          </span>
          <TextInput
            value={label}
            maxLength={RATING_LABEL_MAX}
            placeholder={t('ratingScaleLevelPlaceholder', { index: index + 1 })}
            aria-label={t('ratingScaleLevelPlaceholder', { index: index + 1 })}
            onChange={(e) => update(index, e.target.value)}
          />
          {!lockedOrder && (
            <>
              <IconButton
                label={t('ratingScaleMoveUp')}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <ArrowUp size={14} />
              </IconButton>
              <IconButton
                label={t('ratingScaleMoveDown')}
                disabled={index === value.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <ArrowDown size={14} />
              </IconButton>
            </>
          )}
          <IconButton
            label={t('ratingScaleRemove')}
            disabled={value.length <= RATING_SCALE_MIN}
            onClick={() => remove(index)}
          >
            <X size={14} />
          </IconButton>
        </div>
      ))}
      {lockedOrder && <p className="text-2xs text-muted-foreground">{t('ratingScaleLocked')}</p>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={value.length >= RATING_SCALE_MAX}
        onClick={() => onChange([...value, ''])}
      >
        <Plus size={14} />
        {t('ratingScaleAdd')}
      </Button>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
