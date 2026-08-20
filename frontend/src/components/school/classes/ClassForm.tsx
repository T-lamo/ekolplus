'use client';

// Fiche classe — Banani « Add Class » (add-class.md), same atoms as the fiche
// matière (FormCard / FormGroup / TextInput / BareSelect). Left: the four
// `form-card` sections (anchored by the header tabs) ; right (ASIDE_GRID):
// Apparence (couleur d'identification + aperçu de la carte — moved here from
// the mock's first card on user request), Récapitulatif, Checklist, Après
// création. Every string is French, every value comes from real data.
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightCircle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Info,
  NotebookPen,
  Palette,
  Plus,
  School,
  UserCheck,
  Lock,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { ASIDE_GRID } from '@/lib/layout';
import { roomLocation, roomTypeLabel, type RoomRow } from '@/lib/rooms';
import { SUBJECT_COLORS } from '@/lib/subject-visuals';
import { cn } from '@/lib/utils';
import {
  BareSelect,
  FormCard,
  FormGroup,
  SectionDivider,
  SelectItem,
  TextInput,
} from '@/components/school/subjects/form-primitives';
import {
  effectiveLevel,
  effectiveRoom,
  OTHER_LEVEL,
  OTHER_ROOM,
  validate,
  type ClassFormController,
  type ClassFormSubject,
} from './useClassForm';

export const CLASS_SECTION_IDS = {
  info: 'card-general',
  prof: 'card-prof',
  subjects: 'card-matieres',
  notes: 'card-notes',
} as const;
export type ClassSection = keyof typeof CLASS_SECTION_IDS;

export interface ClassFormTeacher {
  id: string;
  name: string;
  photoUrl: string | null;
  subjects: { id: string; name: string }[];
}

export interface ClassFormOptions {
  teachers: ClassFormTeacher[];
  subjects: ClassFormSubject[];
  levelCatalog: string[];
  /** Catalogue des salles (configuration/salles) — actives + celle déjà attitrée. */
  rooms: RoomRow[];
  yearLabel: string | null;
  /** Read-only « Configuration des notes » — inherited school settings. */
  grading: {
    scale: string | null;
    termCount: number;
    termType: string | null;
    bulletinTemplate: string | null;
  };
  /** Live enrolment count (edit) — 0 on create. */
  studentCount: number;
}

/** Section completion — shared by the tabs (✓ badges) and the checklist. */
export function classSectionsDone(
  form: ClassFormController,
): Record<ClassSection, boolean> & { checklist: Record<string, boolean> } {
  const v = form.values;
  const errors = validate(v);
  const nameOk = v.name.trim().length > 0 && !errors.name;
  const levelOk = effectiveLevel(v).length > 0;
  const capacityOk = v.capacity.trim() !== '' && !errors.capacity;
  const profOk = v.homeroomTeacherId !== null;
  const subjectsOk = v.subjectIds.length > 0;
  return {
    info: nameOk && levelOk && capacityOk,
    prof: profOk,
    subjects: subjectsOk,
    notes: true,
    checklist: { nameOk, levelOk, capacityOk, subjectsOk, profOk },
  };
}

export const CLASS_SECTIONS = ['info', 'prof', 'subjects', 'notes'] as const;

/** Keys of the complete sections — feeds the ✓ badges of the tabs. */
export function doneSectionKeys(done: Record<ClassSection, boolean>): ClassSection[] {
  return CLASS_SECTIONS.filter((k) => done[k]);
}

