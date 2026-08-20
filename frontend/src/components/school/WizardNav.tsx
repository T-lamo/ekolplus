'use client';

// Shared fixed footer for the teacher/student wizard modals — rendered in
// the Modal `footer` slot. Same layout on both so the two forms stay
// strictly coherent: Annuler left, Précédent/Suivant (or Enregistrer on
// the last step) right.

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';

export function WizardNav({
  stepIndex,
  stepCount,
  submitting,
  submitLabel,
  formId,
  onCancel,
  onPrev,
  onNext,
}: {
  stepIndex: number;
  stepCount: number;
  submitting: boolean;
  submitLabel: string;
  /** The wizard's <form> id — the submit button lives in the modal footer,
   * outside the form element, and attaches to it via this attribute. */
  formId: string;
  onCancel: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const t = useTranslations('Common.wizardNav');
  const last = stepIndex === stepCount - 1;
  return (
    <div className="flex items-center justify-between gap-1.5 sm:gap-2">
      <Button type="button" variant="ghost" className="w-fit" onClick={onCancel}>
        {t('cancel')}
      </Button>
      <div className="flex items-center gap-1.5 sm:gap-2">
        {stepIndex > 0 && (
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={onPrev}
            aria-label={t('previous')}
          >
            <ChevronLeft size={14} />
            <span className="hidden sm:inline">{t('previous')}</span>
          </Button>
        )}
        {last ? (
          <Button key="submit" type="submit" form={formId} className="w-fit" loading={submitting}>
            {submitLabel}
          </Button>
        ) : (
          <Button
            key="next"
            type="button"
            className="w-fit"
            // preventDefault matters: without it, when this node morphs into
            // the submit button on the last-step re-render (React flushes
            // before the browser runs the click's default action), the same
            // click would immediately submit the form.
            onClick={(e) => {
              e.preventDefault();
              onNext();
            }}
          >
            {t('next')}
            <ChevronRight size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}
