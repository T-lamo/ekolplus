'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { FilterSelect, SelectItem } from '@/components/ui/FilterSelect';
import { Skeleton, SkeletonFilters, SkeletonTable } from '@/components/ui/Skeleton';
import { OverflowTags } from '@/components/ui/OverflowTags';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { Pager } from '@/components/ui/Pager';
import { getSubjectVisual } from '@/lib/subject-visuals';
import { CoefficientStepper } from './CoefficientStepper';
import type { ClassOption, ClassSubjectRow, SubjectOption } from './types';

const PAGE_SIZE = 10;

function CoefficientsPageInner() {
  const user = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [classes, setClasses] = useState<ClassOption[] | null>(null);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [rows, setRows] = useState<ClassSubjectRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(searchParams.get('classId'));
  const [domain, setDomain] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [page, setPage] = useState(1);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api<{ classes: ClassOption[] }>('/api/school/classes'),
      api<{ subjects: SubjectOption[] }>('/api/school/subjects'),
      api<{ classSubjects: ClassSubjectRow[] }>('/api/school/class-subjects'),
    ])
      .then(([c, s, cs]) => {
        setClasses(c.classes);
        setSubjects(s.subjects);
        setRows(cs.classSubjects);
        setClassId((prev) => prev ?? c.classes[0]?.id ?? null);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError('Impossible de charger les coefficients.');
      });
  }, [user, router]);

  function selectClass(id: string) {
    setClassId(id);
    setEdits({});
    router.replace(`/configuration/coefficients?classId=${id}`, { scroll: false });
  }

  const domains = useMemo(
    () => [...new Set(subjects.map((s) => s.domain).filter((d): d is string => !!d))],
    [subjects],
  );

  const classRows = useMemo(() => {
    return subjects
      .filter((s) => !domain || s.domain === domain)
      .map((subject) => {
        const existing = rows.find((r) => r.classId === classId && r.subjectId === subject.id);
        const otherClasses = rows.filter(
          (r) => r.subjectId === subject.id && r.classId !== classId && r.coefficient !== null,
        );
        const coefficient =
          subject.id in edits ? edits[subject.id] : (existing?.coefficient ?? null);
        return { subject, existing, otherClasses, coefficient: coefficient ?? null };
      });
  }, [subjects, rows, classId, domain, edits]);

  useEffect(() => {
    setPage(1);
  }, [classId, domain]);

  const paged = classRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sumCoefficients = useMemo(
    () => classRows.reduce((sum, r) => sum + (r.coefficient ?? 0), 0),
    [classRows],
  );
  const configuredCount = classRows.filter((r) => r.coefficient !== null).length;
  const dirtyCount = Object.keys(edits).length;

  async function onSave() {
    if (!classId || dirtyCount === 0) return;
    setSaving(true);
    try {
      const results = await Promise.all(
        Object.entries(edits).map(([subjectId, coefficient]) =>
          api<{ classSubject: ClassSubjectRow }>('/api/school/class-subjects', {
            method: 'POST',
            body: { classId, subjectId, coefficient },
          }),
        ),
      );
      setRows((prev) => {
        const byId = new Map(prev.map((r) => [r.id, r]));
        for (const { classSubject } of results) byId.set(classSubject.id, classSubject);
        return [...byId.values()];
      });
      setEdits({});
      toast('Coefficients enregistrés.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-5">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">Coefficients</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Gestion des coefficients par matière et par classe.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {classes === null && !error && (
        <div className="flex flex-col gap-3.5">
          <Skeleton className="h-16 w-full rounded-lg" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
          <SkeletonFilters />
          <Card className="overflow-hidden">
            <SkeletonTable rows={6} cols={5} />
          </Card>
        </div>
      )}

      {classes !== null && classes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucune classe configurée — crée d&apos;abord une classe dans « Classes ».
        </p>
      )}

      {classes !== null && classes.length > 0 && classId && (
        <>
          <div className="rounded-lg border border-primary/20 bg-secondary p-3.5 text-xs text-secondary-foreground">
            <div className="mb-0.5 font-bold">Coefficients par classe</div>
            Les coefficients définissent le poids de chaque matière dans le calcul de la moyenne
            générale. Les modifications sont appliquées à la génération des bulletins.
          </div>

          <Tabs
            tabs={classes.map((c) => ({ key: c.id, label: c.name }))}
            active={classId}
            onChange={selectClass}
          />

          <div className="flex flex-wrap items-center gap-2.5">
            <FilterSelect value={domain} onValueChange={setDomain}>
              <SelectItem value="">Tous les domaines</SelectItem>
              {domains.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </FilterSelect>
            <span className="text-sm text-muted-foreground">{classRows.length} matières</span>
            <ViewToggle view={view} onChange={setView} className="ml-auto" />
          </div>

          {classRows.length > 0 && view === 'grid' && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {paged.map(({ subject, otherClasses, coefficient }) => {
                  const isDirty = subject.id in edits;
                  const weight =
                    sumCoefficients > 0 && coefficient !== null
                      ? Math.round((coefficient / sumCoefficients) * 1000) / 10
                      : 0;
                  const visual = getSubjectVisual(subject.name);
                  return (
                    <Card key={subject.id} className="gap-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                            style={{ background: visual.iconBg, color: visual.iconFg }}
                          >
                            <visual.Icon size={17} />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-bold text-foreground">{subject.name}</div>
                            {subject.code && (
                              <div className="text-2xs text-muted-foreground">{subject.code}</div>
                            )}
                          </div>
                        </div>
                        {subject.domain && (
                          <span
                            className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-2xs font-semibold"
                            style={{ background: visual.badgeBg, color: visual.badgeFg }}
                          >
                            {subject.domain}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <CoefficientStepper
                          value={coefficient}
                          onChange={(v) => setEdits((prev) => ({ ...prev, [subject.id]: v }))}
                        />
                        {isDirty && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-primary">
                            Modifié
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Poids relatif</span>
                        {coefficient !== null ? (
                          <>
                            <div className="h-1.5 w-[50px] rounded-full bg-muted">
                              <div
                                className="h-1.5 rounded-full bg-primary"
                                style={{ width: `${weight}%` }}
                              />
                            </div>
                            <span>{weight}%</span>
                          </>
                        ) : (
                          <span>—</span>
                        )}
                      </div>
                      {otherClasses.length > 0 && (
                        <div className="border-t border-border pt-3">
                          <OverflowTags
                            items={otherClasses}
                            keyOf={(oc) => oc.id}
                            renderItem={(oc) => (
                              <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-muted-foreground">
                                {oc.class.name}: {oc.coefficient}
                              </span>
                            )}
                          />
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
              <Pager
                centered
                page={page}
                pageSize={PAGE_SIZE}
                total={classRows.length}
                onChange={setPage}
              />
            </>
          )}

          <Card className="mt-auto overflow-x-auto">
            {classRows.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">Aucune matière à configurer.</p>
            ) : view === 'list' ? (
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Matière
                    </th>
                    <th className="px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Domaine
                    </th>
                    <th className="px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Coefficient
                    </th>
                    <th className="px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Poids relatif
                    </th>
                    <th className="px-3.5 py-2.5 text-left text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Coefficient autres classes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map(({ subject, otherClasses, coefficient }) => {
                    const isDirty = subject.id in edits;
                    const weight =
                      sumCoefficients > 0 && coefficient !== null
                        ? Math.round((coefficient / sumCoefficients) * 1000) / 10
                        : 0;
                    const visual = getSubjectVisual(subject.name);
                    return (
                      <tr key={subject.id} className="border-b border-border last:border-none">
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                              style={{ background: visual.iconBg, color: visual.iconFg }}
                            >
                              <visual.Icon size={16} />
                            </div>
                            <div>
                              <div className="font-semibold text-foreground">{subject.name}</div>
                              {subject.code && (
                                <div className="text-2xs text-muted-foreground">{subject.code}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5">
                          {subject.domain ? (
                            <span
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold"
                              style={{ background: visual.badgeBg, color: visual.badgeFg }}
                            >
                              {subject.domain}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2">
                            <CoefficientStepper
                              value={coefficient}
                              onChange={(v) => setEdits((prev) => ({ ...prev, [subject.id]: v }))}
                            />
                            {isDirty && (
                              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-primary">
                                Modifié
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5">
                          {coefficient !== null ? (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-[50px] rounded-full bg-muted">
                                <div
                                  className="h-1.5 rounded-full bg-primary"
                                  style={{ width: `${weight}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">{weight}%</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <OverflowTags
                            items={otherClasses}
                            keyOf={(oc) => oc.id}
                            renderItem={(oc) => (
                              <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-muted-foreground">
                                {oc.class.name}: {oc.coefficient}
                              </span>
                            )}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
            {view === 'list' && classRows.length > 0 && (
              <Pager
                centered
                page={page}
                pageSize={PAGE_SIZE}
                total={classRows.length}
                onChange={setPage}
              />
            )}

            <div
              className={`flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center ${view === 'list' || classRows.length === 0 ? 'border-t border-border' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span className="text-muted-foreground">
                  Somme :{' '}
                  <span className="text-base font-bold text-primary">{sumCoefficients}</span>
                </span>
                <span className="text-muted-foreground">
                  Matières configurées :{' '}
                  <span className="font-semibold text-success-foreground">
                    {configuredCount} / {classRows.length}
                  </span>
                </span>
              </div>
              <Button
                className="w-fit"
                onClick={onSave}
                loading={saving}
                disabled={dirtyCount === 0}
              >
                {saving
                  ? 'Enregistrement…'
                  : `Enregistrer${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

export default function CoefficientsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <Skeleton className="h-10 w-10 rounded-full" />
        </main>
      }
    >
      <CoefficientsPageInner />
    </Suspense>
  );
}