export function ClassForm({
  form,
  options,
}: {
  form: ClassFormController;
  options: ClassFormOptions;
}) {
  const t = useTranslations('Configuration.classes.form');
  const { values: v, setField, errors, serverError, mode } = form;
  const [detailOpen, setDetailOpen] = useState(false);

  const selectedTeacher = useMemo(
    () => options.teachers.find((teacher) => teacher.id === v.homeroomTeacherId) ?? null,
    [options.teachers, v.homeroomTeacherId],
  );
  const selectedCount = v.subjectIds.length;
  // Selected subjects with their pivot (edit mode) — « Détail des matières »
  // table + the two extra checklist lines.
  const selectedSubjects = useMemo(
    () =>
      options.subjects
        .filter((s) => v.subjectIds.includes(s.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [options.subjects, v.subjectIds],
  );
  const withoutTeacher = selectedSubjects.filter((s) => !form.pivots[s.id]?.teacherId).length;
  const withoutCoef = selectedSubjects.filter((s) => form.pivots[s.id]?.coefficient == null).length;
  const done = classSectionsDone(form);
  const color = v.color ?? 'var(--color-primary)';
  const levelLabel = effectiveLevel(v);
  // Room catalogue: active rooms + the one already attached (even inactive).
  const roomOptions = useMemo(
    () => options.rooms.filter((r) => r.isActive || r.id === v.roomId),
    [options.rooms, v.roomId],
  );
  const selectedRoom = roomOptions.find((r) => r.id === v.roomId) ?? null;
  const roomLabel = effectiveRoom(v, options.rooms);
  const capacityNum = Number(v.capacity);
  const roomTooSmall =
    selectedRoom?.capacity != null &&
    Number.isInteger(capacityNum) &&
    capacityNum > selectedRoom.capacity
      ? selectedRoom.capacity
      : null;
  // Under the room select: the room's identity line (type · places · lieu).
  // roomTypeLabel is a carve-out (shared with the risky Emploi du temps
  // module) — stays French by design, see CLAUDE.md's i18n carve-outs.
  const roomHint = selectedRoom
    ? [
        roomTypeLabel(selectedRoom.type),
        selectedRoom.capacity != null ? `${selectedRoom.capacity} ${t('info.placesSuffix')}` : null,
        roomLocation(selectedRoom) || null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const previewSub = [roomLabel || null, levelLabel || null].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info size={13} className="shrink-0" />
        {t('requiredHint')} <span className="font-semibold text-destructive-foreground">*</span>{' '}
        {t('requiredHintSuffix')}
      </p>
      {serverError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive px-3 py-2 text-caption text-destructive-foreground"
        >
          {serverError}
        </p>
      )}

      <div className={cn(ASIDE_GRID, 'items-start')}>
        {/* ── LEFT ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-4">
          <FormCard
            id={CLASS_SECTION_IDS.info}
            icon={<School size={15} />}
            title={t('info.title')}
            subtitle={t('info.subtitle')}
          >
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <FormGroup
                label={t('info.nameLabel')}
                required
                hint={t('info.nameHint')}
                error={errors.name}
                htmlFor="class-name"
              >
                <TextInput
                  id="class-name"
                  value={v.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder={t('info.namePlaceholder')}
                  maxLength={40}
                  autoFocus={mode === 'create'}
                />
              </FormGroup>
              <FormGroup
                label={t('info.levelLabel')}
                required
                error={errors.level}
                htmlFor="class-level"
              >
                {options.levelCatalog.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <BareSelect
                      id="class-level"
                      value={v.level}
                      onValueChange={(val) => setField('level', val)}
                      placeholder={t('info.levelPlaceholder')}
                    >
                      {options.levelCatalog.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                      <SelectItem value={OTHER_LEVEL}>{t('info.levelOther')}</SelectItem>
                    </BareSelect>
                    {v.level === OTHER_LEVEL && (
                      <TextInput
                        value={v.levelOther}
                        onChange={(e) => setField('levelOther', e.target.value)}
                        placeholder={t('info.levelOtherPlaceholder')}
                        maxLength={40}
                        aria-label={t('info.levelOtherAria')}
                      />
                    )}
                  </div>
                ) : (
                  <>
                    <TextInput
                      id="class-level"
                      value={v.level}
                      onChange={(e) => setField('level', e.target.value)}
                      placeholder={t('info.levelFreePlaceholder')}
                      maxLength={40}
                    />
                    <span className="text-2xs text-muted-foreground">
                      {t('info.noLevelCatalog')}{' '}
                      <Link
                        href="/configuration/niveaux"
                        className="font-medium text-primary hover:underline"
                      >
                        {t('info.noLevelCatalogLink')}
                      </Link>
                    </span>
                  </>
                )}
              </FormGroup>
              <FormGroup
                label={t('info.roomLabel')}
                optional
                htmlFor="class-room"
                {...(roomHint ? { hint: roomHint } : {})}
              >
                {roomOptions.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <BareSelect
                      id="class-room"
                      value={v.roomId}
                      onValueChange={(val) => setField('roomId', val)}
                      placeholder={t('info.roomNone')}
                    >
                      <SelectItem value="">{t('info.roomNone')}</SelectItem>
                      {roomOptions.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                          {r.capacity != null ? ` · ${r.capacity} pl.` : ''}
                          {!r.isActive ? ` ${t('info.inactiveSuffix')}` : ''}
                        </SelectItem>
                      ))}
                      <SelectItem value={OTHER_ROOM}>{t('info.roomOther')}</SelectItem>
                    </BareSelect>
                    {v.roomId === OTHER_ROOM && (
                      <TextInput
                        value={v.room}
                        onChange={(e) => setField('room', e.target.value)}
                        placeholder={t('info.roomOtherPlaceholder')}
                        maxLength={40}
                        aria-label={t('info.roomOtherAria')}
                      />
                    )}
                    {roomTooSmall !== null && (
                      <span
                        role="status"
                        className="flex items-center gap-1 text-2xs font-medium text-warning-foreground"
                      >
                        <AlertTriangle size={11} aria-hidden />
                        {t('info.roomTooSmall', {
                          roomCapacity: roomTooSmall,
                          classCapacity: capacityNum,
                        })}
                      </span>
                    )}
                  </div>
                ) : (
                  <>
                    <TextInput
                      id="class-room"
                      value={v.room}
                      onChange={(e) => setField('room', e.target.value)}
                      placeholder={t('info.roomFreePlaceholder')}
                      maxLength={40}
                    />
                    <span className="text-2xs text-muted-foreground">
                      {t('info.noRoomCatalog')}{' '}
                      <Link
                        href="/configuration/salles"
                        className="font-medium text-primary hover:underline"
                      >
                        {t('info.noRoomCatalogLink')}
                      </Link>
                    </span>
                  </>
                )}
              </FormGroup>
              <FormGroup
                label={t('info.capacityLabel')}
                required
                hint={t('info.capacityHint')}
                error={errors.capacity}
                htmlFor="class-capacity"
              >
                <TextInput
                  id="class-capacity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={500}
                  value={v.capacity}
                  onChange={(e) => setField('capacity', e.target.value)}
                  placeholder={t('info.capacityPlaceholder')}
                />
              </FormGroup>
              <FormGroup label={t('info.trackLabel')} optional htmlFor="class-track">
                <TextInput
                  id="class-track"
                  value={v.track}
                  onChange={(e) => setField('track', e.target.value)}
                  placeholder={t('info.trackPlaceholder')}
                  maxLength={60}
                />
              </FormGroup>
              <FormGroup
                label={t('info.yearLabel')}
                required
                hint={t('info.yearHint')}
                htmlFor="class-year"
              >
                <TextInput
                  id="class-year"
                  value={options.yearLabel ?? t('info.noActiveYear')}
                  readOnly
                  disabled
                />
              </FormGroup>
            </div>
          </FormCard>

          <FormCard
            id={CLASS_SECTION_IDS.prof}
            icon={<UserCheck size={15} />}
            title={t('prof.title')}
            subtitle={t('prof.subtitle')}
          >
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <FormGroup
                label={t('prof.teacherLabel')}
                optional
                hint={t('prof.teacherHint')}
                htmlFor="class-teacher"
              >
                <BareSelect
                  id="class-teacher"
                  value={v.homeroomTeacherId ?? ''}
                  onValueChange={(val) => setField('homeroomTeacherId', val || null)}
                  placeholder={t('prof.teacherPlaceholder')}
                >
                  <SelectItem value="">{t('prof.teacherNone')}</SelectItem>
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
              <FormGroup
                label={t('prof.subjectsLabel')}
                labelHint={t('prof.subjectsHint')}
                {...(selectedTeacher ? {} : { hint: t('prof.chooseTeacherHint') })}
              >
                <div className="flex min-h-[36px] flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted px-3 py-1.5">
                  {selectedTeacher && selectedTeacher.subjects.length > 0 ? (
                    selectedTeacher.subjects.map((s) => <Badge key={s.id}>{s.name}</Badge>)
                  ) : (
                    <span className="text-caption text-muted-foreground">—</span>
                  )}
                </div>
              </FormGroup>
            </div>
          </FormCard>

          <FormCard
            id={CLASS_SECTION_IDS.subjects}
            icon={<BookOpen size={15} />}
            title={t('subjects.title')}
            subtitle={t('subjects.subtitle')}
          >
            <MultiSelect
              id="class-subjects"
              options={options.subjects.map((s) => ({
                id: s.id,
                label: s.name,
                chip: s.abbreviation ?? s.name,
                ...(s.defaultCoefficient != null
                  ? { hint: t('subjects.coefficientHint', { coefficient: s.defaultCoefficient }) }
                  : {}),
                color: s.color,
                locked: form.lockedSubjectIds.has(s.id),
                lockedHint: t('subjects.lockedHint'),
              }))}
              value={v.subjectIds}
              onChange={(ids) => void form.setSubjectIds(ids)}
              placeholder={
                options.subjects.length === 0
                  ? t('subjects.noSubjectsPlaceholder')
                  : t('subjects.placeholder')
              }
              searchPlaceholder={t('subjects.searchPlaceholder')}
              emptyLabel={t('subjects.emptyLabel')}
              disabled={options.subjects.length === 0}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              <span>
                {t(
                  selectedCount > 1 ? 'subjects.selectedCount.other' : 'subjects.selectedCount.one',
                  { count: selectedCount, total: options.subjects.length },
                )}
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {mode === 'create' && options.subjects.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => void form.setSubjectIds(options.subjects.map((s) => s.id))}
                      className="font-medium hover:text-foreground"
                    >
                      {t('subjects.selectAll')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void form.setSubjectIds([])}
                      className="font-medium hover:text-foreground"
                    >
                      {t('subjects.deselectAll')}
                    </button>
                  </>
                )}
                <Link
                  href="/configuration/matieres/nouvelle"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  <Plus size={12} />
                  {t('subjects.createNew')}
                </Link>
              </span>
            </div>
            {form.subjectError && (
              <p role="alert" className="mt-2 text-xs text-destructive-foreground">
                {form.subjectError}
              </p>
            )}
            {mode === 'edit' && selectedSubjects.length > 0 && (
              <SubjectsDetail
                open={detailOpen}
                onToggle={() => setDetailOpen((o) => !o)}
                subjects={selectedSubjects}
                teachers={options.teachers}
                form={form}
                withoutTeacher={withoutTeacher}
                t={t}
              />
            )}
          </FormCard>

          <FormCard
            id={CLASS_SECTION_IDS.notes}
            icon={<NotebookPen size={15} />}
            title={t('notes.title')}
            subtitle={t('notes.subtitle')}
          >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <ReadonlyStat
                label={t('notes.scale')}
                value={options.grading.scale ?? t('notes.scaleDefault')}
                href="/settings?tab=annee"
              />
              <ReadonlyStat
                label={t('notes.periods')}
                value={
                  options.grading.termCount > 0
                    ? t(
                        options.grading.termCount > 1
                          ? 'notes.periodCount.other'
                          : 'notes.periodCount.one',
                        {
                          count: options.grading.termCount,
                          type: options.grading.termType ?? '',
                        },
                      )
                    : t('notes.periodsNone')
                }
                href="/settings?tab=annee"
              />
              <ReadonlyStat label={t('notes.calcMode')} value={t('notes.calcModeValue')} />
              <ReadonlyStat
                label={t('notes.passingGrade')}
                value={t('notes.passingGradeValue')}
                href="/configuration/matieres"
              />
              <ReadonlyStat
                label={t('notes.bulletinTemplate')}
                value={options.grading.bulletinTemplate ?? t('notes.bulletinTemplateNone')}
                href="/configuration/modele-bulletin"
                className="sm:col-span-2"
              />
            </div>
          </FormCard>
        </div>

        {/* ── RIGHT ────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-4">
          <FormCard
            id="card-apparence"
            icon={<Palette size={15} />}
            title={t('appearance.title')}
            subtitle={t('appearance.subtitle')}
          >
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
              {t('appearance.cardPreview')}
            </div>
            <div className="overflow-hidden rounded-md bg-background">
              <div className="h-[3px]" style={{ background: color }} />
              <div className="px-3 py-2.5">
                <div className="truncate text-lg leading-tight font-bold text-foreground">
                  {v.name.trim() || t('appearance.namePlaceholder')}
                </div>
                <div className="mt-0.5 truncate text-2xs text-muted-foreground">
                  {previewSub || t('appearance.subtitlePlaceholder')}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <PreviewStat label={t('appearance.students')} value={options.studentCount} />
                  <PreviewStat label={t('appearance.subjects')} value={selectedCount} />
                </div>
              </div>
            </div>
          </FormCard>

          <FormCard id="card-recap" icon={<Info size={15} />} title={t('recap.title')}>
            <InfoRow label={t('recap.name')} value={v.name.trim() || '—'} />
            <InfoRow label={t('recap.level')} value={levelLabel || '—'} />
            <InfoRow label={t('recap.room')} value={roomLabel || '—'} />
            <InfoRow
              label={t('recap.capacity')}
              value={v.capacity.trim() ? `${v.capacity.trim()} ${t('recap.capacitySuffix')}` : '—'}
            />
            <InfoRow
              label={t('recap.subjects')}
              value={
                <span className="text-primary">
                  {t(
                    selectedCount > 1
                      ? 'recap.subjectsSelected.other'
                      : 'recap.subjectsSelected.one',
                    { count: selectedCount },
                  )}
                </span>
              }
            />
            <InfoRow
              label={t('recap.homeroom')}
              value={
                selectedTeacher ? (
                  selectedTeacher.name
                ) : (
                  <span className="text-muted-foreground">{t('recap.homeroomEmpty')}</span>
                )
              }
            />
            <InfoRow label={t('recap.year')} value={options.yearLabel ?? '—'} />
          </FormCard>

          <FormCard
            id="card-checklist"
            icon={<CheckCircle2 size={15} className="text-success-foreground" />}
            title={t('checklist.title')}
          >
            <ul className="flex flex-col gap-[7px]">
              <ChecklistItem done={done.checklist.nameOk!}>{t('checklist.name')}</ChecklistItem>
              <ChecklistItem done={done.checklist.levelOk!}>{t('checklist.level')}</ChecklistItem>
              <ChecklistItem done={done.checklist.capacityOk!}>
                {t('checklist.capacity')}
              </ChecklistItem>
              <ChecklistItem done={done.checklist.subjectsOk!}>
                {t('checklist.subjects')}
                {selectedCount > 0 ? t('checklist.subjectsCount', { count: selectedCount }) : ''}
              </ChecklistItem>
              <ChecklistItem done={done.checklist.profOk!}>{t('checklist.homeroom')}</ChecklistItem>
              {mode === 'edit' && selectedCount > 0 && (
                <>
                  <ChecklistItem done={withoutTeacher === 0}>
                    {t('checklist.allSubjectsHaveTeacher')}
                    {withoutTeacher > 0
                      ? t('checklist.someWithoutTeacher', { count: withoutTeacher })
                      : ''}
                  </ChecklistItem>
                  <ChecklistItem done={withoutCoef === 0}>
                    {t('checklist.coefficientsFilled')}
                    {withoutCoef > 0
                      ? t('checklist.someMissingCoefficients', { count: withoutCoef })
                      : ''}
                  </ChecklistItem>
                </>
              )}
            </ul>
            {!done.checklist.profOk && (
              <div className="mt-2.5 flex items-start gap-1.5 rounded-md bg-warning px-2.5 py-2">
                <AlertCircle size={13} className="mt-px shrink-0 text-warning-foreground" />
                <span className="text-2xs text-warning-foreground">
                  {t('checklist.homeroomOptionalHint')}
                </span>
              </div>
            )}
          </FormCard>

          <FormCard
            id="card-next"
            icon={<ArrowRightCircle size={15} />}
            title={mode === 'create' ? t('next.titleCreate') : t('next.titleEdit')}
          >
            <ol className="flex flex-col gap-2.5">
              <NextStep n={1} href="/eleves" title={t('next.enrollTitle')}>
                {t('next.enrollDesc')}
              </NextStep>
              <NextStep n={2} href={`#${CLASS_SECTION_IDS.subjects}`} title={t('next.assignTitle')}>
                {t('next.assignDesc')}
              </NextStep>
              <NextStep n={3} href="/scolarite/configuration" title={t('next.feesTitle')}>
                {t('next.feesDesc')}
              </NextStep>
            </ol>
          </FormCard>
        </div>
      </div>
    </div>
  );
}

function ReadonlyStat({
  label,
  value,
  href,
  className,
}: {
  label: string;
  value: string;
  href?: string;
  className?: string;
}) {
  const t = useTranslations('Configuration.classes.form.notes');
  return (
    <div className={cn('rounded-md bg-background px-3 py-2', className)}>
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className="mt-px flex items-center justify-between gap-2">
        <span className="truncate text-caption font-semibold text-foreground">{value}</span>
        {href && (
          <Link href={href} className="shrink-0 text-2xs font-medium text-primary hover:underline">
            {t('manage')}
          </Link>
        )}
      </div>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-card px-2.5 py-[7px]">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-px text-[15px] leading-tight font-bold text-foreground">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-[5px] last:border-b-0">
      <span className="text-2xs text-muted-foreground">{label}</span>
      <span className="truncate text-2xs font-semibold text-foreground">{value}</span>
    </div>
  );
}

/** « Détail des matières » — collapsed by default: one dense row per selected
 * subject with the pivot's teacher / coefficient / weekly hours, edited in
 * place (upsert). Replaces the former Coefficients & Affectations pages for
 * the class-centric view. */
type SubjectsDetailT = (
  key:
    | 'subjects.detailToggle'
    | 'subjects.detailToggleHint'
    | 'subjects.withoutTeacherBadge'
    | 'subjects.detailTable.subject'
    | 'subjects.detailTable.teacher'
    | 'subjects.detailTable.coefficient'
    | 'subjects.detailTable.weeklyHours'
    | 'subjects.detailTable.lockAria'
    | 'subjects.detailTable.teacherNone'
    | 'subjects.detailTable.teacherPlaceholderMobile'
    | 'subjects.detailTable.coefficientAria'
    | 'subjects.detailTable.weeklyHoursAria'
    | 'subjects.detailTable.lockedAria'
    | 'subjects.detailTable.coeffLabel'
    | 'subjects.detailTable.weeklyHoursLabelMobile',
  values?: { count?: number; subject?: string },
) => string;

function SubjectsDetail({
  open,
  onToggle,
  subjects,
  teachers,
  form,
  withoutTeacher,
  t,
}: {
  open: boolean;
  onToggle: () => void;
  subjects: ClassFormSubject[];
  teachers: ClassFormTeacher[];
  form: ClassFormController;
  withoutTeacher: number;
  t: SubjectsDetailT;
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-md border border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="class-subjects-detail"
        className="flex w-full items-center gap-2 bg-muted px-3 py-2 text-left hover:bg-muted/70"
      >
        <ChevronRight
          size={14}
          className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
        />
        <span className="text-caption font-semibold text-foreground">
          {t('subjects.detailToggle', { count: subjects.length })}
        </span>
        <span className="hidden text-2xs text-muted-foreground sm:inline">
          {t('subjects.detailToggleHint')}
        </span>
        {withoutTeacher > 0 && (
          <span className="ml-auto rounded-full bg-warning px-2 py-px text-2xs font-semibold text-warning-foreground">
            {t('subjects.withoutTeacherBadge', { count: withoutTeacher })}
          </span>
        )}
      </button>
      {open && (
        <div id="class-subjects-detail">
          {/* md+: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[520px] border-collapse text-caption">
              <thead>
                <tr className="border-t border-b border-border bg-card text-left text-2xs font-semibold text-muted-foreground uppercase">
                  <th className="px-3 py-1.5 font-semibold">{t('subjects.detailTable.subject')}</th>
                  <th className="px-2 py-1.5 font-semibold">{t('subjects.detailTable.teacher')}</th>
                  <th className="w-[72px] px-2 py-1.5 text-center font-semibold">
                    {t('subjects.detailTable.coefficient')}
                  </th>
                  <th className="w-[84px] px-2 py-1.5 text-center font-semibold">
                    {t('subjects.detailTable.weeklyHours')}
                  </th>
                  <th className="w-8 px-2 py-1.5" aria-label={t('subjects.detailTable.lockAria')} />
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => {
                  const pivot = form.pivots[s.id];
                  const busy = form.pivotBusy === s.id;
                  return (
                    <tr
                      key={s.id}
                      className={cn('border-b border-border last:border-b-0', busy && 'opacity-60')}
                    >
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                            style={{ background: s.color ?? 'var(--color-primary)' }}
                          />
                          <span className="truncate font-medium text-foreground">{s.name}</span>
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <BareSelect
                          value={pivot?.teacherId ?? ''}
                          onValueChange={(id) =>
                            void form.updatePivot(s.id, { teacherId: id || null })
                          }
                          placeholder="—"
                          className="h-8 py-1 text-xs"
                          disabled={!pivot || busy}
                        >
                          <SelectItem value="">{t('subjects.detailTable.teacherNone')}</SelectItem>
                          {teachers.map((teacher) => (
                            <SelectItem key={teacher.id} value={teacher.id}>
                              {teacher.name}
                            </SelectItem>
                          ))}
                        </BareSelect>
                      </td>
                      <td className="px-2 py-1.5">
                        <NumberCell
                          ariaLabel={t('subjects.detailTable.coefficientAria', { subject: s.name })}
                          value={pivot?.coefficient ?? null}
                          min={1}
                          max={10}
                          step={1}
                          disabled={!pivot || busy}
                          onCommit={(n) => void form.updatePivot(s.id, { coefficient: n })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <NumberCell
                          ariaLabel={t('subjects.detailTable.weeklyHoursAria', { subject: s.name })}
                          value={pivot?.weeklyHours ?? null}
                          min={0.5}
                          max={60}
                          step={0.5}
                          disabled={!pivot || busy}
                          onCommit={(n) => void form.updatePivot(s.id, { weeklyHours: n })}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {pivot?.locked && (
                          <Lock
                            size={12}
                            className="inline text-muted-foreground"
                            aria-label={t('subjects.detailTable.lockedAria')}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* < md: cards */}
          <div className="flex flex-col gap-2 p-2.5 md:hidden">
            {subjects.map((s) => {
              const pivot = form.pivots[s.id];
              const busy = form.pivotBusy === s.id;
              return (
                <div
                  key={s.id}
                  className={cn('rounded-md border border-border p-2.5', busy && 'opacity-60')}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{ background: s.color ?? 'var(--color-primary)' }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {s.name}
                    </span>
                    {pivot?.locked && (
                      <Lock
                        size={12}
                        className="shrink-0 text-muted-foreground"
                        aria-label={t('subjects.detailTable.lockedAria')}
                      />
                    )}
                  </div>
                  <div className="mt-2">
                    <BareSelect
                      value={pivot?.teacherId ?? ''}
                      onValueChange={(id) => void form.updatePivot(s.id, { teacherId: id || null })}
                      placeholder={t('subjects.detailTable.teacherPlaceholderMobile')}
                      className="h-8 w-full py-1 text-xs"
                      disabled={!pivot || busy}
                    >
                      <SelectItem value="">{t('subjects.detailTable.teacherNone')}</SelectItem>
                      {teachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.name}
                        </SelectItem>
                      ))}
                    </BareSelect>
                  </div>
                  <div className="mt-2 flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                      {t('subjects.detailTable.coeffLabel')}
                      <NumberCell
                        ariaLabel={t('subjects.detailTable.coefficientAria', { subject: s.name })}
                        value={pivot?.coefficient ?? null}
                        min={1}
                        max={10}
                        step={1}
                        disabled={!pivot || busy}
                        onCommit={(n) => void form.updatePivot(s.id, { coefficient: n })}
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                      {t('subjects.detailTable.weeklyHoursLabelMobile')}
                      <NumberCell
                        ariaLabel={t('subjects.detailTable.weeklyHoursAria', { subject: s.name })}
                        value={pivot?.weeklyHours ?? null}
                        min={0.5}
                        max={60}
                        step={0.5}
                        disabled={!pivot || busy}
                        onCommit={(n) => void form.updatePivot(s.id, { weeklyHours: n })}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Small numeric cell that commits on blur / Enter (only when the value changed). */
function NumberCell({
  value,
  min,
  max,
  step,
  disabled,
  ariaLabel,
  onCommit,
}: {
  value: number | null;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  ariaLabel: string;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    setText(value == null ? '' : String(value));
  }, [value]);
  function commit() {
    const trimmed = text.trim();
    if (trimmed === '') {
      if (value !== null) onCommit(null);
      return;
    }
    const n = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(n) || n < min || n > max) {
      setText(value == null ? '' : String(value));
      return;
    }
    if (n !== value) onCommit(n);
  }
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className="h-8 w-full rounded-md border border-border bg-input px-2 text-center text-xs text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 disabled:opacity-60"
    />
  );
}

function ChecklistItem({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className="flex items-center gap-[7px]">
      {done ? (
        <CheckCircle2 size={14} className="shrink-0 text-success-foreground" />
      ) : (
        <span className="h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-border" />
      )}
      <span className={cn('text-xs', done ? 'text-foreground' : 'text-muted-foreground')}>
        {children}
      </span>
    </li>
  );
}

function NextStep({
  n,
  href,
  title,
  children,
}: {
  n: number;
  href: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="group flex items-start gap-2">
        <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-primary">
          {n}
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-foreground group-hover:text-primary">
            {title}
          </span>
          <span className="block text-2xs text-muted-foreground">{children}</span>
        </span>
      </Link>
    </li>
  );
}
