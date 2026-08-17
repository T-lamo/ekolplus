'use client';

// « Affectations classes » tab of the subject detail page
// (affectations-classes.md): the ClassSubject pivot filtered on one subject,
// edited in place — teacher select / coefficient / weekly hours upsert
// through POST /api/school/class-subjects, rows detach through DELETE
// /api/school/class-subjects/[id]. KPIs, the "sans enseignant" banner, the
// teacher availability list and the right column all derive from the same
// detail payload, so a single refetch keeps every block consistent.
import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  Check,
  ChevronDown,
  CircleAlert,
  Download,
  Info,
  Layers,
  Link as LinkIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { exportToCsv } from '@/lib/csv-export';
import { getSubjectVisual } from '@/lib/subject-visuals';
import { cn } from '@/lib/utils';
import type {
  SubjectClassAssignment,
  SubjectDetail,
} from '@/app/(school)/configuration/matieres/types';
import { BareSelect, SelectItem } from './form-primitives';
import { SubjectPageFooter, SubjectStatusBadge } from './SubjectPageShell';
import type { SubjectTab } from './SubjectTabsBar';

export interface TeacherOptionRow {
  id: string;
  name: string;
  photoUrl: string | null;
}

const fmtHours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;

export function AffectationsTab({
  subject,
  teachers,
  onChanged,
  onNavigateTab,
}: {
  subject: SubjectDetail;
  teachers: TeacherOptionRow[];
  /** Called after any successful write — the page refetches the detail. */
  onChanged: () => Promise<void>;
  onNavigateTab: (tab: SubjectTab) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [filter, setFilter] = useState('');
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);

  const rows = subject.classSubjects;
  const filtered = useMemo(
    () => rows.filter((r) => r.class.name.toLowerCase().includes(filter.trim().toLowerCase())),
    [rows, filter],
  );
  const withTeacher = rows.filter((r) => r.teacherId).length;
  const without = rows.filter((r) => !r.teacherId);
  const students = rows.reduce((s, r) => s + r.class.studentCount, 0);
  const weeklyTotal = rows.reduce((s, r) => s + (r.weeklyHours ?? 0), 0);
  const coverage = rows.length === 0 ? 0 : Math.round((withTeacher / rows.length) * 100);
  const visual = getSubjectVisual(subject.name, { icon: subject.icon, color: subject.color });

  async function upsert(
    classId: string,
    patch: { teacherId?: string | null; coefficient?: number | null; weeklyHours?: number | null },
    rowKey = classId,
  ) {
    setBusyRow(rowKey);
    try {
      await api('/api/school/class-subjects', {
        method: 'POST',
        body: { classId, subjectId: subject.id, ...patch },
      });
      await onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    } finally {
      setBusyRow(null);
    }
  }

  async function attach(classId: string) {
    await upsert(classId, { coefficient: subject.defaultCoefficient ?? null });
    toast('Classe affectée.', 'success');
  }

  async function detach(row: SubjectClassAssignment) {
    if (!window.confirm(`Retirer « ${subject.name} » de la classe ${row.class.name} ?`)) return;
    setBusyRow(row.classId);
    try {
      await api(`/api/school/class-subjects/${row.id}`, { method: 'DELETE' });
      await onChanged();
      toast('Affectation retirée.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    } finally {
      setBusyRow(null);
    }
  }

  function focusFirstMissing() {
    const first = without[0];
    if (!first) return;
    setSelectedRow(first.classId);
    document.querySelector<HTMLElement>(`[data-teacher-select="${first.classId}"]`)?.focus();
    document
      .getElementById('affectations-table-card')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function exportCsv() {
    exportToCsv(
      `affectations-${subject.code ?? subject.name}.csv`,
      ['Classe', 'Niveau', 'Enseignant', 'Coefficient', 'Élèves', 'Heures/sem.', 'Statut'],
      rows.map((r) => [
        r.class.name,
        r.class.level,
        r.teacher?.name ?? '',
        r.coefficient ?? '',
        r.class.studentCount,
        r.weeklyHours ?? '',
        r.teacherId ? 'Active' : 'Sans prof.',
      ]),
    );
  }

  const footer = (
    <SubjectPageFooter
      left={
        <>
          <LinkIcon size={14} />
          <span className="truncate">
            {plural(rows.length, 'classe affectée', 'classes affectées')} ·{' '}
            {plural(students, 'élève')} · {plural(subject.teachers.length, 'enseignant')} ·{' '}
            {plural(without.length, 'classe sans enseignant', 'classes sans enseignant')}
          </span>
        </>
      }
      right={
        <>
          <Button
            variant="ghost"
            size="sm"
            className="w-auto text-caption"
            onClick={() => void onChanged()}
          >
            Annuler les modifications
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-auto text-caption"
            onClick={exportCsv}
            disabled={rows.length === 0}
          >
            <Download size={13} />
            Exporter
          </Button>
          <Button
            size="sm"
            className="w-auto text-caption"
            onClick={() => toast('Affectations enregistrées.', 'success')}
          >
            <Check size={14} />
            Enregistrer les affectations
          </Button>
        </>
      }
    />
  );

  const addClassButton = (label: string, compact = false) => (
    <AddClassPopover
      classes={subject.unassignedClasses}
      onPick={(id) => void attach(id)}
      label={label}
      compact={compact}
    />
  );

  return (
    <>
      <div className="pb-5">
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_260px] lg:gap-[18px]">
          {/* ── LEFT ─────────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-col gap-[18px]">
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi value={rows.length} label="Classes affectées" tone="text-primary" />
              <Kpi value={subject.teachers.length} label="Enseignants assignés" />
              <Kpi value={students} label="Élèves concernés" tone="text-success-foreground" />
              <Kpi value={without.length} label="Sans enseignant" tone="text-warning-foreground" />
            </div>

            {/* Table card */}
            <section
              id="affectations-table-card"
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-[18px]">
                <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <LinkIcon size={15} className="text-primary" />
                  Affectations des classes
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex min-w-[180px] flex-1 items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 sm:flex-none">
                    <Search size={13} className="shrink-0 text-muted-foreground" />
                    <input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Filtrer les classes..."
                      aria-label="Filtrer les classes"
                      className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </label>
                  {addClassButton('Ajouter une classe', true)}
                </div>
              </div>

              {rows.length === 0 ? (
                <div className="flex flex-col items-center gap-2.5 px-5 py-10 text-center">
                  <p className="text-caption font-semibold text-foreground">
                    Aucune classe n&apos;a encore cette matière
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ajoute une première classe pour définir l&apos;enseignant, le coefficient et les
                    heures.
                  </p>
                  {addClassButton('Ajouter une classe')}
                </div>
              ) : (
                <>
                  {/* md+: table */}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[820px] border-collapse">
                      <thead>
                        <tr>
                          {[
                            'Classe',
                            'Niveau',
                            'Enseignant assigné',
                            'Coeff.',
                            'Élèves',
                            'Heures/sem.',
                            'Statut',
                          ].map((h) => (
                            <th
                              key={h}
                              className="border-b border-border px-3.5 pt-3 pb-2.5 text-left text-2xs font-semibold tracking-[0.6px] text-muted-foreground uppercase"
                            >
                              {h}
                            </th>
                          ))}
                          <th className="border-b border-border px-3.5 pt-3 pb-2.5 text-right text-2xs font-semibold tracking-[0.6px] text-muted-foreground uppercase">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((row) => (
                          <tr
                            key={row.id}
                            className={cn(selectedRow === row.classId && 'bg-[#f7f5ff]')}
                            onClick={() => setSelectedRow(row.classId)}
                          >
                            <td className="border-b border-border px-3.5 py-3 align-middle whitespace-nowrap">
                              <div className="text-caption font-semibold text-foreground">
                                {row.class.name}
                              </div>
                              <div className="mt-px text-xs text-muted-foreground">
                                {subject.code ?? '—'}
                              </div>
                            </td>
                            <td className="border-b border-border px-3.5 py-3 align-middle">
                              <Badge className="bg-info text-info-foreground">
                                {row.class.level}
                              </Badge>
                            </td>
                            <td className="min-w-[230px] border-b border-border px-3.5 py-3 align-middle">
                              <TeacherCell
                                row={row}
                                teachers={teachers}
                                subjectName={subject.name}
                                busy={busyRow === row.classId}
                                onChange={(id) => void upsert(row.classId, { teacherId: id })}
                              />
                            </td>
                            <td className="border-b border-border px-3.5 py-3 align-middle">
                              <NumberCell
                                value={row.coefficient}
                                min={1}
                                max={10}
                                step={1}
                                ariaLabel={`Coefficient ${row.class.name}`}
                                className="w-12 font-bold text-primary"
                                onCommit={(v) => void upsert(row.classId, { coefficient: v })}
                              />
                            </td>
                            <td className="border-b border-border px-3.5 py-3 align-middle text-caption font-semibold text-foreground">
                              {row.class.studentCount}
                            </td>
                            <td className="border-b border-border px-3.5 py-3 align-middle">
                              <span className="flex items-center gap-1 text-caption text-foreground">
                                <NumberCell
                                  value={row.weeklyHours}
                                  min={0}
                                  max={60}
                                  step={0.5}
                                  ariaLabel={`Heures hebdomadaires ${row.class.name}`}
                                  className="w-14"
                                  onCommit={(v) => void upsert(row.classId, { weeklyHours: v })}
                                />
                                h
                              </span>
                            </td>
                            <td className="border-b border-border px-3.5 py-3 align-middle whitespace-nowrap">
                              {row.teacherId ? (
                                <Badge tone="success">Active</Badge>
                              ) : (
                                <Badge tone="warning">Sans prof.</Badge>
                              )}
                            </td>
                            <td className="border-b border-border px-3.5 py-3 align-middle">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  aria-label="Modifier"
                                  onClick={() =>
                                    document
                                      .querySelector<HTMLElement>(
                                        `[data-teacher-select="${row.classId}"]`,
                                      )
                                      ?.focus()
                                  }
                                  className="flex h-7 w-7 items-center justify-center rounded-sm text-primary hover:bg-secondary"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Retirer"
                                  onClick={() => void detach(row)}
                                  disabled={busyRow === row.classId}
                                  className="flex h-7 w-7 items-center justify-center rounded-sm text-destructive-foreground hover:bg-destructive disabled:opacity-50"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* < md: cards */}
                  <div className="flex flex-col gap-2.5 p-3.5 md:hidden">
                    {filtered.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-md border border-border bg-background p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-caption font-semibold text-foreground">
                              {row.class.name}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Badge className="bg-info text-info-foreground">
                                {row.class.level}
                              </Badge>
                              {plural(row.class.studentCount, 'élève')}
                            </div>
                          </div>
                          {row.teacherId ? (
                            <Badge tone="success">Active</Badge>
                          ) : (
                            <Badge tone="warning">Sans prof.</Badge>
                          )}
                        </div>
                        <div className="mt-2.5">
                          <TeacherCell
                            row={row}
                            teachers={teachers}
                            subjectName={subject.name}
                            busy={busyRow === row.classId}
                            onChange={(id) => void upsert(row.classId, { teacherId: id })}
                          />
                        </div>
                        <div className="mt-2.5 flex items-center justify-between gap-3">
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            Coeff.
                            <NumberCell
                              value={row.coefficient}
                              min={1}
                              max={10}
                              step={1}
                              ariaLabel={`Coefficient ${row.class.name}`}
                              className="w-12 font-bold text-primary"
                              onCommit={(v) => void upsert(row.classId, { coefficient: v })}
                            />
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            Heures/sem.
                            <NumberCell
                              value={row.weeklyHours}
                              min={0}
                              max={60}
                              step={0.5}
                              ariaLabel={`Heures hebdomadaires ${row.class.name}`}
                              className="w-14"
                              onCommit={(v) => void upsert(row.classId, { weeklyHours: v })}
                            />
                          </label>
                          <button
                            type="button"
                            aria-label="Retirer"
                            onClick={() => void detach(row)}
                            className="flex h-8 w-8 items-center justify-center rounded-sm text-destructive-foreground"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-3.5 py-3">
                    <AddClassPopover
                      classes={subject.unassignedClasses}
                      onPick={(id) => void attach(id)}
                      label="Ajouter une classe à cette matière"
                      variant="dashed"
                    />
                  </div>
                </>
              )}
            </section>

            {/* Alert banner */}
            {without.length > 0 && (
              <div className="flex flex-col gap-2.5 rounded-lg border border-[#fcd34d] bg-warning px-4 py-3 sm:flex-row sm:items-center">
                <AlertTriangle
                  size={16}
                  className="hidden shrink-0 text-warning-foreground sm:block"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-caption font-semibold text-warning-foreground">
                    {plural(
                      without.length,
                      'classe sans enseignant assigné',
                      'classes sans enseignant assigné',
                    )}
                  </div>
                  <div className="mt-px text-xs text-[#92400e]">
                    {without.length === 1 ? 'La classe ' : 'Les classes '}
                    <strong>{without.map((r) => r.class.name).join(', ')}</strong>
                    {without.length === 1 ? " n'a pas" : " n'ont pas"} d&apos;enseignant de{' '}
                    {subject.name}. Veuillez assigner un enseignant pour activer{' '}
                    {without.length === 1 ? 'cette affectation' : 'ces affectations'}.
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-auto shrink-0 text-xs"
                  onClick={focusFirstMissing}
                >
                  Résoudre
                </Button>
              </div>
            )}

            {/* Teachers availability */}
            <section className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-[18px]">
                <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <UserCheck size={15} className="text-primary" />
                  Enseignants disponibles pour cette matière
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-auto text-xs"
                  onClick={() => router.push('/enseignants')}
                >
                  <Plus size={13} />
                  Ajouter un enseignant
                </Button>
              </div>
              <div className="flex flex-col gap-2.5 px-4 py-3.5 sm:px-[18px]">
                {subject.teachers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aucun enseignant n&apos;est encore assigné à cette matière.
                  </p>
                ) : (
                  subject.teachers.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3.5 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={t.name} src={t.photoUrl} size={36} />
                        <div className="min-w-0">
                          <div className="truncate text-caption font-semibold text-foreground">
                            {t.name}
                          </div>
                          <div className="truncate text-2xs text-muted-foreground">
                            {subject.name} ·{' '}
                            {plural(t.classCount, 'classe assignée', 'classes assignées')}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {t.status === 'AVAILABLE' ? (
                          <Badge tone="success">Disponible</Badge>
                        ) : (
                          <Badge tone="warning">Chargé</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {fmtHours(t.weeklyHoursTotal)}/sem.
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* ── RIGHT ────────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-col gap-3.5">
            <SideCard icon={<Info size={15} className="text-primary" />} title="Matière">
              <div className="mb-2.5 flex items-center gap-2.5 rounded-md bg-background px-3 py-2.5">
                <div
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md"
                  style={{ background: visual.iconBg, color: visual.iconFg }}
                >
                  <visual.Icon size={18} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-caption font-bold text-foreground">
                    {subject.name}
                  </div>
                  <div className="truncate text-2xs text-muted-foreground">
                    {[
                      subject.code,
                      subject.defaultCoefficient != null
                        ? `Coeff. ${subject.defaultCoefficient}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </div>
                </div>
              </div>
              <SideRow label="Catégorie" value={subject.domain ?? '—'} />
              <SideRow
                label="Coefficient par défaut"
                value={
                  subject.defaultCoefficient != null ? String(subject.defaultCoefficient) : '—'
                }
              />
              <SideRow
                label="Classes affectées"
                value={String(rows.length)}
                valueClass="text-primary"
              />
              <SideRow label="Total élèves" value={String(students)} />
              <div className="flex items-center justify-between py-1.5 text-xs">
                <span className="font-medium text-muted-foreground">Statut</span>
                <SubjectStatusBadge status={subject.status} />
              </div>
            </SideCard>

            <SideCard
              icon={<BarChart2 size={15} className="text-primary" />}
              title="Résumé des affectations"
            >
              <SideRow label="Total classes" value={String(rows.length)} />
              <SideRow
                label="Avec enseignant"
                value={String(withTeacher)}
                valueClass="text-success-foreground"
              />
              <SideRow
                label="Sans enseignant"
                value={String(without.length)}
                valueClass="text-warning-foreground"
              />
              <SideRow label="Heures total/sem." value={fmtHours(weeklyTotal)} />
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-2xs text-muted-foreground">
                  <span>Taux de couverture</span>
                  <span>{coverage}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${coverage}%` }}
                  />
                </div>
              </div>
            </SideCard>

            <SideCard
              icon={<CircleAlert size={15} className="text-warning-foreground" />}
              title="Classes non affectées"
            >
              <p className="mb-2.5 text-xs text-muted-foreground">
                Ces classes n&apos;ont pas encore cette matière dans leur programme.
              </p>
              {subject.unassignedClasses.length === 0 ? (
                <p className="text-xs font-medium text-success-foreground">
                  Toutes les classes ont cette matière ✓
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {subject.unassignedClasses.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-muted px-2.5 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-foreground">
                          {c.name}
                        </div>
                        <div className="text-2xs text-muted-foreground">
                          {plural(c.studentCount, 'élève')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void attach(c.id)}
                        disabled={busyRow === c.id}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-2xs font-medium text-primary-foreground disabled:opacity-50"
                      >
                        <Plus size={12} />
                        Affecter
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </SideCard>

            <SideCard
              icon={<Layers size={15} className="text-primary" />}
              title="Navigation rapide"
            >
              <div className="flex flex-col gap-1">
                {(
                  [
                    { tab: 'programme', label: 'Programme annuel' },
                    { tab: 'info', label: 'Informations générales' },
                  ] as { tab: SubjectTab; label: string }[]
                ).map((n) => (
                  <button
                    key={n.tab}
                    type="button"
                    onClick={() => onNavigateTab(n.tab)}
                    className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-[7px] text-left text-xs font-medium text-foreground hover:bg-secondary"
                  >
                    <ArrowRight size={13} className="text-primary" />
                    {n.label}
                  </button>
                ))}
              </div>
            </SideCard>
          </div>
        </div>
      </div>
      {footer}
    </>
  );
}

// ── pieces ──────────────────────────────────────────────────────────────

function Kpi({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3.5 sm:px-[18px]">
      <div className={cn('text-[22px] leading-none font-extrabold text-foreground', tone)}>
        {value}
      </div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

function SideCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-2.5 flex items-center gap-[7px] text-caption font-bold text-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function SideRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-1.5 text-xs last:border-b-0">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className={cn('truncate font-bold text-foreground', valueClass)}>{value}</span>
    </div>
  );
}

function TeacherCell({
  row,
  teachers,
  subjectName,
  busy,
  onChange,
}: {
  row: SubjectClassAssignment;
  teachers: TeacherOptionRow[];
  subjectName: string;
  busy: boolean;
  onChange: (teacherId: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2" data-teacher-select={row.classId}>
      {row.teacher && <Avatar name={row.teacher.name} src={row.teacher.photoUrl} size={28} />}
      <div className="min-w-0 flex-1">
        <BareSelect
          value={row.teacherId ?? ''}
          onValueChange={(v) => onChange(v || null)}
          disabled={busy}
          placeholder="Assigner un enseignant"
          className={cn(
            'min-w-[180px] py-1 pr-2 pl-2.5 text-xs',
            !row.teacherId && 'border-transparent bg-muted text-warning-foreground',
          )}
        >
          <SelectItem value="">
            <span className="flex items-center gap-1.5 text-warning-foreground">
              <UserPlus size={13} />
              Assigner un enseignant
            </span>
          </SelectItem>
          {teachers.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </BareSelect>
        {row.teacher && (
          <div className="mt-px pl-0.5 text-2xs text-muted-foreground">
            {row.class.isHomeroomTeacher ? 'Prof. principal' : `Prof. de ${subjectName}`}
          </div>
        )}
      </div>
    </div>
  );
}

/** Numeric cell — commits on blur / Enter so a keystroke isn't a round trip. */
function NumberCell({
  value,
  min,
  max,
  step,
  ariaLabel,
  className,
  onCommit,
}: {
  value: number | null;
  min: number;
  max: number;
  step: number;
  ariaLabel: string;
  className?: string;
  onCommit: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value == null ? '' : String(value));
  }
  function commit() {
    const next = draft.trim() === '' ? null : Number(draft);
    if (next !== null && (Number.isNaN(next) || next < min || next > max)) {
      setDraft(value == null ? '' : String(value));
      return;
    }
    if (next !== value) onCommit(next);
  }
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={cn(
        'rounded-md border border-border bg-muted px-2 py-[5px] text-center text-caption text-foreground outline-none focus:border-primary',
        className,
      )}
    />
  );
}

function AddClassPopover({
  classes,
  onPick,
  label,
  compact,
  variant = 'primary',
}: {
  classes: { id: string; name: string; level: string; studentCount: number }[];
  onPick: (classId: string) => void;
  label: string;
  compact?: boolean;
  variant?: 'primary' | 'dashed';
}) {
  const [open, setOpen] = useState(false);
  const empty = classes.length === 0;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={empty}
          title={empty ? 'Toutes les classes ont déjà cette matière' : undefined}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50',
            variant === 'primary' && 'bg-primary text-primary-foreground',
            variant === 'primary' &&
              (compact ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-[7px] text-caption'),
            variant === 'dashed' &&
              'mt-1 w-full border-[1.5px] border-dashed border-border px-3.5 py-2.5 text-xs text-muted-foreground',
          )}
        >
          <Plus size={variant === 'dashed' ? 14 : 13} />
          {label}
          {variant === 'primary' && <ChevronDown size={12} className="opacity-80" />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="z-50 w-64 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          <div className="max-h-72 overflow-y-auto">
            {classes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onPick(c.id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-caption text-foreground hover:bg-secondary hover:text-primary"
              >
                <span>
                  <span className="block font-medium">{c.name}</span>
                  <span className="block text-2xs text-muted-foreground">{c.level}</span>
                </span>
                <span className="text-2xs text-muted-foreground">
                  {plural(c.studentCount, 'élève')}
                </span>
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
