'use client';

// "Informations générales" — the two-column body of the Add Matière screen
// (add-matiere.md), also the first tab of the subject detail page. Pure
// presentation over `useSubjectForm`; the page owns the header/footer
// buttons.
import {
  ArrowRight,
  BookOpen,
  Check,
  Lightbulb,
  Palette,
  School,
  Settings2,
  SlidersHorizontal,
  ToggleRight,
  UserCheck,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
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
  const preview = getSubjectVisual(v.name || 'Matière', { icon: v.icon, color: v.color });
  const previewMeta = [
    v.code || null,
    v.domain === OTHER_DOMAIN ? v.domainOther || null : v.domain || null,
    v.defaultCoefficient ? `Coeff. ${v.defaultCoefficient}` : null,
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
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_300px]">
      {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-3.5">
        {serverError && (
          <p
            role="alert"
            className="rounded-md bg-destructive px-3 py-2 text-caption text-destructive-foreground"
          >
            {serverError}
          </p>
        )}

        <FormCard
          id="card-identity"
          icon={<BookOpen size={15} />}
          title="Identité de la matière"
          subtitle="Informations de base permettant d'identifier la matière dans l'application."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormGroup
              label="Nom de la matière"
              required
              htmlFor="subject-name"
              hint="Ex : Mathématiques, Français, Physique-Chimie"
              error={errors.name}
            >
              <TextInput
                id="subject-name"
                value={v.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="Mathématiques"
                autoFocus={mode === 'create'}
              />
            </FormGroup>
            <FormGroup
              label="Code matière"
              required
              htmlFor="subject-code"
              hint="Code court unique (généré automatiquement)"
              error={errors.code}
            >
              <TextInput
                id="subject-code"
                value={v.code}
                onChange={(e) => setField('code', e.target.value.toUpperCase())}
                placeholder="MAT-001"
              />
            </FormGroup>
            <FormGroup
              label="Abréviation"
              optional
              htmlFor="subject-abbr"
              hint="Utilisée dans les tableaux et bulletins"
            >
              <TextInput
                id="subject-abbr"
                value={v.abbreviation}
                onChange={(e) => setField('abbreviation', e.target.value.toUpperCase())}
                placeholder="MATH"
                maxLength={12}
              />
            </FormGroup>
            <FormGroup
              label="Département / Filière"
              required
              error={errors.domain ?? errors.domainOther}
            >
              <BareSelect
                value={v.domain}
                onValueChange={(val) => setField('domain', val)}
                placeholder="Sciences"
              >
                {domainOptions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER_DOMAIN}>Autre…</SelectItem>
              </BareSelect>
              {v.domain === OTHER_DOMAIN && (
                <TextInput
                  aria-label="Autre département"
                  value={v.domainOther}
                  onChange={(e) => setField('domainOther', e.target.value)}
                  placeholder="Nom du département"
                  className="mt-1"
                />
              )}
            </FormGroup>
            <FormGroup label="Niveau / Année d'étude" required error={errors.level}>
              <BareSelect
                value={v.level}
                onValueChange={(val) => setField('level', val)}
                placeholder="3ème / 4ème"
              >
                <SelectItem value={ALL_LEVELS}>{ALL_LEVELS}</SelectItem>
                {options.levels.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </BareSelect>
            </FormGroup>
            <FormGroup
              label="Statut"
              required
              hint="Obligatoire, Optionnelle (élective) ou Facultative"
            >
              <BareSelect
                value={v.kind}
                onValueChange={(val) => setField('kind', val as typeof v.kind)}
              >
                {SUBJECT_KIND_OPTIONS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </BareSelect>
            </FormGroup>
            <FormGroup
              label="Description / Syllabi"
              optional
              htmlFor="subject-description"
              className="md:col-span-2"
            >
              <TextArea
                id="subject-description"
                value={v.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Brève description du programme d'enseignement, objectifs pédagogiques généraux..."
              />
            </FormGroup>
          </div>
        </FormCard>

        <FormCard
          id="card-structure"
          icon={<SlidersHorizontal size={15} />}
          title="Structure pédagogique et pondération"
          subtitle="Coefficient, volume horaire et règles d'évaluation pour cette matière."
        >
          <div className="mb-3.5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <FormGroup
              label="Coefficient"
              required
              htmlFor="subject-coeff"
              hint="Poids dans la moyenne générale"
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
                placeholder="4"
              />
            </FormGroup>
            <FormGroup
              label="Note maximale"
              htmlFor="subject-max"
              hint="Barème par défaut"
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
                placeholder="20"
              />
            </FormGroup>
            <FormGroup
              label="Note de passage"
              htmlFor="subject-pass"
              hint="Seuil de validation"
              error={errors.passingScore}
            >
              <TextInput
                id="subject-pass"
                type="number"
                inputMode="numeric"
                min={0}
                value={v.passingScore}
                onChange={(e) => setField('passingScore', e.target.value)}
                placeholder="10"
              />
            </FormGroup>
          </div>
          <div className="mb-3.5 grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <FormGroup
              label="Volume horaire total"
              labelHint="(h)"
              htmlFor="subject-hours"
              hint="Nombre d'heures total annuel"
            >
              <TextInput
                id="subject-hours"
                type="number"
                inputMode="numeric"
                min={0}
                value={v.totalHours}
                onChange={(e) => setField('totalHours', e.target.value)}
                placeholder="78"
              />
            </FormGroup>
            <FormGroup label="Dont CM / TD / TP" hint="Cours magistral · TD · TP">
              <div className="flex gap-1.5">
                <TextInput
                  aria-label="Heures de cours magistral"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={v.hoursCM}
                  onChange={(e) => setField('hoursCM', e.target.value)}
                  placeholder="42"
                  className="flex-1"
                />
                <TextInput
                  aria-label="Heures de TD"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={v.hoursTD}
                  onChange={(e) => setField('hoursTD', e.target.value)}
                  placeholder="24"
                  className="flex-1"
                />
                <TextInput
                  aria-label="Heures de TP"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={v.hoursTP}
                  onChange={(e) => setField('hoursTP', e.target.value)}
                  placeholder="12"
                  className="flex-1"
                />
              </div>
            </FormGroup>
          </div>
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <FormGroup
              label="Type d'évaluation"
              required
              hint="Examen final, contrôle continu, projet, hybride"
              error={errors.evaluationType}
            >
              <BareSelect
                value={v.evaluationType}
                onValueChange={(val) => setField('evaluationType', val)}
                placeholder="Contrôle continu + Examen final"
              >
                {EVALUATION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </BareSelect>
            </FormGroup>
            <FormGroup
              label="Capacité max. d'élèves"
              optional
              htmlFor="subject-capacity"
              hint="Limite de places (cours d'option)"
            >
              <TextInput
                id="subject-capacity"
                type="number"
                inputMode="numeric"
                min={1}
                value={v.maxCapacity}
                onChange={(e) => setField('maxCapacity', e.target.value)}
                placeholder="Ex : 35"
              />
            </FormGroup>
          </div>
          <SectionDivider />
          <ToggleRow
            title="Inclure dans la moyenne générale"
            description="Cette matière sera prise en compte dans le calcul de la moyenne"
            checked={v.includeInAverage}
            onChange={(c) => setField('includeInAverage', c)}
          />
          <ToggleRow
            title="Afficher dans le bulletin"
            description="La note et l'appréciation apparaîtront sur le bulletin scolaire"
            checked={v.showOnBulletin}
            onChange={(c) => setField('showOnBulletin', c)}
          />
        </FormCard>

        <FormCard
          id="card-assignation"
          icon={<UserCheck size={15} />}
          title="Assignation et logistique"
          subtitle="Enseignant responsable, salle et prérequis pédagogiques."
        >
          <div className="mb-3.5 grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <FormGroup
              label="Enseignant responsable"
              hint="L'enseignant doit être créé dans la liste des enseignants"
            >
              <BareSelect
                value={v.responsibleTeacherId ?? ''}
                onValueChange={(val) => setField('responsibleTeacherId', val || null)}
                placeholder="Sélectionner un enseignant"
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
              label="Salle / Type de local requis"
              optional
              hint="Ex : Amphithéâtre, Laboratoire, Salle informatique"
            >
              <BareSelect
                value={v.room}
                onValueChange={(val) => setField('room', val)}
                placeholder="Salle de cours standard"
              >
                <SelectItem value="">— Non précisé —</SelectItem>
                {ROOM_TYPES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </BareSelect>
            </FormGroup>
          </div>
          <FormGroup
            label="Prérequis"
            optional
            hint="Matières devant être validées au préalable (ex. avoir validé MAT-001 pour MATH202)"
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
          title="Options avancées et paramètres"
          subtitle="Paramètres spécifiques liés à l'année académique et aux seuils d'évaluation."
        >
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <FormGroup
              label="Année académique / Semestre"
              hint="Rattachement à la période en cours"
            >
              <BareSelect value="current" onValueChange={() => undefined} disabled>
                <SelectItem value="current">
                  {options.yearLabel
                    ? `Année complète ${options.yearLabel}`
                    : 'Aucune année scolaire active'}
                </SelectItem>
              </BareSelect>
            </FormGroup>
            <FormGroup
              label="Note éliminatoire"
              optional
              htmlFor="subject-elim"
              hint="En dessous de ce seuil, la matière est éliminatoire"
              error={errors.eliminatoryScore}
            >
              <TextInput
                id="subject-elim"
                type="number"
                inputMode="numeric"
                min={0}
                value={v.eliminatoryScore}
                onChange={(e) => setField('eliminatoryScore', e.target.value)}
                placeholder={`Ex : 6 / ${v.maxScore || 20}`}
              />
            </FormGroup>
          </div>
        </FormCard>

        {/* Hint banner */}
        <div className="flex flex-col gap-3 rounded-lg bg-warning px-[18px] py-3.5 sm:flex-row sm:items-center">
          <Lightbulb size={18} className="hidden shrink-0 text-warning-foreground sm:block" />
          <div className="min-w-0 flex-1">
            <div className="text-caption font-semibold text-warning-foreground">
              Continuez avec l&apos;onglet &quot;Programme annuel&quot;
            </div>
            <div className="text-xs text-warning-foreground/90">
              Définissez les chapitres et objectifs par trimestre, ainsi que les compétences
              évaluées dans les onglets suivants.
            </div>
          </div>
          <button
            type="button"
            onClick={onGoToProgramme}
            disabled={mode === 'create'}
            title={mode === 'create' ? 'Enregistre la matière pour continuer' : undefined}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-warning-foreground bg-card px-3.5 py-[7px] text-caption font-medium text-warning-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Aller au programme
            <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {/* ── RIGHT COLUMN ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-3.5">
        <FormCard
          id="card-apparence"
          icon={<Palette size={15} />}
          title="Apparence"
          subtitle="Couleur et icône affichées dans l'interface."
        >
          <div className="mb-3.5 flex flex-col gap-[7px]">
            <span className="text-xs font-semibold text-foreground">Icône</span>
            <div className="grid grid-cols-8 gap-[5px]" role="radiogroup" aria-label="Icône">
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
                      'flex h-9 w-9 items-center justify-center rounded-md border-2',
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
            <span className="text-xs font-semibold text-foreground">Couleur d&apos;accent</span>
            <div
              className="flex flex-wrap gap-[7px]"
              role="radiogroup"
              aria-label="Couleur d'accent"
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
          <div className="mb-2 text-xs font-semibold text-foreground">Aperçu</div>
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
                {v.name || 'Nom de la matière'}
              </div>
              <div className="truncate text-2xs text-muted-foreground">{previewMeta || '—'}</div>
            </div>
            <SubjectStatusBadge status={v.status} className="ml-auto" />
          </div>
        </FormCard>

        <FormCard id="card-status" icon={<ToggleRight size={15} />} title="Statut de publication">
          <div
            role="radiogroup"
            aria-label="Statut de publication"
            className="flex flex-col gap-1.5"
          >
            {SUBJECT_STATUS_OPTIONS.map((opt) => {
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
                      {opt.label}
                    </span>
                    <span className="block text-2xs text-muted-foreground">{opt.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </FormCard>

        <FormCard
          id="card-classes"
          icon={<School size={15} />}
          title="Classes concernées"
          subtitle="Sélection rapide — détails dans l'onglet Affectations."
        >
          {options.classes.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aucune classe dans l&apos;année scolaire active.
            </p>
          ) : (
            <div className="flex flex-col gap-[5px]" role="group" aria-label="Classes concernées">
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
                      {c.studentCount} élève{c.studentCount > 1 ? 's' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </FormCard>
      </div>
    </div>
  );
}
