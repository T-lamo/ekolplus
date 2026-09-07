'use client';

// PersonnelFormModal — creation wizard for adding a staff member, moved
// from a standalone page (/personnel/nouveau) into a Modal for consistency
// with every other "create a record" flow in the app (TeacherFormModal,
// StudentFormModal, RoomFormModal, TrancheFormModal, SessionFormModal,
// RoleFormModal never use a dedicated page). Same 3-step gabarit as the
// teacher/student wizard modals (FormStepsBar + WizardNav, one <form>
// spanning all steps, only the active step's fields mounted).
//
// Banani source: .planning/banani/fetches/personnel-module/ajouter-personnel.html
// (sidebar/topbar chrome discarded, and the mockup's own #F4F7FD tinted
// panel background is deliberately dropped in favor of this app's plain
// white Modal surface — every other card in the app is a uniform bg-card
// surface with no per-card accent color, a house rule this modal follows
// too). The mockup itself is a full page, but this app's Modal shell is
// re-used the same way TeacherFormModal/StudentFormModal already re-fit
// their own wizard mockups into it.
//
// The "Enseigne dans l'établissement" card exposes a real matières/classes
// picker (AssignmentChipPicker, Banani mockup lines ~804-834 — two labeled
// chip-rows ending in a dashed "+ Ajouter" chip), fed by the existing,
// unchanged GET /api/school/subjects and GET /api/school/classes. Selected
// ids are submitted as `teacherProfile.matiereIds`/`classIds` and POST
// /api/school/personnel wires the full cross-product to real ClassSubject
// rows inside the same transaction as the Teacher row (see that route's
// header comment for the skip-if-already-taken-by-another-teacher
// semantic). A caller whose role can create personnel but lacks
// `configuration.view` (needed by the two picker endpoints) sees a plain
// fallback hint instead of the picker, pointing at the fiche's existing
// "Enseignement" tab / /configuration/matieres.
//
// Username-mode success swaps this same Modal instance's header/footer/
// children for TemporaryPasswordPanel (no stepper, no wizard nav) instead
// of opening a second modal — the same "one Modal instance, state-driven
// body" shape TeacherFormModal already uses for its loading-skeleton vs
// loaded-form swap. Closing that panel (its own button, or the modal's X/
// Escape) closes the modal AND navigates to the new person's fiche,
// exactly like the old full-page wizard did on close. Email/none-mode
// success does the same close+navigate immediately, right after its toast
// — unchanged from the old page's behavior beyond swapping "navigate away
// from the page" for "close the modal" as the first step.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Check, KeyRound, Mail, UserCircle, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useSchoolPlan } from '@/contexts/SchoolPlanContext';
import { useToast } from '@/contexts/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Select, SelectItem } from '@/components/ui/Select';
import { FormStepsBar, type FormStep } from '@/components/school/FormStepsBar';
import { WizardNav } from '@/components/school/WizardNav';
import { AssignmentChipPicker } from '@/components/personnel/AssignmentChipPicker';
import { TemporaryPasswordPanel } from '@/components/personnel/TemporaryPasswordPanel';
import { UsernameField, type UsernameFieldStatus } from '@/components/personnel/UsernameField';
import { normalizeUsername } from '@/lib/username';

const FORM_ID = 'personnel-wizard';

type StaffOrgRole = 'ADMIN' | 'MEMBER';
type LoginMode = 'none' | 'email' | 'username';

interface StaffRoleOption {
  id: string;
  name: string;
}

interface RolesResponse {
  roles: StaffRoleOption[];
}

interface SubjectsResponse {
  subjects: { id: string; name: string }[];
}

interface ClassesResponse {
  classes: { id: string; name: string }[];
}

