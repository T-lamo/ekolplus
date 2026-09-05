'use client';

// Criteria of a qualitative subject, edited live against
// /api/school/subjects/[id]/criteria (add, rename, delete, move). Each
// action refetches the subject detail through `onChanged`; the form's
// other fields are not re-seeded by that refetch (useSubjectForm only
// re-seeds when the subject id changes). Spec 2026-09-05 §4.
import { type ReactNode, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/contexts/ToastContext';
import { CRITERION_LABEL_MAX } from '@/lib/qualitative';
import type { SubjectCriterionRow } from '@/app/(school)/configuration/matieres/types';
import { TextInput } from './form-primitives';

export function CriteriaEditor({
  subjectId,
  criteria,
  onChanged,
}: {
  subjectId: string;
  criteria: SubjectCriterionRow[];
  onChanged: () => void;
}) {
  const t = useTranslations('Configuration.matieres.form.structure');
  const { toast } = useToast();
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const base = `/api/school/subjects/${subjectId}/criteria`;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('criterionSaveError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    void run(async () => {
      await api(base, { method: 'POST', body: { label } });
      setNewLabel('');
    });
  };
  const rename = (id: string) => {
    const label = editingLabel.trim();
    if (!label) return;
    void run(async () => {
      await api(`${base}/${id}`, { method: 'PATCH', body: { label } });
      setEditingId(null);
    });
  };
  const remove = (id: string) => void run(() => api(`${base}/${id}`, { method: 'DELETE' }));
  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= criteria.length) return;
    const ids = criteria.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(to, 0, moved ?? '');
    void run(() => api(`${base}/reorder`, { method: 'PUT', body: { ids } }));
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-caption font-semibold text-foreground">{t('criteriaTitle')}</p>
        <p className="text-2xs text-muted-foreground">{t('criteriaHint')}</p>
      </div>
      {criteria.length === 0 && (
        <p className="text-2xs text-muted-foreground">{t('criteriaEmpty')}</p>
      )}
      <ol className="flex flex-col gap-1.5">
        {criteria.map((c, index) => (
          <li key={c.id} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-center text-2xs font-bold text-muted-foreground">
              {index + 1}
            </span>
            {editingId === c.id ? (
              <>
                <TextInput
                  value={editingLabel}
                  maxLength={CRITERION_LABEL_MAX}
                  autoFocus
                  onChange={(e) => setEditingLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') rename(c.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <Button type="button" size="sm" disabled={busy} onClick={() => rename(c.id)}>
                  <Check size={14} />
                  {t('criterionSave')}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  <X size={14} />
                  {t('criterionCancel')}
                </Button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-caption text-foreground">
                  {c.label}
                </span>
                <RowButton
                  label={t('ratingScaleMoveUp')}
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={14} />
                </RowButton>
                <RowButton
                  label={t('ratingScaleMoveDown')}
                  disabled={busy || index === criteria.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={14} />
                </RowButton>
                <RowButton
                  label={t('criterionRename')}
                  disabled={busy}
                  onClick={() => {
                    setEditingId(c.id);
                    setEditingLabel(c.label);
                  }}
                >
                  <Pencil size={14} />
                </RowButton>
                <RowButton
                  label={c.ratingCount > 0 ? t('criterionInUse') : t('criterionDelete')}
                  disabled={busy || c.ratingCount > 0}
                  onClick={() => remove(c.id)}
                >
                  <Trash2 size={14} />
                </RowButton>
              </>
            )}
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-2">
        <TextInput
          value={newLabel}
          maxLength={CRITERION_LABEL_MAX}
          placeholder={t('criterionPlaceholder')}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !newLabel.trim()}
          onClick={add}
        >
          <Plus size={14} />
          {t('criterionAdd')}
        </Button>
      </div>
    </div>
  );
}

function RowButton({
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
