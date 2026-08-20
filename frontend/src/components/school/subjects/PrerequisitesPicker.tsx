'use client';

// "Prérequis" multi-select of the subject form (add-matiere.md) — thin
// wrapper over the shared ui/MultiSelect (chips + searchable checklist).
import { useTranslations } from 'next-intl';
import { MultiSelect } from '@/components/ui/MultiSelect';

export interface PrerequisiteOption {
  id: string;
  name: string;
  code: string | null;
}

export function PrerequisitesPicker({
  options,
  value,
  onChange,
  id,
}: {
  options: PrerequisiteOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  id?: string;
}) {
  const t = useTranslations('Configuration.matieres.prerequisitesPicker');
  return (
    <MultiSelect
      {...(id !== undefined ? { id } : {})}
      options={options.map((o) => ({
        id: o.id,
        label: o.name,
        ...(o.code ? { chip: o.code, hint: o.code } : {}),
      }))}
      value={value}
      onChange={onChange}
      placeholder={t('placeholder')}
      searchPlaceholder={t('searchPlaceholder')}
      emptyLabel={t('emptyLabel')}
    />
  );
}
