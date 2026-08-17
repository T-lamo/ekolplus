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
  ArrowRightCircle,
  BookOpen,
  CheckCircle2,
  Info,
  NotebookPen,
  Palette,
  Plus,
  School,
  Search,
  UserCheck,
  Check,
  Lock,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { ASIDE_GRID } from '@/lib/layout';
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
  OTHER_LEVEL,
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
  const { values: v, setField, errors, serverError, mode } = form;
  const [subjectFilter, setSubjectFilter] = useState('');

  const selectedTeacher = useMemo(
    () => options.teachers.find((t) => t.id === v.homeroomTeacherId) ?? null,
    [options.teachers, v.homeroomTeacherId],
  );
  const filteredSubjects = useMemo(() => {
    const q = subjectFilter.trim().toLowerCase();
    return q ? options.subjects.filter((s) => s.name.toLowerCase().includes(q)) : options.subjects;
  }, [options.subjects, subjectFilter]);
  const selectedCount = v.subjectIds.length;
  const done = classSectionsDone(form);
  const color = v.color ?? 'var(--color-primary)';
  const levelLabel = effectiveLevel(v);
  const previewSub = [v.room.trim() || null, levelLabel || null].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info size={13} className="shrink-0" />
        Les champs marqués <span className="font-semibold text-destructive-foreground">*</span> sont
        obligatoires
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
            title="Informations générales"
            subtitle="Identité et localisation de la classe."
          >
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <FormGroup
                label="Nom de la classe"
                required
                hint="Ex : 3ème A, NS1, Philo Sciences…"
                error={errors.name}
                htmlFor="class-name"
              >
                <TextInput
                  id="class-name"
                  value={v.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="3ème A"
                  maxLength={40}
                  autoFocus={mode === 'create'}
                />
              </FormGroup>
              <FormGroup
                label="Niveau scolaire"
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
                      placeholder="Sélectionner un niveau"
                    >
                      {options.levelCatalog.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                      <SelectItem value={OTHER_LEVEL}>Autre…</SelectItem>
                    </BareSelect>
                    {v.level === OTHER_LEVEL && (
                      <TextInput
                        value={v.levelOther}
                        onChange={(e) => setField('levelOther', e.target.value)}
                        placeholder="Saisir le niveau"
                        maxLength={40}
                        aria-label="Niveau (autre)"
                      />
                    )}
                  </div>
                ) : (
                  <>
                    <TextInput
                      id="class-level"
                      value={v.level}
                      onChange={(e) => setField('level', e.target.value)}
                      placeholder="3ème"
                      maxLength={40}
                    />
                    <span className="text-2xs text-muted-foreground">
                      Aucun catalogue de niveaux —{' '}
                      <Link
                        href="/configuration/niveaux"
                        className="font-medium text-primary hover:underline"
                      >
                        définir les niveaux de l&apos;école
                      </Link>
                    </span>
                  </>
                )}
              </FormGroup>
              <FormGroup label="Salle de cours" optional htmlFor="class-room">
                <TextInput
                  id="class-room"
                  value={v.room}
                  onChange={(e) => setField('room', e.target.value)}
                  placeholder="Salle 12 — Bât. B"
                  maxLength={40}
                />
              </FormGroup>
              <FormGroup
                label="Capacité maximale"
                required
                hint="Nombre maximum de places disponibles"
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
                  placeholder="32"
                />
              </FormGroup>
              <FormGroup label="Filière / Série" optional htmlFor="class-track">
                <TextInput
                  id="class-track"
                  value={v.track}
                  onChange={(e) => setField('track', e.target.value)}
                  placeholder="Sciences, Lettres, NS…"
                  maxLength={60}
                />
              </FormGroup>
              <FormGroup
                label="Année scolaire"
                required
                hint="Année active — modifiable dans Paramètres › Année scolaire"
                htmlFor="class-year"
              >
                <TextInput
                  id="class-year"
                  value={options.yearLabel ?? 'Aucune année active'}
                  readOnly
                  disabled
                />
              </FormGroup>
            </div>
          </FormCard>

          <FormCard
            id={CLASS_SECTION_IDS.prof}
            icon={<UserCheck size={15} />}
            title="Professeur principal"
            subtitle="Responsable pédagogique de la classe."
          >
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <FormGroup
                label="Professeur principal"
                optional
                hint="Ce professeur recevra les bulletins et rapports de la classe"
                htmlFor="class-teacher"
              >
                <BareSelect
                  id="class-teacher"
                  value={v.homeroomTeacherId ?? ''}
                  onValueChange={(val) => setField('homeroomTeacherId', val || null)}
                  placeholder="Rechercher un enseignant…"
                >
                  <SelectItem value="">— Aucun —</SelectItem>
                  {options.teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <Avatar name={t.name} src={t.photoUrl} size={22} />
                        {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </BareSelect>
              </FormGroup>
              <FormGroup
                label="Matières enseignées"
                labelHint="d'après ses affectations"
                {...(selectedTeacher
                  ? {}
                  : { hint: 'Choisissez un enseignant pour voir ses matières' })}
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
            title="Matières de la classe"
            subtitle="Sélectionner les matières enseignées dans cette classe."
          >
            <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs whitespace-nowrap text-muted-foreground">
                {selectedCount} matière{selectedCount > 1 ? 's' : ''} sélectionnée
                {selectedCount > 1 ? 's' : ''} sur {options.subjects.length} disponible
                {options.subjects.length > 1 ? 's' : ''}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="flex min-w-[150px] items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5">
                  <Search size={12} className="shrink-0 text-muted-foreground" />
                  <input
                    value={subjectFilter}
                    onChange={(e) => setSubjectFilter(e.target.value)}
                    placeholder="Filtrer…"
                    aria-label="Filtrer les matières"
                    className="w-full min-w-0 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </label>
                {mode === 'create' && options.subjects.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        options.subjects.forEach((s) => void form.toggleSubject(s.id, true))
                      }
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                    >
                      Tout sélectionner
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        options.subjects.forEach((s) => void form.toggleSubject(s.id, false))
                      }
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                    >
                      Tout désélectionner
                    </button>
                  </>
                )}
              </div>
            </div>
            {form.subjectError && (
              <p role="alert" className="mb-2 text-xs text-destructive-foreground">
                {form.subjectError}
              </p>
            )}
            {options.subjects.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
                Aucune matière active — crée d&apos;abord les matières de l&apos;école.
              </div>
            ) : filteredSubjects.length === 0 ? (
              <div className="rounded-md bg-background px-3 py-2.5 text-xs text-muted-foreground italic">
                Aucune matière ne correspond au filtre.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {filteredSubjects.map((s) => {
                  const checked = v.subjectIds.includes(s.id);
                  const locked = checked && form.lockedSubjectIds.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className={cn(
                        // `relative` contains the sr-only checkbox (absolute) — otherwise
                        // its static position below the fold stretches the document.
                        'relative flex cursor-pointer items-center gap-2.5 rounded-md bg-background px-3 py-[9px]',
                        !checked && 'opacity-70 hover:opacity-100',
                        locked && 'cursor-not-allowed',
                      )}
                      title={
                        locked ? 'Des notes existent — retirer depuis Affectations' : undefined
                      }
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        disabled={locked}
                        onChange={(e) => void form.toggleSubject(s.id, e.target.checked)}
                      />
                      <span
                        aria-hidden
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px]',
                          checked
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-input',
                        )}
                      >
                        {checked && <Check size={10} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-caption font-medium text-foreground">
                        {s.name}
                      </span>
                      {locked && <Lock size={12} className="shrink-0 text-muted-foreground" />}
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
                        Coeff. {s.defaultCoefficient ?? '—'}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <Link
              href="/configuration/matieres/nouvelle"
              className="mt-2.5 inline-flex items-center gap-1.5 py-1 text-caption font-medium text-primary hover:underline"
            >
              <Plus size={13} />
              Créer une nouvelle matière
            </Link>
          </FormCard>

          <FormCard
            id={CLASS_SECTION_IDS.notes}
            icon={<NotebookPen size={15} />}
            title="Configuration des notes"
            subtitle="Paramètres d'évaluation hérités de l'établissement — identiques pour toutes les classes."
          >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <ReadonlyStat
                label="Barème"
                value={options.grading.scale ?? 'Sur 20'}
                href="/settings?tab=annee"
              />
              <ReadonlyStat
                label="Périodes"
                value={
                  options.grading.termCount > 0
                    ? `${options.grading.termCount} ${options.grading.termType ?? 'période'}${
                        options.grading.termCount > 1 ? 's' : ''
                      }`
                    : 'Aucune période'
                }
                href="/settings?tab=annee"
              />
              <ReadonlyStat label="Mode de calcul" value="Moyenne pondérée par coeff." />
              <ReadonlyStat
                label="Note de passage"
                value="Définie par matière"
                href="/configuration/matieres"
              />
              <ReadonlyStat
                label="Modèle de bulletin"
                value={options.grading.bulletinTemplate ?? 'Aucun modèle actif'}
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
            title="Apparence"
            subtitle="Couleur affichée sur les cartes et badges de la classe."
          >
            <div className="flex flex-col gap-[7px]">
              <span className="text-xs font-semibold text-foreground">
                Couleur d&apos;identification
              </span>
              <div
                className="flex flex-wrap gap-[7px]"
                role="radiogroup"
                aria-label="Couleur d'identification"
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
            <div className="mb-2 text-xs font-semibold text-foreground">Aperçu de la carte</div>
            <div className="overflow-hidden rounded-md bg-background">
              <div className="h-[3px]" style={{ background: color }} />
              <div className="px-3 py-2.5">
                <div className="truncate text-lg leading-tight font-bold text-foreground">
                  {v.name.trim() || 'Nom de la classe'}
                </div>
                <div className="mt-0.5 truncate text-2xs text-muted-foreground">
                  {previewSub || 'Salle · niveau'}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <PreviewStat label="Élèves" value={options.studentCount} />
                  <PreviewStat label="Matières" value={selectedCount} />
                </div>
              </div>
            </div>
          </FormCard>

          <FormCard id="card-recap" icon={<Info size={15} />} title="Récapitulatif">
            <InfoRow label="Nom" value={v.name.trim() || '—'} />
            <InfoRow label="Niveau" value={levelLabel || '—'} />
            <InfoRow label="Salle" value={v.room.trim() || '—'} />
            <InfoRow
              label="Capacité"
              value={v.capacity.trim() ? `${v.capacity.trim()} places` : '—'}
            />
            <InfoRow
              label="Matières"
              value={
                <span className="text-primary">
                  {selectedCount} sélectionnée{selectedCount > 1 ? 's' : ''}
                </span>
              }
            />
            <InfoRow
              label="Prof. principal"
              value={
                selectedTeacher ? (
                  selectedTeacher.name
                ) : (
                  <span className="text-muted-foreground">Non assigné</span>
                )
              }
            />
            <InfoRow label="Année scolaire" value={options.yearLabel ?? '—'} />
          </FormCard>

          <FormCard
            id="card-checklist"
            icon={<CheckCircle2 size={15} className="text-success-foreground" />}
            title="Checklist"
          >
            <ul className="flex flex-col gap-[7px]">
              <ChecklistItem done={done.checklist.nameOk!}>
                Nom de la classe renseigné
              </ChecklistItem>
              <ChecklistItem done={done.checklist.levelOk!}>
                Niveau scolaire sélectionné
              </ChecklistItem>
              <ChecklistItem done={done.checklist.capacityOk!}>Capacité définie</ChecklistItem>
              <ChecklistItem done={done.checklist.subjectsOk!}>
                Matières assignées{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </ChecklistItem>
              <ChecklistItem done={done.checklist.profOk!}>
                Professeur principal assigné
              </ChecklistItem>
            </ul>
            {!done.checklist.profOk && (
              <div className="mt-2.5 flex items-start gap-1.5 rounded-md bg-warning px-2.5 py-2">
                <AlertCircle size={13} className="mt-px shrink-0 text-warning-foreground" />
                <span className="text-2xs text-warning-foreground">
                  Le professeur principal est recommandé mais optionnel à la création.
                </span>
              </div>
            )}
          </FormCard>

          <FormCard
            id="card-next"
            icon={<ArrowRightCircle size={15} />}
            title={mode === 'create' ? 'Après création' : 'Navigation rapide'}
          >
            <ol className="flex flex-col gap-2.5">
              <NextStep n={1} href="/eleves" title="Inscrire les élèves">
                Ajouter ou importer les élèves
              </NextStep>
              <NextStep n={2} href="/configuration/affectations" title="Affecter les enseignants">
                Associer un enseignant par matière
              </NextStep>
              <NextStep n={3} href="/scolarite/configuration" title="Configurer la scolarité">
                Définir les frais et tranches
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
  return (
    <div className={cn('rounded-md bg-background px-3 py-2', className)}>
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className="mt-px flex items-center justify-between gap-2">
        <span className="truncate text-caption font-semibold text-foreground">{value}</span>
        {href && (
          <Link href={href} className="shrink-0 text-2xs font-medium text-primary hover:underline">
            Gérer
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
