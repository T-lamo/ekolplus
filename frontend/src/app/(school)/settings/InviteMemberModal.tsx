'use client';

// « Inviter un membre » (Paramètres › Administrateurs, Banani « Admin
// Settings » 2026-09-04): email + account type (Administrateur, OWNER only,
// or Membre with optional staff roles) → POST /api/school/members. The
// invitee receives the activation email built by the outbox
// (/definir-mot-de-passe?portal=staff, 7 days).
import { useState, type FormEvent } from 'react';
import { Send, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Select, SelectItem } from '@/components/ui/Select';

export interface StaffRoleOption {
  id: string;
  name: string;
}

export function InviteMemberModal({
  roles,
  canInviteAdmin,
  onClose,
  onInvited,
}: {
  roles: StaffRoleOption[];
  /** OWNER only: an ADMIN may invite Membres, never another Administrateur. */
  canInviteAdmin: boolean;
  onClose: () => void;
  onInvited: () => void;
}) {
  const t = useTranslations('Settings.administrateurs.modal');
  const tAdmins = useTranslations('Permissions.adminsTab');
  const tCommon = useTranslations('Common');
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [staffRoleIds, setStaffRoleIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setError(null);
    setSubmitting(true);
    try {
      await api('/api/school/members', {
        method: 'POST',
        body: { email: trimmed, role, staffRoleIds: role === 'MEMBER' ? staffRoleIds : [] },
      });
      toast(t('sent', { email: trimmed }), 'success');
      onInvited();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        switch (err.code) {
          case 'EMAIL_ALREADY_IN_USE':
            setError(t('errors.EMAIL_ALREADY_IN_USE'));
            break;
          case 'ALREADY_MEMBER':
            setError(t('errors.ALREADY_MEMBER'));
            break;
          default:
            setError(err.message);
        }
      } else {
        setError(tCommon('errors.network'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={t('title')}
      subtitle={t('subtitle')}
      onClose={onClose}
      header={
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
          <UserPlus size={20} />
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <Button type="button" variant="outline" className="w-fit" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form="invite-member-form"
            className="w-fit"
            loading={submitting}
            disabled={!email.trim()}
          >
            <Send size={14} />
            {submitting ? t('submitting') : t('submit')}
          </Button>
        </div>
      }
    >
      <form id="invite-member-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label={t('emailLabel')}
          type="email"
          required
          autoFocus
          autoComplete="off"
          placeholder={t('emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex flex-col gap-1.5">
          <Select
            label={t('roleLabel')}
            value={role}
            onValueChange={(v) => setRole(v === 'ADMIN' ? 'ADMIN' : 'MEMBER')}
          >
            <SelectItem value="MEMBER">{t('roleMember')}</SelectItem>
            {canInviteAdmin && <SelectItem value="ADMIN">{t('roleAdmin')}</SelectItem>}
          </Select>
          <p className="text-2xs text-muted-foreground">
            {role === 'ADMIN' ? t('roleAdminHint') : t('roleMemberHint')}
          </p>
        </div>
        {role === 'MEMBER' && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-foreground">{t('staffRolesLabel')}</span>
            <MultiSelect
              options={roles.map((r) => ({ id: r.id, label: r.name }))}
              value={staffRoleIds}
              onChange={setStaffRoleIds}
              ariaLabel={t('staffRolesLabel')}
              placeholder={tAdmins('noRolePlaceholder')}
              searchPlaceholder={tAdmins('searchRoles')}
              emptyLabel={tAdmins('noRoleResults')}
            />
            <p className="text-2xs text-muted-foreground">{t('staffRolesHint')}</p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
