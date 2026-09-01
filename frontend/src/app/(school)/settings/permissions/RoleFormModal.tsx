'use client';

// Création / édition d'un rôle staff (settings/permissions). Mêmes atomes de
// formulaire que RoomFormModal (configuration/salles) : FormGroup / TextInput /
// TextArea dans la Modal générique. 409 ROLE_NAME_TAKEN remonte sous le champ
// Nom. Le mode création ajoute les badges d'étape et la carte d'aperçu ; les
// permissions détaillées se configurent ensuite dans la matrice (étape 2,
// gérée par l'écran parent via `onSaved`).
import { useState } from 'react';
import { Briefcase, Save, ShieldCheck, ShieldUser } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FormGroup, TextArea, TextInput } from '@/components/school/subjects/form-primitives';

/** Shape of the role object returned by POST/PATCH /api/school/roles. */
export interface RoleFormSavedRole {
  id: string;
  name: string;
  description: string | null;
  grants: string[];
  createdAt: string;
  updatedAt: string;
}

export function RoleFormModal({
  mode,
  role,
  onSaved,
  onClose,
}: {
  mode: 'create' | 'edit';
  /** Rôle en cours d'édition. Requis en mode 'edit'. */
  role?: { id: string; name: string; description: string | null };
  onSaved: (role: RoleFormSavedRole) => void;
  onClose: () => void;
}) {
  const t = useTranslations('Permissions.form');
  const tToasts = useTranslations('Permissions.toasts');
  const tCommon = useTranslations('Common');
  const { toast } = useToast();
  const isEdit = mode === 'edit';

  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setNameError(t('nameRequired'));
      return;
    }
    setNameError(null);
    setServerError(null);
    setSubmitting(true);
    const trimmedDescription = description.trim();
    try {
      let saved: RoleFormSavedRole;
      if (isEdit && role) {
        const res = await api<{ role: RoleFormSavedRole }>(`/api/school/roles/${role.id}`, {
          method: 'PATCH',
          body: {
            name: trimmedName,
            description: trimmedDescription.length > 0 ? trimmedDescription : null,
          },
        });
        saved = res.role;
      } else {
        const res = await api<{ role: RoleFormSavedRole }>('/api/school/roles', {
          method: 'POST',
          body: {
            name: trimmedName,
            ...(trimmedDescription.length > 0 ? { description: trimmedDescription } : {}),
          },
        });
        saved = res.role;
      }
      toast(isEdit ? tToasts('updated') : tToasts('created'), 'success');
      onSaved(saved);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ROLE_NAME_TAKEN') {
        setNameError(t('nameTaken'));
      } else {
        setServerError(err instanceof ApiError ? err.message : tCommon('errors.network'));
      }
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={isEdit ? t('editTitle') : t('createTitle')}
      {...(isEdit ? {} : { subtitle: t('createSubtitle') })}
      onClose={onClose}
      header={
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <Briefcase size={20} />
          </span>
          {!isEdit && (
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="primary">{t('badgeNew')}</Badge>
              <Badge tone="muted">{t('badgeStep')}</Badge>
            </div>
          )}
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            <ShieldCheck size={14} className="shrink-0 text-success-foreground" />
            {t('footerNote')}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button type="button" variant="outline" className="w-fit" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="button" className="w-fit" loading={submitting} onClick={submit}>
              <Save size={14} />
              {isEdit ? t('submitEdit') : t('submitCreate')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3.5 rounded-lg border border-border p-4">
          <FormGroup
            label={t('nameLabel')}
            required
            error={nameError ?? undefined}
            hint={t('nameHint')}
            htmlFor="role-name"
          >
            <TextInput
              id="role-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              autoFocus
            />
          </FormGroup>
          <FormGroup
            label={t('descriptionLabel')}
            hint={t('descriptionHint')}
            htmlFor="role-description"
          >
            <TextArea
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
            />
          </FormGroup>
        </div>

        {!isEdit && (
          <div className="flex flex-col gap-2.5 rounded-lg bg-muted p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-primary">
                <ShieldUser size={18} />
              </span>
              <p className="text-sm font-semibold text-foreground">{t('previewTitle')}</p>
            </div>
            <p className="text-xs text-muted-foreground">{t('previewBody')}</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="warning">{t('previewBadgePending')}</Badge>
              <Badge tone="success">{t('previewBadgeActive')}</Badge>
            </div>
          </div>
        )}

        {serverError && (
          <p role="alert" className="text-xs text-destructive-foreground">
            {serverError}
          </p>
        )}
      </div>
    </Modal>
  );
}
