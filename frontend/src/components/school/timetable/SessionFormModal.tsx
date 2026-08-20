'use client';

// Banani « Nouveau cours » modal (67UQB7XgiD48 — emploi-du-temps.md): 560px,
// titled header, sectioned body (Cours · Intervenants & Lieu · Horaire ·
// Récurrence · Options), footer Annuler / « ✓ Enregistrer la séance ».
// Create mode expands a weekly recurrence server-side (one row per
// occurrence, shared seriesId); edit mode can apply changes to the whole
// series and delete « cette séance » or « toute la série ». 409
// TIMETABLE_CONFLICT is surfaced inline with the offending slot.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as SelectPrimitive from '@radix-ui/react-select';
import {
  AlertTriangle,
  CalendarX,
  ChevronDown,
  Clock,
  DoorOpen,
  Repeat,
  School,
  Timer,
  Trash2,
  Video,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { type RoomRow } from '@/lib/rooms';
import { SUBJECT_COLORS, subjectAccentColor } from '@/lib/subject-visuals';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { FormStepsBar } from '@/components/school/FormStepsBar';
import { WizardNav } from '@/components/school/WizardNav';
import { DateField } from '@/components/ui/DateField';
import { Modal } from '@/components/ui/Modal';
import { SelectItem } from '@/components/ui/Select';
import { FormGroup, TextArea, TextInput } from '@/components/school/subjects/form-primitives';
import type {
  ClassOption,
  ClassSubjectLink,
  ConflictDetail,
  SessionType,
  SubjectOption,
  TeacherOption,
  TimetableSession,
} from './types';
import {
  RECURRENCE_DAYS,
  SESSION_TYPES,
  TIME_OPTIONS,
  TYPE_META,
  countOccurrences,
  formatDuration,
  formatLong,
  isoWeekday,
  joinDayNames,
  minutesToHHMM,
  todayDay,
  weeklyVolume,
} from './timetable-utils';

const FORM_ID = 'tt-session-form';
// Step labels come from `timetable.sessionForm.steps.*`, keyed by these ids
// (this const can't call a hook). STEP_OF_FIELD below maps a field name to
// its index in this same order.
const STEP_IDS = ['cours', 'horaire', 'options'] as const;
/** Which step shows each validated field — used to jump to the offending
 * step on submit and to validate only the current step on « Suivant ». */
const STEP_OF_FIELD: Record<string, number> = {
  subjectId: 0,
  classId: 0,
  teacherId: 1,
  room: 1,
  date: 1,
  time: 1,
  until: 1,
  meetingUrl: 2,
};

const OTHER_ROOM = '__other__';

export interface SessionFormInitial {
  session?: TimetableSession;
  day?: string;
  startMinutes?: number;
  classId?: string;
}

export function SessionFormModal({
  initial,
  classes,
  teachers,
  subjects,
  rooms,
  links,
  sessions,
  academicYear,
  onClose,
  onSaved,
}: {
  initial: SessionFormInitial;
  classes: ClassOption[];
  teachers: TeacherOption[];
  subjects: SubjectOption[];
  rooms: RoomRow[];
  links: ClassSubjectLink[];
  /** Currently loaded sessions — weekly volume hint. */
  sessions: TimetableSession[];
  academicYear: { label: string; endDate: string } | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const editing = initial.session ?? null;
  const mode = editing ? 'edit' : 'create';
  const locale = useLocale();
  const t = useTranslations('Timetable.sessionForm');
  const tType = useTranslations('Timetable.sessionType');

  const [subjectId, setSubjectId] = useState(editing?.subjectId ?? '');
  // Only a real per-session override seeds the picker. Seeding from the
  // effective colour (override ?? subject's) used to freeze the subject's
  // colour of the day into the row on every save — and changing the
  // subject's colour later no longer reached those sessions.
  const [color, setColor] = useState<string | null>(editing?.colorOverride ?? null);
  const [colorTouched, setColorTouched] = useState(!!editing?.colorOverride);
  const [type, setType] = useState<SessionType>(
    (SESSION_TYPES as string[]).includes(editing?.type ?? '')
      ? (editing?.type as SessionType)
      : 'CM',
  );
  const [teacherId, setTeacherId] = useState(editing?.teacherId ?? '');
  const [teacherTouched, setTeacherTouched] = useState(!!editing);
  const [roomId, setRoomId] = useState<string>(() => {
    if (editing?.roomId) return editing.roomId;
    if (editing?.room) return OTHER_ROOM;
    return '';
  });
  const [customRoom, setCustomRoom] = useState(editing?.roomId ? '' : (editing?.room ?? ''));
  const [roomTouched, setRoomTouched] = useState(!!editing);
  // Active catalogue rooms + the one already attached (even if deactivated
  // since — editing shouldn't silently drop it from the list).
  const roomOptions = useMemo(
    () => rooms.filter((r) => r.isActive || r.id === roomId),
    [rooms, roomId],
  );
  const selectedRoom = roomOptions.find((r) => r.id === roomId) ?? null;
  const [classId, setClassId] = useState(editing?.classId ?? initial.classId ?? '');
  const [date, setDate] = useState(editing?.date ?? initial.day ?? todayDay());
  const [startMinutes, setStartMinutes] = useState(
    editing?.startMinutes ?? initial.startMinutes ?? 8 * 60,
  );
  const [endMinutes, setEndMinutes] = useState(
    editing?.endMinutes ?? (initial.startMinutes ?? 8 * 60) + 60,
  );
  const [recurring, setRecurring] = useState(mode === 'create');
  const [days, setDays] = useState<number[]>(() => {
    const wd = isoWeekday(editing?.date ?? initial.day ?? todayDay());
    return wd <= 6 ? [wd] : [1];
  });
  const [until, setUntil] = useState(academicYear?.endDate ?? '');
  const [applyToSeries, setApplyToSeries] = useState(false);
  const [description, setDescription] = useState(editing?.description ?? '');
  const [meetingUrl, setMeetingUrl] = useState(editing?.meetingUrl ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictDetail[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Wizard steps (user decision 2026-08-17: the one-page form was too long).
  // Editing an existing session unlocks every step at once.
  const [stepIndex, setStepIndex] = useState(0);
  const [maxReached, setMaxReached] = useState(editing ? STEP_IDS.length - 1 : 0);

  const subject = subjects.find((s) => s.id === subjectId) ?? null;
  // Same colour the Matières list shows for the subject (stored swatch or
  // name-derived default) — what the grid will paint unless overridden.
  const subjectColor = subject ? subjectAccentColor(subject.name, subject.color) : null;
  const effectiveColor = colorTouched ? color : subjectColor;
  const room = roomId && roomId !== OTHER_ROOM ? (selectedRoom?.name ?? '') : customRoom.trim();

  const steps = useMemo(() => STEP_IDS.map((id) => ({ id, label: t(`steps.${id}`) })), [t]);
  // EXAM is its own word in every locale — the CM/TD/TP picker entries pair
  // the persisted code with its long label, the exam entry needs no prefix.
  const typeOptionLabel = (tp: SessionType): string =>
    tp === 'EXAM' ? tType(tp) : `${TYPE_META[tp].short} — ${tType(tp)}`;

  // Defaults that follow the class × subject assignment until the user
  // overrides them: teacher from the pivot, room from the class.
  useEffect(() => {
    if (teacherTouched || !classId || !subjectId) return;
    const link = links.find((l) => l.classId === classId && l.subjectId === subjectId);
    if (link?.teacherId) setTeacherId(link.teacherId);
  }, [classId, subjectId, links, teacherTouched]);
  useEffect(() => {
    if (roomTouched || !classId) return;
    const cls = classes.find((c) => c.id === classId);
    if (cls?.roomId) {
      setRoomId(cls.roomId);
      setCustomRoom('');
    } else if (cls?.room) {
      setRoomId(OTHER_ROOM);
      setCustomRoom(cls.room);
    }
  }, [classId, classes, roomTouched]);
  // Keep the base weekday selected when the date moves (create mode).
  useEffect(() => {
    if (mode !== 'create' || !date) return;
    const wd = isoWeekday(date);
    if (wd <= 6) setDays((prev) => (prev.includes(wd) ? prev : [...prev, wd].sort()));
  }, [date, mode]);

  const duration = Math.max(0, endMinutes - startMinutes);
  const weekly =
    classId && subjectId
      ? weeklyVolume(sessions, classId, subjectId, date, editing?.id) + duration
      : duration;
  const occurrences = recurring ? countOccurrences(date, days, until) : 1;
  // « lundis, mercredis et vendredis » — the names and the conjunction are
  // translated here; joinDayNames() owns only the punctuation of the join.
  const daysLabel = joinDayNames(
    RECURRENCE_DAYS.filter((value) => days.includes(value)).map((value) =>
      t(`recurrence.dayPlural.${value}`),
    ),
    t('recurrence.and'),
  );
  const occurrenceLabel = t(
    occurrences === 1 ? 'recurrence.occurrenceCount.one' : 'recurrence.occurrenceCount.other',
    { count: occurrences },
  );

  function computeErrors(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!subjectId) errs.subjectId = t('errors.subject');
    if (!classId) errs.classId = t('errors.class');
    if (!teacherId) errs.teacherId = t('errors.teacher');
    if (!room) errs.room = t('errors.room');
    if (!date) errs.date = t('errors.date');
    if (endMinutes <= startMinutes) errs.time = t('errors.time');
    if (mode === 'create' && recurring) {
      if (!until) errs.until = t('errors.untilRequired');
      else if (until < date) errs.until = t('errors.untilBeforeDate');
    }
    if (meetingUrl.trim() && !/^https?:\/\//i.test(meetingUrl.trim())) {
      errs.meetingUrl = t('errors.meetingUrl');
    }
    return errs;
  }

  /** Full validation (submit) — on failure, jump to the first step that
   * holds an error so the message is visible. */
  function validate(): boolean {
    const errs = computeErrors();
    setFieldErrors(errs);
    const keys = Object.keys(errs);
    if (keys.length === 0) return true;
    const firstStep = Math.min(...keys.map((k) => STEP_OF_FIELD[k] ?? 0));
    if (firstStep !== stepIndex) goTo(firstStep);
    return false;
  }

  /** Validation limited to the fields of one step (Suivant). */
  function validateStep(index: number): boolean {
    const errs = computeErrors();
    const own = Object.fromEntries(
      Object.entries(errs).filter(([k]) => (STEP_OF_FIELD[k] ?? 0) === index),
    );
    setFieldErrors(own);
    return Object.keys(own).length === 0;
  }

  function goTo(index: number) {
    setStepIndex(index);
    setMaxReached((m) => Math.max(m, index));
    setError(null);
    setConflicts([]);
  }

  function goNext() {
    if (!validateStep(stepIndex)) return;
    if (stepIndex < STEP_IDS.length - 1) goTo(stepIndex + 1);
  }

  async function submit() {
    setError(null);
    setConflicts([]);
    if (!validate()) return;
    setSubmitting(true);
    const payload = {
      classId,
      subjectId,
      teacherId: teacherId || null,
      room: room || null,
      roomId: roomId && roomId !== OTHER_ROOM ? roomId : null,
      type,
      // An override equal to the subject's own colour is pointless and
      // harmful (it would stop following the subject) — store null instead.
      color: colorTouched && color && color !== subjectColor ? color : null,
      date,
      startMinutes,
      endMinutes,
      description: description.trim() || null,
      meetingUrl: meetingUrl.trim() || null,
    };
    try {
      if (editing) {
        const scope = applyToSeries && editing.seriesCount > 1 ? 'series' : 'one';
        const body: Record<string, unknown> = { ...payload, scope };
        if (scope === 'series') delete body.date;
        const res = await api<{ count: number }>(`/api/school/timetable/${editing.id}`, {
          method: 'PATCH',
          body,
        });
        onSaved(
          res.count > 1
            ? t('toasts.updated.other', { count: res.count })
            : t('toasts.updated.one', { count: res.count }),
        );
      } else {
        const res = await api<{ count: number }>('/api/school/timetable', {
          method: 'POST',
          body: {
            ...payload,
            recurrence: recurring && days.length > 0 ? { days, until } : null,
          },
        });
        onSaved(
          res.count > 1
            ? t('toasts.created.other', { count: res.count })
            : t('toasts.created.one', { count: res.count }),
        );
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TIMETABLE_CONFLICT') {
        const details = err.body.conflicts;
        setConflicts(Array.isArray(details) ? (details as ConflictDetail[]) : []);
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : t('toasts.networkError'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(scope: 'one' | 'series') {
    if (!editing) return;
    setDeleting(true);
    setError(null);
    try {
      await api(`/api/school/timetable/${editing.id}?scope=${scope}`, { method: 'DELETE' });
      onSaved(scope === 'series' ? t('toasts.deletedSeries') : t('toasts.deletedOne'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('toasts.networkError'));
      setDeleting(false);
    }
  }

  const deleteRow = (
    <div className="flex flex-wrap items-center gap-2.5">
      {editing && !confirmDelete && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit text-destructive-foreground hover:bg-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 size={14} />
          {t('delete.trigger')}
        </Button>
      )}
      {editing && confirmDelete && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{t('delete.scopeLabel')}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            loading={deleting}
            onClick={() => remove('one')}
          >
            {t('delete.thisOne')}
          </Button>
          {editing.seriesCount > 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit text-destructive-foreground"
              loading={deleting}
              onClick={() => remove('series')}
            >
              {t('delete.wholeSeries', { count: editing.seriesCount })}
            </Button>
          )}
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => setConfirmDelete(false)}
          >
            {t('delete.cancel')}
          </button>
        </div>
      )}
    </div>
  );
  // Same footer as the student/teacher wizards: Annuler left, Précédent /
  // Suivant (or Enregistrer on the last step) right; the delete controls
  // (edit mode) sit on their own line above.
  const footer = (
    <div className="flex flex-col gap-2.5">
      {editing && deleteRow}
      <WizardNav
        stepIndex={stepIndex}
        stepCount={STEP_IDS.length}
        submitting={submitting}
        submitLabel={t('fields.submit')}
        formId={FORM_ID}
        onCancel={onClose}
        onPrev={() => goTo(Math.max(0, stepIndex - 1))}
        onNext={goNext}
      />
    </div>
  );

  return (
    <Modal
      title={editing ? t('title.edit') : t('title.create')}
      subtitle={
        editing
          ? `${editing.subject.name} · ${editing.class.name} · ${formatLong(editing.date, locale)}`
          : t('title.createSubtitle')
      }
      medium
      bodyClassName="px-6 py-5"
      footerClassName="px-6 py-3.5"
      onClose={onClose}
      header={
        <FormStepsBar
          steps={steps}
          activeIndex={stepIndex}
          maxReachedIndex={maxReached}
          onStepSelect={goTo}
        />
      }
      footer={footer}
    >
      <form
        id={FORM_ID}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          // Enter in a field advances on middle steps, saves on the last.
          if (stepIndex < STEP_IDS.length - 1) goNext();
          else void submit();
        }}
      >
        {stepIndex === 0 && (
          <>
            {/* ── Cours ─────────────────────────────────────────────── */}
            <SectionLabel>{t('sections.course')}</SectionLabel>
            <FormGroup
              label={t('fields.subject')}
              required
              error={fieldErrors.subjectId}
              htmlFor="tt-subject"
            >
              <IconSelect
                id="tt-subject"
                value={subjectId}
                onValueChange={(v) => {
                  setSubjectId(v);
                  setTeacherTouched(false);
                }}
                placeholder={t('fields.subjectPlaceholder')}
                // The selected item already renders its swatch through Radix's
                // <Value>; only the placeholder state needs the leading dot.
                icon={
                  subjectId ? null : (
                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 rounded-[3px] bg-muted-foreground/30"
                    />
                  )
                }
              >
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-3 w-3 shrink-0 rounded-[3px]"
                        style={{ background: subjectAccentColor(s.name, s.color) }}
                      />
                      {s.name}
                    </span>
                  </SelectItem>
                ))}
              </IconSelect>
            </FormGroup>

            <div className="flex flex-col gap-[5px]">
              <span className="text-xs font-semibold text-foreground">{t('color.label')}</span>
              <div className="flex flex-wrap items-center gap-2.5">
                <div
                  className="flex items-center gap-1.5"
                  role="radiogroup"
                  aria-label={t('color.groupAriaLabel')}
                >
                  {SUBJECT_COLORS.map((hex) => {
                    const selected = effectiveColor === hex;
                    return (
                      <button
                        key={hex}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={hex}
                        onClick={() => {
                          setColorTouched(true);
                          setColor(hex);
                        }}
                        style={{ background: hex }}
                        className={cn(
                          'h-5 w-5 shrink-0 rounded-[5px] transition-[outline]',
                          selected && 'outline outline-[2.5px] outline-offset-2 outline-foreground',
                        )}
                      />
                    );
                  })}
                </div>
                {colorTouched && subjectColor && color !== subjectColor ? (
                  <button
                    type="button"
                    onClick={() => {
                      setColorTouched(false);
                      setColor(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-2xs font-medium text-primary"
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{ background: subjectColor }}
                    />
                    {t('color.reset')}
                  </button>
                ) : (
                  <span className="text-2xs text-muted-foreground">{t('color.hint')}</span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-[5px]">
              <span className="text-xs font-semibold text-foreground">
                {t('fields.sessionType')}
                <span className="ml-0.5 text-destructive-foreground">*</span>
              </span>
              <div
                className="flex flex-wrap gap-1.5"
                role="radiogroup"
                aria-label={t('fields.sessionType')}
              >
                {SESSION_TYPES.map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    role="radio"
                    aria-checked={type === tp}
                    onClick={() => setType(tp)}
                    className={cn(
                      'rounded-xl border-[1.5px] px-3.5 py-[5px] text-xs font-semibold whitespace-nowrap transition-colors',
                      type === tp
                        ? TYPE_META[tp].active
                        : 'border-border bg-input text-muted-foreground hover:border-muted-foreground/40',
                    )}
                  >
                    {typeOptionLabel(tp)}
                  </button>
                ))}
              </div>
            </div>

            <FormGroup
              label={t('fields.class')}
              required
              error={fieldErrors.classId}
              htmlFor="tt-class"
            >
              <IconSelect
                id="tt-class"
                value={classId}
                onValueChange={(v) => {
                  setClassId(v);
                  setTeacherTouched(false);
                  setRoomTouched(false);
                }}
                placeholder={t('fields.classPlaceholder')}
                icon={<School size={13} className="text-muted-foreground" />}
              >
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </IconSelect>
            </FormGroup>
          </>
        )}
        {stepIndex === 1 && (
          <>
            {/* ── Intervenants & Lieu ───────────────────────────────── */}
            <SectionLabel className="mt-1">{t('sections.staffAndPlace')}</SectionLabel>
            <div className="flex flex-col gap-3 sm:flex-row">
              <FormGroup
                label={t('fields.teacher')}
                required
                error={fieldErrors.teacherId}
                htmlFor="tt-teacher"
                className="flex-1"
              >
                <IconSelect
                  id="tt-teacher"
                  value={teacherId}
                  onValueChange={(v) => {
                    setTeacherId(v);
                    setTeacherTouched(true);
                  }}
                  placeholder={t('fields.teacherPlaceholder')}
                  icon={null}
                >
                  {/* `teacher`, not `t` — `t` is the translator in this file. */}
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      <span className="inline-flex items-center gap-[7px]">
                        <Avatar name={teacher.name} src={teacher.photoUrl} size={20} />
                        {teacher.name}
                      </span>
                    </SelectItem>
                  ))}
                </IconSelect>
              </FormGroup>
              <FormGroup
                label={t('fields.room')}
                required
                error={fieldErrors.room}
                htmlFor="tt-room"
                className="flex-1"
              >
                {roomOptions.length > 0 ? (
                  <>
                    <IconSelect
                      id="tt-room"
                      value={roomId}
                      onValueChange={(v) => {
                        setRoomId(v);
                        setRoomTouched(true);
                      }}
                      placeholder={t('fields.roomPlaceholder')}
                      icon={<DoorOpen size={13} className="text-muted-foreground" />}
                    >
                      {roomOptions.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                          {r.capacity != null
                            ? ` · ${t('rooms.capacity', { count: r.capacity })}`
                            : ''}
                          {!r.isActive ? ` · ${t('rooms.inactive')}` : ''}
                        </SelectItem>
                      ))}
                      <SelectItem value={OTHER_ROOM}>{t('fields.otherPlace')}</SelectItem>
                    </IconSelect>
                    {roomId === OTHER_ROOM && (
                      <TextInput
                        aria-label={t('fields.otherPlaceAriaLabel')}
                        placeholder={t('fields.otherPlacePlaceholder')}
                        value={customRoom}
                        onChange={(e) => setCustomRoom(e.target.value)}
                        autoFocus
                      />
                    )}
                  </>
                ) : (
                  <div className="flex flex-col gap-1">
                    <TextInput
                      id="tt-room"
                      aria-label={t('fields.roomOrPlaceAriaLabel')}
                      placeholder={t('fields.roomFreePlaceholder')}
                      value={customRoom}
                      onChange={(e) => {
                        setCustomRoom(e.target.value);
                        setRoomTouched(true);
                      }}
                    />
                    <span className="text-2xs text-muted-foreground">
                      {t.rich('rooms.noCatalogue', {
                        link: (chunks) => (
                          <Link
                            href="/configuration/salles"
                            className="font-medium text-primary hover:underline"
                          >
                            {chunks}
                          </Link>
                        ),
                      })}
                    </span>
                  </div>
                )}
              </FormGroup>
            </div>
            {/* ── Horaire ───────────────────────────────────────────── */}
            <SectionLabel className="mt-1">{t('sections.schedule')}</SectionLabel>
            <div data-field-error={fieldErrors.date ? 'true' : undefined}>
              <DateField
                label={
                  <>
                    {t('fields.date')}
                    <span className="ml-0.5 text-destructive-foreground">*</span>
                  </>
                }
                id="tt-date"
                value={date}
                onChange={setDate}
                compact
                weekday
                required
                disabled={!!editing && applyToSeries && editing.seriesCount > 1}
              />
              {fieldErrors.date && (
                <span role="alert" className="mt-1 block text-2xs text-destructive-foreground">
                  {fieldErrors.date}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <FormGroup
                label={t('fields.startTime')}
                required
                htmlFor="tt-start"
                className="flex-1"
              >
                <TimeSelect
                  id="tt-start"
                  value={startMinutes}
                  onValueChange={(m) => {
                    setStartMinutes(m);
                    if (endMinutes <= m) setEndMinutes(Math.min(m + 60, 19 * 60));
                  }}
                  options={TIME_OPTIONS.filter((m) => m < 19 * 60)}
                />
              </FormGroup>
              <FormGroup
                label={t('fields.endTime')}
                required
                htmlFor="tt-end"
                error={fieldErrors.time}
                className="flex-1"
              >
                <TimeSelect
                  id="tt-end"
                  value={endMinutes}
                  onValueChange={setEndMinutes}
                  options={TIME_OPTIONS.filter((m) => m > startMinutes)}
                />
              </FormGroup>
            </div>
            <div className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-[7px]">
              <Timer size={13} className="shrink-0 text-primary" aria-hidden />
              <span className="text-xs font-medium text-primary">
                {t('fields.durationSummary', {
                  duration: formatDuration(duration),
                  weekly: formatDuration(weekly),
                })}
              </span>
            </div>

            {/* ── Récurrence ────────────────────────────────────────── */}
            {mode === 'create' ? (
              <>
                <SectionLabel className="mt-1">{t('sections.recurrence')}</SectionLabel>
                <div className="overflow-hidden rounded-md border border-border">
                  <div className="flex items-center justify-between gap-3 bg-muted px-3.5 py-2.5">
                    <div>
                      <div className="text-caption font-semibold text-foreground">
                        {t('recurrence.toggleLabel')}
                      </div>
                      <div className="mt-px text-2xs text-muted-foreground">
                        {t('recurrence.toggleHint')}
                      </div>
                    </div>
                    <Toggle
                      checked={recurring}
                      onChange={setRecurring}
                      label={t('recurrence.toggleLabel')}
                    />
                  </div>
                  {recurring && (
                    <div className="flex flex-col gap-3 bg-card p-3.5">
                      <div className="flex flex-col gap-[5px]">
                        <span className="text-xs font-semibold text-foreground">
                          {t('recurrence.daysLabel')}
                        </span>
                        <div
                          className="flex gap-1.5"
                          role="group"
                          aria-label={t('recurrence.daysLabel')}
                        >
                          {RECURRENCE_DAYS.map((value) => {
                            const on = days.includes(value);
                            return (
                              <button
                                key={value}
                                type="button"
                                aria-pressed={on}
                                aria-label={t(`recurrence.dayPlural.${value}`)}
                                onClick={() =>
                                  setDays((prev) =>
                                    on ? prev.filter((v) => v !== value) : [...prev, value].sort(),
                                  )
                                }
                                className={cn(
                                  'flex h-[34px] w-[34px] items-center justify-center rounded-full border-[1.5px] text-2xs font-semibold transition-colors',
                                  on
                                    ? 'border-primary bg-secondary text-primary'
                                    : 'border-border bg-input text-muted-foreground hover:border-muted-foreground/40',
                                )}
                              >
                                {t(`recurrence.dayShort.${value}`)}
                              </button>
                            );
                          })}
                        </div>
                        <span className="text-2xs text-muted-foreground">
                          {t('recurrence.hint')}
                        </span>
                      </div>
                      <div data-field-error={fieldErrors.until ? 'true' : undefined}>
                        <DateField
                          label={
                            <>
                              {t('recurrence.untilLabel')}
                              <span className="ml-0.5 text-destructive-foreground">*</span>
                            </>
                          }
                          id="tt-until"
                          value={until}
                          onChange={setUntil}
                          compact
                          required
                          minDate={date}
                          icon={<CalendarX size={14} className="shrink-0 text-muted-foreground" />}
                          {...(academicYear && until === academicYear.endDate
                            ? {
                                hint: t('recurrence.untilHint', { label: academicYear.label }),
                              }
                            : {})}
                        />
                        {fieldErrors.until && (
                          <span
                            role="alert"
                            className="mt-1 block text-2xs text-destructive-foreground"
                          >
                            {fieldErrors.until}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-[7px] rounded-md bg-muted px-3 py-2">
                        <Repeat size={13} className="shrink-0 text-muted-foreground" aria-hidden />
                        <span className="text-xs text-muted-foreground">
                          {t.rich(until ? 'recurrence.summaryUntil' : 'recurrence.summary', {
                            days: daysLabel,
                            start: minutesToHHMM(startMinutes),
                            end: minutesToHHMM(endMinutes),
                            until: until ? formatLong(until, locale).replace(/^\S+ /, '') : '',
                            occurrences: occurrenceLabel,
                            b: (chunks) => (
                              <strong className="font-semibold text-foreground">{chunks}</strong>
                            ),
                          })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              editing &&
              editing.seriesCount > 1 && (
                <>
                  <SectionLabel className="mt-1">{t('sections.series')}</SectionLabel>
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-3.5 py-2.5">
                    <div>
                      <div className="text-caption font-semibold text-foreground">
                        {t('series.toggleLabel')}
                      </div>
                      <div className="mt-px text-2xs text-muted-foreground">
                        {t('series.hint', { count: editing.seriesCount })}
                      </div>
                    </div>
                    <Toggle
                      checked={applyToSeries}
                      onChange={setApplyToSeries}
                      label={t('series.toggleLabel')}
                    />
                  </div>
                </>
              )
            )}
          </>
        )}
        {stepIndex === 2 && (
          <>
            {/* ── Options ───────────────────────────────────────────── */}
            <SectionLabel className="mt-1">{t('sections.options')}</SectionLabel>
            <FormGroup label={t('fields.description')} optional htmlFor="tt-description">
              <TextArea
                id="tt-description"
                className="min-h-14"
                placeholder={t('fields.descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FormGroup>
            <FormGroup
              label={t('fields.meetingUrl')}
              optional
              htmlFor="tt-meeting"
              error={fieldErrors.meetingUrl}
            >
              <div className="flex items-center gap-2 rounded-md border border-border bg-input px-2.5 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/10">
                <Video size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                <input
                  id="tt-meeting"
                  type="url"
                  inputMode="url"
                  placeholder="https://meet.google.com/..."
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent py-2 text-caption text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
            </FormGroup>
          </>
        )}
        {(error || conflicts.length > 0) && (
          <div
            role="alert"
            className="flex gap-2.5 rounded-md border border-destructive-foreground/20 bg-destructive px-3 py-2.5"
          >
            <AlertTriangle size={15} className="mt-px shrink-0 text-destructive-foreground" />
            <div className="min-w-0 text-xs text-destructive-foreground">
              <div className="font-semibold">
                {conflicts.length > 0 ? t('conflict.title') : t('conflict.saveFailedTitle')}
              </div>
              {conflicts.length > 0 ? (
                <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4">
                  {conflicts.map((c, i) => (
                    <li key={i}>{c.message}</li>
                  ))}
                </ul>
              ) : (
                <div className="mt-0.5">{error}</div>
              )}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

// ─── Local atoms (Banani `.section-divider`, `.form-select`, toggle) ───────

function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)} aria-hidden>
      <span className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-bold tracking-[0.8px] whitespace-nowrap text-muted-foreground uppercase">
        {children}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

const CONTROL =
  'flex h-9 w-full items-center gap-[7px] rounded-md border border-border bg-input px-2.5 text-left text-caption text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 data-[state=open]:border-primary disabled:cursor-not-allowed disabled:opacity-70';

function IconSelect({
  id,
  icon,
  value,
  onValueChange,
  placeholder,
  disabled,
  children,
}: {
  id?: string | undefined;
  icon: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const EMPTY = '__empty__';
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(v) => onValueChange(v === EMPTY ? '' : v)}
      {...(disabled !== undefined ? { disabled } : {})}
    >
      <SelectPrimitive.Trigger
        id={id}
        className={cn(CONTROL, '[&>span]:truncate', value === '' && 'text-muted-foreground')}
      >
        {icon && <span className="flex shrink-0 items-center">{icon}</span>}
        <span className="flex-1">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-[60] max-h-72 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-card p-1 text-foreground shadow-lg"
        >
          <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function TimeSelect({
  id,
  value,
  onValueChange,
  options,
}: {
  id?: string;
  value: number;
  onValueChange: (minutes: number) => void;
  options: number[];
}) {
  return (
    <IconSelect
      id={id}
      value={String(value)}
      onValueChange={(v) => onValueChange(Number(v))}
      icon={<Clock size={14} className="text-muted-foreground" />}
    >
      {options.map((m) => (
        <SelectItem key={m} value={String(m)}>
          {minutesToHHMM(m)}
        </SelectItem>
      ))}
    </IconSelect>
  );
}

/** Banani `.toggle-switch` 36×20 / thumb 14 (same as ToggleRow's). */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none',
        checked ? 'bg-primary' : 'bg-border',
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] h-3.5 w-3.5 rounded-full bg-white transition-[left]',
          checked ? 'left-[19px]' : 'left-[3px]',
        )}
      />
    </button>
  );
}
