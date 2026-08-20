'use client';

// "Informations générales" — the two-column body of the Add Matière screen
// (add-matiere.md), also the first tab of the subject detail page. Pure
// presentation over `useSubjectForm`; the page owns the header/footer
// buttons.
import {
  ArrowRight,
  BookOpen,
  Check,
  Info,
  Lightbulb,
  Palette,
  School,
  Settings2,
  SlidersHorizontal,
  ToggleRight,
  UserCheck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/Avatar';
import { ASIDE_GRID } from '@/lib/layout';
import { getSubjectVisual, SUBJECT_COLORS, SUBJECT_ICONS, tintOf } from '@/lib/subject-visuals';
import { cn } from '@/lib/utils';
import {
  ALL_LEVELS,
  EVALUATION_TYPES,
  OTHER_DOMAIN,
  ROOM_TYPES,
  SUBJECT_KIND_OPTIONS,
  SUBJECT_STATUS_OPTIONS,
  type SubjectStatus,
} from '@/app/(school)/configuration/matieres/subject-form.constants';
import { subjectKindLabel } from '@/app/(school)/configuration/matieres/kind-label';
import { subjectStatusLabel } from '@/app/(school)/configuration/matieres/status-label';
import {
  BareSelect,
  FormCard,
  FormGroup,
  SectionDivider,
  SelectItem,
  TextArea,
  TextInput,
  ToggleRow,
} from './form-primitives';
import { PrerequisitesPicker, type PrerequisiteOption } from './PrerequisitesPicker';
import { SubjectStatusBadge } from './SubjectPageShell';
import type { SubjectFormController } from './useSubjectForm';

export interface SubjectFormOptions {
  teachers: { id: string; name: string; photoUrl: string | null }[];
  subjects: PrerequisiteOption[];
  classes: { id: string; name: string; studentCount: number }[];
  /** Distinct `Class.level` values of the school (for "Niveau / Année d'étude"). */
  levels: string[];
  yearLabel: string | null;
}

export function SubjectForm({
  form,
  mode,
  options,
  onGoToProgramme,
  onToggleClass,
}: {
  form: SubjectFormController;
  mode: 'create' | 'edit';
  options: SubjectFormOptions;
  /** Edit mode: opens the Programme annuel tab (create: disabled until saved). */
  onGoToProgramme?: () => void;
  /** Edit mode: live attach/detach of a class (create mode just tracks ids). */
  onToggleClass?: (classId: string, checked: boolean) => void;
}) {
  const { values: v, setField, errors, serverError, domainOptions } = form;
  const t = useTranslations('Configuration.matieres.form');
  const tKind = useTranslations('Configuration.matieres.kind');
  const tStatus = useTranslations('Configuration.matieres.status');
  const STATUS_DESC: Record<SubjectStatus, string> = {
    ACTIVE: tStatus('activeDesc'),
    DRAFT: tStatus('draftDesc'),
    ARCHIVED: tStatus('archivedDesc'),
  };
  const preview = getSubjectVisual(v.name || t('appearance.namePlaceholder'), {
    icon: v.icon,
    color: v.color,
  });
  const previewMeta = [
    v.code || null,
    v.domain === OTHER_DOMAIN ? v.domainOther || null : v.domain || null,
    v.defaultCoefficient
      ? t('appearance.coeffPrefix', { coefficient: v.defaultCoefficient })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  function toggleClass(classId: string) {
    const checked = !v.classIds.includes(classId);
    setField(
      'classIds',
      checked ? [...v.classIds, classId] : v.classIds.filter((c) => c !== classId),
    );
    onToggleClass?.(classId, checked);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Required-fields note above the grid so both columns start level. */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info size={14} />
        <span>
          {t('requiredHint')} <span className="text-destructive-foreground">*</span>{' '}
          {t('requiredHintSuffix')}
        </span>
      </p>
      {serverError && (
        <p
          role="alert"
          className="rounded-md bg-destructive px-3 py-2 text-caption text-destructive-foreground"
        >
          {serverError}
        </p>
      )}
      <div className={cn(ASIDE_GRID, 'items-start')}>
        {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-4">
          <FormCard
            id="card-identity"
            icon={<BookOpen size={15} />}
            title={t('identity.title')}
            subtitle={t('identity.subtitle')}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormGroup
                label={t('identity.nameLabel')}
                required
                htmlFor="subject-name"
                hint={t('identity.nameHint')}
                error={errors.name}
              >
                <TextInput
                  id="subject-name"
                  value={v.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder={t('identity.namePlaceholder')}
                  autoFocus={mode === 'create'}
                />
              </FormGroup>
              <FormGroup
                label={t('identity.codeLabel')}
                required
                htmlFor="subject-code"
                hint={t('identity.codeHint')}
                error={errors.code}
              >
                <TextInput
                  id="subject-code"
                  value={v.code}
                  onChange={(e) => setField('code', e.target.value.toUpperCase())}
                  placeholder={t('identity.codePlaceholder')}
                />
              </FormGroup>
              <FormGroup
                label={t('identity.abbreviationLabel')}
                optional
                htmlFor="subject-abbr"
                hint={t('identity.abbreviationHint')}
              >
                <TextInput
                  id="subject-abbr"
                  value={v.abbreviation}
                  onChange={(e) => setField('abbreviation', e.target.value.toUpperCase())}
                  placeholder={t('identity.abbreviationPlaceholder')}
                  maxLength={12}
                />
              </FormGroup>
              <FormGroup
                label={t('identity.domainLabel')}
                required
                error={errors.domain ?? errors.domainOther}
              >
                <BareSelect
                  value={v.domain}
                  onValueChange={(val) => setField('domain', val)}
                  placeholder={t('identity.domainPlaceholder')}
                >
                  {domainOptions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER_DOMAIN}>{t('identity.domainOther')}</SelectItem>
                </BareSelect>
                {v.domain === OTHER_DOMAIN && (
                  <TextInput
                    aria-label={t('identity.domainOtherAria')}
                    value={v.domainOther}
                    onChange={(e) => setField('domainOther', e.target.value)}
                    placeholder={t('identity.domainOtherPlaceholder')}
                    className="mt-1"
                  />
                )}
              </FormGroup>
              <FormGroup label={t('identity.levelLabel')} required error={errors.level}>
                <BareSelect
                  value={v.level}
                  onValueChange={(val) => setField('level', val)}
                  placeholder={t('identity.levelPlaceholder')}
                >
                  <SelectItem value={ALL_LEVELS}>{ALL_LEVELS}</SelectItem>
                  {options.levels.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </BareSelect>
              </FormGroup>
              <FormGroup label={t('identity.kindLabel')} required hint={t('identity.kindHint')}>
                <BareSelect
                  value={v.kind}
                  onValueChange={(val) => setField('kind', val as typeof v.kind)}
                >
                  {SUBJECT_KIND_OPTIONS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {subjectKindLabel(k.value, tKind)}
                    </SelectItem>
                  ))}
                </BareSelect>
              </FormGroup>
              <FormGroup
                label={t('identity.descriptionLabel')}
                optional
                htmlFor="subject-description"
                className="md:col-span-2"
              >
                <TextArea
                  id="subject-description"
                  value={v.description}
                  onChange={(e) => setField('description', e.target.value)}
                  placeholder={t('identity.descriptionPlaceholder')}
                />
              </FormGroup>
            </div>
          </FormCard>

          <FormCard
            id="card-structure"
            icon={<SlidersHorizontal size={15} />}
            title={t('structure.title')}
            subtitle={t('structure.subtitle')}
          >
            <div className="mb-3.5 grid grid-cols-1 gap-3 md:grid-cols-3">
              <FormGroup
                label={t('structure.coefficientLabel')}
                required
                htmlFor="subject-coeff"
                hint={t('structure.coefficientHint')}
                error={errors.defaultCoefficient}
              >
                <TextInput
                  id="subject-coeff"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10}
                  value={v.defaultCoefficient}
                  onChange={(e) => setField('defaultCoefficient', e.target.value)}
                  placeholder={t('structure.coefficientPlaceholder')}
                />
              </FormGroup>
              <FormGroup
                label={t('structure.maxScoreLabel')}
                htmlFor="subject-max"
                hint={t('structure.maxScoreHint')}
                error={errors.maxScore}
              >
                <TextInput
                  id="subject-max"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={v.maxScore}
                  onChange={(e) => setField('maxScore', e.target.value)}
                  placeholder={t('structure.maxScorePlaceholder')}
                />
              </FormGroup>
              <FormGroup
                label={t('structure.passingScoreLabel')}
                htmlFor="subject-pass"
                hint={t('structure.passingScoreHint')}
                error={errors.passingScore}
              >
                <TextInput
                  id="subject-pass"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={v.passingScore}
                  onChange={(e) => setField('passingScore', e.target.value)}
                  placeholder={t('structure.passingScorePlaceholder')}
                />
              </FormGroup>
            </div>
            <div className="mb-3.5 grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <FormGroup
                label={t('structure.totalHoursLabel')}
                labelHint={t('structure.totalHoursLabelHint')}
                htmlFor="subject-hours"
                hint={t('structure.totalHoursHint')}
              >
                <TextInput
                  id="subject-hours"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={v.totalHours}
                  onChange={(e) => setField('totalHours', e.target.value)}
                  placeholder={t('structure.totalHoursPlaceholder')}
                />
              </FormGroup>
              <FormGroup label={t('structure.cmTdTpLabel')} hint={t('structure.cmTdTpHint')}>
                <div className="flex gap-1.5">
                  <TextInput
                    aria-label={t('structure.cmAria')}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={v.hoursCM}
                    onChange={(e) => setField('hoursCM', e.target.value)}
                    placeholder={t('structure.cmPlaceholder')}
                    className="flex-1"
                  />
                  <TextInput
                    aria-label={t('structure.tdAria')}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={v.hoursTD}
                    onChange={(e) => setField('hoursTD', e.target.value)}
                    placeholder={t('structure.tdPlaceholder')}
                    className="flex-1"
                  />
                  <TextInput
                    aria-label={t('structure.tpAria')}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={v.hoursTP}
                    onChange={(e) => setField('hoursTP', e.target.value)}
                    placeholder={t('structure.tpPlaceholder')}
                    className="flex-1"
                  />
                </div>
              </FormGroup>
            </div>
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <FormGroup
                label={t('structure.evaluationTypeLabel')}
                required
                hint={t('structure.evaluationTypeHint')}
                error={errors.evaluationType}
              >
                <BareSelect
                  value={v.evaluationType}
                  onValueChange={(val) => setField('evaluationType', val)}
                  placeholder={t('structure.evaluationTypePlaceholder')}
                >
                  {EVALUATION_TYPES.map((evalType) => (
                    <SelectItem key={evalType} value={evalType}>
                      {evalType}
                    </SelectItem>
                  ))}
                </BareSelect>
              </FormGroup>
              <FormGroup
                label={t('structure.maxCapacityLabel')}
                optional
                htmlFor="subject-capacity"
                hint={t('structure.maxCapacityHint')}
              >
                <TextInput
                  id="subject-capacity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={v.maxCapacity}
                  onChange={(e) => setField('maxCapacity', e.target.value)}
                  placeholder={t('structure.maxCapacityPlaceholder')}
                />
              </FormGroup>
            </div>
            <SectionDivider />
            <ToggleRow
              title={t('structure.includeInAverageTitle')}
              description={t('structure.includeInAverageDesc')}
              checked={v.includeInAverage}
              onChange={(c) => setField('includeInAverage', c)}
            />
            <ToggleRow
              title={t('structure.showOnBulletinTitle')}
              description={t('structure.showOnBulletinDesc')}
              checked={v.showOnBulletin}
              onChange={(c) => setField('showOnBulletin', c)}
            />
          </FormCard>

          <FormCard
            id="card-assignation"
            icon={<UserCheck size={15} />}
            title={t('assignment.title')}
            subtitle={t('assignment.subtitle')}
          >
            <div className="mb-3.5 grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <FormGroup label={t('assignment.teacherLabel')} hint={t('assignment.teacherHint')}>
                <BareSelect
                  value={v.responsibleTeacherId ?? ''}
                  onValueChange={(val) => setField('responsibleTeacherId', val || null)}
                  placeholder={t('assignment.teacherPlaceholder')}
                >
                  <SelectItem value="">{t('assignment.teacherNone')}</SelectItem>
                  {options.teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      <span className="flex items-center gap-2">
                        <Avatar name={teacher.name} src={teacher.photoUrl} size={22} />
                        {teacher.name}
                      </span>
                    </SelectItem>
                  ))}
                </BareSelect>
              </FormGroup>
              <FormGroup label={t('assignment.roomLabel')} optional hint={t('assignment.roomHint')}>
                <BareSelect
                  value={v.room}
                  onValueChange={(val) => setField('room', val)}
                  placeholder={t('assignment.roomPlaceholder')}
                >
                  <SelectItem value="">{t('assignment.roomNone')}</SelectItem>
                  {ROOM_TYPES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </BareSelect>
              </FormGroup>
            </div>
            <FormGroup
              label={t('assignment.prerequisitesLabel')}
              optional
              hint={t('assignment.prerequisitesHint')}
            >
              <PrerequisitesPicker
                options={options.subjects}
                value={v.prerequisiteIds}
                onChange={(ids) => setField('prerequisiteIds', ids)}
              />
            </FormGroup>
          </FormCard>

          <FormCard
            id="card-advanced"
            icon={<Settings2 size={15} />}
            title={t('advanced.title')}
            subtitle={t('advanced.subtitle')}
          >
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <FormGroup label={t('advanced.yearLabel')} hint={t('advanced.yearHint')}>
                <BareSelect value="current" onValueChange={() => undefined} disabled>
                  <SelectItem value="current">
                    {options.yearLabel
                      ? t('advanced.yearActive', { year: options.yearLabel })
                      : t('advanced.yearNone')}
                  </SelectItem>
                </BareSelect>
              </FormGroup>
              <FormGroup
                label={t('advanced.eliminatoryLabel')}
                optional
                htmlFor="subject-elim"
                hint={t('advanced.eliminatoryHint')}
                error={errors.eliminatoryScore}
              >
                <TextInput
                  id="subject-elim"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={v.eliminatoryScore}
                  onChange={(e) => setField('eliminatoryScore', e.target.value)}
                  placeholder={t('advanced.eliminatoryPlaceholder', {
                    max: v.maxScore || 20,
                  })}
                />
              </FormGroup>
            </div>
          </FormCard>

          {/* Hint banner */}
          <div className="flex flex-col gap-3 rounded-lg bg-warning px-[18px] py-3.5 sm:flex-row sm:items-center">
            <Lightbulb size={18} className="hidden shrink-0 text-warning-foreground sm:block" />
            <div className="min-w-0 flex-1">
              <div className="text-caption font-semibold text-warning-foreground">
                {t('hintBanner.title')}
              </div>
              <div className="text-xs text-warning-foreground/90">
                {t('hintBanner.description')}
              </div>
            </div>
            <button
              type="button"
              onClick={onGoToProgramme}
              disabled={mode === 'create'}
              title={mode === 'create' ? t('hintBanner.disabledHint') : undefined}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-warning-foreground bg-card px-3.5 py-[7px] text-caption font-medium text-warning-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('hintBanner.goToProgramme')}
              <ArrowRight size={13} />
            </button>
          </div>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-4">
          <FormCard
            id="card-apparence"
            icon={<Palette size={15} />}
            title={t('appearance.title')}
            subtitle={t('appearance.subtitle')}
          >
            <div className="mb-3.5 flex flex-col gap-[7px]">
              <span className="text-xs font-semibold text-foreground">
                {t('appearance.iconLabel')}
              </span>
              {/* 8 columns like the mock; tiles fill their cell (square) instead
                of a fixed 36px so they never overlap in a narrow column. */}
              <div
                className="grid grid-cols-8 gap-[5px]"
                role="radiogroup"
                aria-label={t('appearance.iconLabel')}
              >
                {SUBJECT_ICONS.map(({ key, Icon }) => {
                  const selected = v.icon === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={key}
                      onClick={() => setField('icon', selected ? null : key)}
                      className={cn(
                        'flex aspect-square w-full items-center justify-center rounded-md border-2',
                        selected
                          ? 'border-primary bg-secondary text-primary'
                          : 'border-transparent bg-muted text-muted-foreground',
                      )}
                    >
                      <Icon size={17} />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-[7px]">
              <span className="text-xs font-semibold text-foreground">
                {t('appearance.colorLabel')}
              </span>
              <div
                className="flex flex-wrap gap-[7px]"
                role="radiogroup"
                aria-label={t('appearance.colorLabel')}
              >
                {SUBJECT_COLORS.map((hex) => {
                  const selected = v.color === hex;
                  return (
                    <button
                      key={hex}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={hex}
                      onClick={() => setField('color', selected ? null : hex)}
                      style={{ background: hex, color: hex }}
                      className={cn(
                        'h-[26px] w-[26px] shrink-0 rounded-full border-2 border-transparent',
                        selected && 'shadow-[0_0_0_2px_var(--color-card),0_0_0_4px_currentColor]',
                      )}
                    />
                  );
                })}
              </div>
            </div>
            <SectionDivider />
            <div className="mb-2 text-xs font-semibold text-foreground">
              {t('appearance.previewLabel')}
            </div>
            <div className="flex items-center gap-2.5 rounded-md bg-background px-3 py-2.5">
              <div
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md"
                style={{
                  background: v.color ? tintOf(v.color) : preview.iconBg,
                  color: v.color ?? preview.iconFg,
                }}
              >
                <preview.Icon size={17} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-caption font-semibold text-foreground">
                  {v.name || t('appearance.namePlaceholder')}
                </div>
                <div className="truncate text-2xs text-muted-foreground">{previewMeta || '—'}</div>
              </div>
              <SubjectStatusBadge status={v.status} className="ml-auto" />
            </div>
          </FormCard>

          <FormCard id="card-status" icon={<ToggleRight size={15} />} title={t('statusCard.title')}>
            <div
              role="radiogroup"
              aria-label={t('statusCard.title')}
              className="flex flex-col gap-1.5"
            >
              {/* A brand-new subject can't be created straight into the archive. */}
              {SUBJECT_STATUS_OPTIONS.filter(
                (opt) => mode === 'edit' || opt.value !== 'ARCHIVED',
              ).map((opt) => {
                const selected = v.status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setField('status', opt.value as SubjectStatus)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-3 py-[9px] text-left',
                      selected ? 'bg-secondary' : 'border border-border bg-background',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                        selected ? 'bg-primary text-white' : 'border-2 border-border',
                      )}
                    >
                      {selected && <Check size={10} />}
                    </span>
                    <span>
                      <span
                        className={cn(
                          'block text-caption font-semibold',
                          selected ? 'text-primary' : 'text-foreground',
                        )}
                      >
                        {subjectStatusLabel(opt.value, tStatus)}
                      </span>
                      <span className="block text-2xs text-muted-foreground">
                        {STATUS_DESC[opt.value]}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </FormCard>

          <FormCard
            id="card-classes"
            icon={<School size={15} />}
            title={t('classesCard.title')}
            subtitle={t('classesCard.subtitle')}
          >
            {options.classes.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('classesCard.empty')}</p>
            ) : (
              <div
                className="flex flex-col gap-[5px]"
                role="group"
                aria-label={t('classesCard.title')}
              >
                {options.classes.map((c) => {
                  const checked = v.classIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggleClass(c.id)}
                      className={cn(
                        'flex items-center justify-between rounded-md px-2.5 py-[7px] text-left',
                        checked ? 'bg-secondary' : 'border border-border bg-background',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            'flex h-3.5 w-3.5 items-center justify-center rounded-sm',
                            checked ? 'bg-primary text-white' : 'border-[1.5px] border-border',
                          )}
                        >
                          {checked && <Check size={9} />}
                        </span>
                        <span
                          className={cn(
                            'text-caption font-medium',
                            checked ? 'text-primary' : 'text-foreground',
                          )}
                        >
                          {c.name}
                        </span>
                      </span>
                      <span className="text-2xs text-muted-foreground">
                        {t(
                          c.studentCount > 1
                            ? 'classesCard.studentCount.other'
                            : 'classesCard.studentCount.one',
                          { count: c.studentCount },
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </FormCard>
        </div>
      </div>
    </div>
  );
}