interface CreatedResult {
  id: string;
  username: string;
  temporaryPassword: string;
}

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function ProfileCard({
  icon,
  iconClass,
  title,
  description,
  checked,
  onToggle,
  children,
}: {
  icon: ReactNode;
  iconClass: string;
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border p-4 sm:p-5 ${
        checked ? 'border-primary bg-primary/5 ring-4 ring-primary/10' : 'border-border bg-card'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        className="flex w-full items-start gap-3 text-left"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-foreground">{title}</span>
          <span className="block text-xs text-muted-foreground">{description}</span>
        </span>
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
            checked
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background'
          }`}
        >
          {checked && <Check size={12} />}
        </span>
      </button>
      {children && <div className="flex flex-col gap-3 pl-0 sm:pl-[52px]">{children}</div>}
    </div>
  );
}

function ConnexionCard({
  icon,
  title,
  description,
  selected,
  disabled = false,
  disabledHint,
  onSelect,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onSelect: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-2.5 rounded-2xl border p-4 text-center sm:p-5 ${
        selected ? 'border-primary bg-primary/5 ring-4 ring-primary/10' : 'border-border bg-card'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        aria-pressed={selected}
        className="flex w-full flex-col items-center gap-2.5 disabled:cursor-not-allowed"
      >
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          {icon}
        </span>
        <span className="text-sm font-bold text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </button>
      {disabled && disabledHint && (
        <p className="text-2xs text-muted-foreground italic">{disabledHint}</p>
      )}
      {children && <div className="w-full">{children}</div>}
    </div>
  );
}

export function PersonnelFormModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('Personnel.nouveau');
  const tAdmins = useTranslations('Permissions.adminsTab');
  const tCommon = useTranslations('Common');
  const { role: schoolRole } = useSchoolPlan();
  const isAdminPlus = schoolRole === 'OWNER' || schoolRole === 'ADMIN';
  const isOwner = schoolRole === 'OWNER';
  const topRef = useRef<HTMLDivElement>(null);

  const { data: rolesData } = useApi<RolesResponse>('/api/school/roles', { skip: !isAdminPlus });
  const roles = rolesData?.roles ?? [];

  const [stepIndex, setStepIndex] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreatedResult | null>(null);

  // Step 1 — Identité
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Step 2 — Profils
  const [teacherChecked, setTeacherChecked] = useState(false);
  const [matiereIds, setMatiereIds] = useState<string[]>([]);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [staffChecked, setStaffChecked] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffOrgRole>('MEMBER');
  const [staffRoleIds, setStaffRoleIds] = useState<string[]>([]);

  // The matières/classes picker needs `configuration.view` (the permission
  // GET /api/school/subjects and /classes are gated on) — a caller with
  // only `enseignants.create` can still reach this wizard but not those
  // two endpoints. Only fetched once the teacher card is actually checked.
  const {
    data: subjectsData,
    loading: subjectsLoading,
    error: subjectsError,
  } = useApi<SubjectsResponse>('/api/school/subjects', { skip: !teacherChecked });
  const {
    data: classesData,
    loading: classesLoading,
    error: classesError,
  } = useApi<ClassesResponse>('/api/school/classes', { skip: !teacherChecked });
  const pickerUnavailable = Boolean(subjectsError || classesError);

  // Step 3 — Connexion
  const [loginMode, setLoginMode] = useState<LoginMode | null>(null);
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameFieldStatus>('idle');

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const noneEligible = teacherChecked && !staffChecked;
  const emailEligible = looksLikeEmail(email.trim());

  // A previously selected mode can become invalid if the person goes back
  // (via the stepper) and changes an earlier step — never let a stale
  // selection ride through to submit.
  useEffect(() => {
    if (loginMode === 'none' && !noneEligible) setLoginMode(null);
  }, [loginMode, noneEligible]);
  useEffect(() => {
    if (loginMode === 'email' && !emailEligible) setLoginMode(null);
  }, [loginMode, emailEligible]);
  // A caller who isn't ADMIN+ never sees the staff card at all — if the
  // role resolves to non-ADMIN+ after a staff profile was already checked
  // (shouldn't happen in practice, defensive only), drop it rather than
  // silently submit a staff profile the server would reject anyway.
  useEffect(() => {
    if (!isAdminPlus && staffChecked) setStaffChecked(false);
  }, [isAdminPlus, staffChecked]);

  const STEPS: FormStep[] = [
    { id: 'identite', label: t('steps.identite') },
    { id: 'profils', label: t('steps.profils') },
    { id: 'connexion', label: t('steps.connexion') },
  ];

  function goTo(index: number) {
    setStepIndex(index);
    setMaxReached((m) => Math.max(m, index));
    setError(null);
    topRef.current?.scrollIntoView({ block: 'start' });
  }

  function validateStep(index: number): string | null {
    if (index === 0) {
      if (!firstName.trim() || !lastName.trim()) return t('identite.nameRequired');
      return null;
    }
    if (index === 1) {
      if (!teacherChecked && !staffChecked) return t('profils.atLeastOneError');
      return null;
    }
    if (index === 2) {
      if (loginMode === null) return t('connexion.modeRequiredError');
      if (loginMode === 'none' && !noneEligible) return t('connexion.modeRequiredError');
      if (loginMode === 'email' && !emailEligible) return t('connexion.modeRequiredError');
      if (loginMode === 'username' && (username.trim() === '' || usernameStatus !== 'available')) {
        return t('connexion.modeRequiredError');
      }
      return null;
    }
    return null;
  }

  function goNext() {
    const problem = validateStep(stepIndex);
    if (problem) {
      setError(problem);
      return;
    }
    if (stepIndex < STEPS.length - 1) goTo(stepIndex + 1);
  }

  function errorMessage(code: string, fallback: string): string {
    switch (code) {
      case 'USERNAME_TAKEN':
        return t('errors.USERNAME_TAKEN');
      case 'EMAIL_ALREADY_IN_USE':
        return t('errors.EMAIL_ALREADY_IN_USE');
      case 'PERMISSION_DENIED':
        return t('errors.PERMISSION_DENIED');
      case 'VALIDATION_FAILED':
        return t('errors.VALIDATION_FAILED');
      default:
        return fallback;
    }
  }

  // Shared by the temp-password panel's own close button and this Modal's
  // X/Escape while that panel is showing — closes the modal AND navigates
  // to the newly created person's fiche, exactly like the old full-page
  // wizard's "onClose" did.
  function handleResultClose() {
    if (!result) return;
    onCreated();
    router.push(`/personnel/${result.id}`);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Enter in a field submits the form — advance instead on middle steps.
    if (stepIndex < STEPS.length - 1) {
      goNext();
      return;
    }
    for (let i = 0; i < STEPS.length; i++) {
      const problem = validateStep(i);
      if (problem) {
        setError(problem);
        goTo(i);
        return;
      }
    }
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      };
      const trimmedPhone = phone.trim();
      if (trimmedPhone) body.phone = trimmedPhone;
      if (teacherChecked) body.teacherProfile = { matiereIds, classIds };
      if (staffChecked) {
        body.staffProfile = {
          role: staffRole,
          staffRoleIds: staffRole === 'MEMBER' ? staffRoleIds : [],
        };
      }
      if (loginMode === 'none') {
        body.login = { mode: 'none' };
      } else if (loginMode === 'email') {
        body.login = { mode: 'email', email: email.trim() };
      } else {
        body.login = { mode: 'username', username: normalizeUsername(username) };
      }

      const res = await api<{
        ok: true;
        id: string;
        userId: string | null;
        temporaryPassword?: string;
      }>('/api/school/personnel', { method: 'POST', body });

      if (loginMode === 'username' && res.temporaryPassword) {
        setResult({
          id: res.id,
          username: normalizeUsername(username),
          temporaryPassword: res.temporaryPassword,
        });
      } else if (loginMode === 'email') {
        toast(t('successEmail', { email: email.trim() }), 'success');
        onCreated();
        router.push(`/personnel/${res.id}`);
      } else {
        toast(t('successNone'), 'success');
        onCreated();
        router.push(`/personnel/${res.id}`);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? errorMessage(err.code, err.message) : tCommon('errors.network'),
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={t('title')}
      onClose={result ? handleResultClose : onClose}
      xwide={!result}
      header={
        result ? undefined : (
          <FormStepsBar
            steps={STEPS}
            activeIndex={stepIndex}
            maxReachedIndex={maxReached}
            onStepSelect={goTo}
          />
        )
      }
      footer={
        result ? undefined : (
          <WizardNav
            stepIndex={stepIndex}
            stepCount={STEPS.length}
            submitting={submitting}
            submitLabel={submitting ? t('submitting') : t('submit')}
            formId={FORM_ID}
            onCancel={onClose}
            onPrev={() => goTo(Math.max(0, stepIndex - 1))}
            onNext={goNext}
          />
        )
      }
    >
      {result ? (
        <TemporaryPasswordPanel
          name={fullName}
          username={result.username}
          temporaryPassword={result.temporaryPassword}
          onClose={handleResultClose}
        />
      ) : (
        <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
          <div ref={topRef} className="scroll-mt-6" />

          {stepIndex === 0 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-base font-bold text-foreground">{t('identite.title')}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('identite.subtitle')}</p>
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <Field
                  label={t('identite.firstName')}
                  required
                  autoFocus
                  placeholder={t('identite.firstNamePlaceholder')}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
                <Field
                  label={t('identite.lastName')}
                  required
                  placeholder={t('identite.lastNamePlaceholder')}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <PhoneInput label={t('identite.phone')} value={phone} onChange={setPhone} />
                <div className="flex flex-col gap-1.5">
                  <Field
                    label={`${t('identite.email')} ${t('identite.emailOptional')}`}
                    type="email"
                    autoComplete="off"
                    placeholder={t('identite.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <p className="text-2xs text-muted-foreground">{t('identite.emailHint')}</p>
                </div>
              </div>
            </div>
          )}

          {stepIndex === 1 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-base font-bold text-foreground">{t('profils.title')}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('profils.subtitle')}</p>
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <ProfileCard
                  icon={<BookOpen size={19} />}
                  iconClass="bg-success text-success-foreground"
                  title={t('profils.teacherCard.title')}
                  description={t('profils.teacherCard.description')}
                  checked={teacherChecked}
                  onToggle={() => setTeacherChecked((v) => !v)}
                >
                  {teacherChecked &&
                    (pickerUnavailable ? (
                      <p className="text-2xs text-muted-foreground">
                        {t('profils.teacherCard.picker.unavailable')}
                      </p>
                    ) : (
                      <>
                        <AssignmentChipPicker
                          label={t('profils.teacherCard.picker.matieresLabel')}
                          options={(subjectsData?.subjects ?? []).map((s) => ({
                            id: s.id,
                            label: s.name,
                          }))}
                          value={matiereIds}
                          onChange={setMatiereIds}
                          addLabel={t('profils.teacherCard.picker.add')}
                          searchPlaceholder={t(
                            'profils.teacherCard.picker.matieresSearchPlaceholder',
                          )}
                          emptyLabel={t('profils.teacherCard.picker.matieresEmpty')}
                          chipClassName="bg-success text-success-foreground"
                          disabled={subjectsLoading}
                          ariaLabel={t('profils.teacherCard.picker.matieresLabel')}
                        />
                        <AssignmentChipPicker
                          label={t('profils.teacherCard.picker.classesLabel')}
                          options={(classesData?.classes ?? []).map((c) => ({
                            id: c.id,
                            label: c.name,
                          }))}
                          value={classIds}
                          onChange={setClassIds}
                          addLabel={t('profils.teacherCard.picker.add')}
                          searchPlaceholder={t(
                            'profils.teacherCard.picker.classesSearchPlaceholder',
                          )}
                          emptyLabel={t('profils.teacherCard.picker.classesEmpty')}
                          chipClassName="bg-secondary text-primary"
                          disabled={classesLoading}
                          ariaLabel={t('profils.teacherCard.picker.classesLabel')}
                        />
                      </>
                    ))}
                </ProfileCard>

                {isAdminPlus && (
                  <ProfileCard
                    icon={<KeyRound size={19} />}
                    iconClass="bg-primary/10 text-primary"
                    title={t('profils.staffCard.title')}
                    description={t('profils.staffCard.description')}
                    checked={staffChecked}
                    onToggle={() => setStaffChecked((v) => !v)}
                  >
                    {staffChecked && (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <Select
                            label={t('profils.staffCard.roleLabel')}
                            value={staffRole}
                            onValueChange={(v) => setStaffRole(v === 'ADMIN' ? 'ADMIN' : 'MEMBER')}
                          >
                            <SelectItem value="MEMBER">
                              {t('profils.staffCard.roleMember')}
                            </SelectItem>
                            {isOwner && (
                              <SelectItem value="ADMIN">
                                {t('profils.staffCard.roleAdmin')}
                              </SelectItem>
                            )}
                          </Select>
                          <p className="text-2xs text-muted-foreground">
                            {staffRole === 'ADMIN'
                              ? t('profils.staffCard.roleAdminHint')
                              : t('profils.staffCard.roleMemberHint')}
                          </p>
                        </div>
                        {staffRole === 'MEMBER' && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-foreground">
                              {t('profils.staffCard.staffRolesLabel')}
                            </span>
                            <MultiSelect
                              options={roles.map((r) => ({ id: r.id, label: r.name }))}
                              value={staffRoleIds}
                              onChange={setStaffRoleIds}
                              ariaLabel={t('profils.staffCard.staffRolesLabel')}
                              placeholder={tAdmins('noRolePlaceholder')}
                              searchPlaceholder={tAdmins('searchRoles')}
                              emptyLabel={tAdmins('noRoleResults')}
                            />
                            <p className="text-2xs text-muted-foreground">
                              {t('profils.staffCard.staffRolesHint')}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </ProfileCard>
                )}
              </div>
            </div>
          )}

          {stepIndex === 2 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-base font-bold text-foreground">{t('connexion.title')}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('connexion.subtitle')}</p>
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                <ConnexionCard
                  icon={<UserX size={20} />}
                  title={t('connexion.noneCard.title')}
                  description={t('connexion.noneCard.description')}
                  selected={loginMode === 'none'}
                  disabled={!noneEligible}
                  {...(!noneEligible ? { disabledHint: t('connexion.noneCard.disabledHint') } : {})}
                  onSelect={() => setLoginMode('none')}
                />
                <ConnexionCard
                  icon={<Mail size={20} />}
                  title={t('connexion.emailCard.title')}
                  description={t('connexion.emailCard.description')}
                  selected={loginMode === 'email'}
                  disabled={!emailEligible}
                  {...(!emailEligible
                    ? { disabledHint: t('connexion.emailCard.disabledHint') }
                    : {})}
                  onSelect={() => setLoginMode('email')}
                >
                  {loginMode === 'email' && emailEligible && (
                    <div className="rounded-lg bg-muted px-3 py-2.5 text-left">
                      <div className="text-2xs font-semibold text-muted-foreground">
                        {t('connexion.emailCard.inviteLabel')}
                      </div>
                      <div className="truncate text-caption font-medium text-foreground">
                        {email.trim()}
                      </div>
                    </div>
                  )}
                </ConnexionCard>
                <ConnexionCard
                  icon={<UserCircle size={20} />}
                  title={t('connexion.usernameCard.title')}
                  description={t('connexion.usernameCard.description')}
                  selected={loginMode === 'username'}
                  onSelect={() => setLoginMode('username')}
                >
                  {loginMode === 'username' && (
                    <UsernameField
                      value={username}
                      onChange={setUsername}
                      firstName={firstName}
                      lastName={lastName}
                      onStatusChange={setUsernameStatus}
                    />
                  )}
                </ConnexionCard>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
