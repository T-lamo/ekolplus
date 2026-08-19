'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Users,
  Hash,
  School,
  Calendar,
  Mail,
  FileText,
  Pencil,
  Star,
  BookOpen,
  AlertTriangle,
  BarChart2,
  UserCheck,
  History,
  Zap,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { ASIDE_GRID } from '@/lib/layout';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { MENTION_LABEL, type Mention, type StudentAppreciationData } from '../types';

function mentionClass(m: Mention | null): string {
  switch (m) {
    case 'TRES_BIEN':
      return 'bg-success text-success-foreground';
    case 'BIEN':
      return 'bg-info text-info-foreground';
    case 'ASSEZ_BIEN':
      return 'bg-warning text-warning-foreground';
    case 'PASSABLE':
      return 'bg-muted text-muted-foreground';
    case 'INSUFFISANT':
    case 'FAIBLE':
      return 'bg-destructive text-destructive-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(1).replace('.', ',');
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AppreciationDetailPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const params = useParams<{ studentId: string }>();
  const searchParams = useSearchParams();
  const termId = searchParams.get('termId') ?? '';
  const [data, setData] = useState<StudentAppreciationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const qs = termId ? `?termId=${termId}` : '';
    api<StudentAppreciationData>(`/api/school/students/${params.studentId}/appreciations${qs}`)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setError('Élève introuvable.');
          return;
        }
        setError("Impossible de charger l'appréciation.");
      });
  }, [user, params.studentId, termId]);

  async function onDelete() {
    if (!data) return;
    if (!confirm("Supprimer l'appréciation générale de cet élève ?")) return;
    try {
      await api(
        `/api/school/students/${data.studentId}/appreciations?termId=${data.resolvedTermId}`,
        {
          method: 'DELETE',
        },
      );
      toast('Appréciation supprimée.', 'success');
      router.push('/pedagogie/appreciations');
    } catch {
      toast('Erreur lors de la suppression.', 'error');
    }
  }

  if (!user || (!data && !error)) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/pedagogie/appreciations"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          Retour aux appréciations
        </Link>
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      </div>
    );
  }

  const gradedSubjects = data.subjects.filter((s) => s.average != null);
  const minScore = gradedSubjects.length
    ? Math.min(...gradedSubjects.map((s) => s.average!))
    : null;
  const maxScore = gradedSubjects.length
    ? Math.max(...gradedSubjects.map((s) => s.average!))
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/pedagogie/appreciations"
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
      >
        <ArrowLeft size={13} />
        Retour aux appréciations
      </Link>

      <Card className="flex-row flex-wrap items-center justify-between gap-2 p-3 px-4">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Users size={12} className="shrink-0" />
          <span className="truncate">
            Élève {data.studentIndex ?? '—'} sur {data.classSize} — {data.className} ·{' '}
            {data.terms.find((t) => t.id === data.resolvedTermId)?.label ?? ''}
          </span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!data.prevStudentId}
            onClick={() =>
              data.prevStudentId &&
              router.push(
                `/pedagogie/appreciations/${data.prevStudentId}?termId=${data.resolvedTermId}`,
              )
            }
            className="flex h-7 w-7 items-center justify-center rounded-md text-foreground disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            disabled={!data.nextStudentId}
            onClick={() =>
              data.nextStudentId &&
              router.push(
                `/pedagogie/appreciations/${data.nextStudentId}?termId=${data.resolvedTermId}`,
              )
            }
            className="flex h-7 w-7 items-center justify-center rounded-md text-foreground disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </Card>

      <Card className="flex-col items-start gap-3.5 p-4 sm:flex-row sm:items-center">
        <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
          {data.firstName[0]}
          {data.lastName[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-foreground">
            {data.firstName} {data.lastName}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Hash size={11} />
              {data.studentNumber}
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <School size={11} />
              {data.className}
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {data.terms.find((t) => t.id === data.resolvedTermId)?.label ?? ''}
            </span>
            {data.general?.mention && (
              <>
                <span className="text-border">·</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-2xs font-bold ${mentionClass(data.general.mention)}`}
                >
                  {MENTION_LABEL[data.general.mention]}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {/* Both still toast placeholders ("bientôt disponible") — hidden on
              mobile so the one real action (Modifier) isn't crowded out by
              two buttons that don't do anything yet. */}
          <button
            type="button"
            onClick={() => toast('Messagerie — bientôt disponible.', 'info')}
            className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-caption font-semibold text-foreground sm:flex"
          >
            <Mail size={13} />
            Notifier le tuteur
          </button>
          <button
            type="button"
            onClick={() => toast('Disponible avec les Bulletins (Epic 7).', 'info')}
            className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-caption font-semibold text-foreground sm:flex"
          >
            <FileText size={13} />
            Générer le bulletin
          </button>
          <Link
            href={`/pedagogie/appreciations/${data.studentId}/saisie?termId=${data.resolvedTermId}`}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-caption font-semibold text-primary-foreground"
          >
            <Pencil size={13} />
            Modifier l&apos;appréciation
          </Link>
        </div>
      </Card>

      <div className={ASIDE_GRID}>
        <div className="flex flex-col gap-4">
          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Star size={14} className="text-primary" />
              Appréciation générale
            </div>
            {data.general ? (
              <>
                <div className="rounded-md bg-muted p-3.5 text-caption leading-relaxed text-foreground">
                  {data.general.text || <span className="text-muted-foreground italic">—</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Rédigé par :{' '}
                    <strong className="text-foreground">{data.general.authorName ?? '—'}</strong>
                  </span>
                  <span className="text-border">·</span>
                  <span>Saisie le {fmtDate(data.general.createdAt)}</span>
                  <span className="text-border">·</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ${data.general.status === 'PUBLISHED' ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'}`}
                  >
                    {data.general.status === 'PUBLISHED' ? 'Saisie' : 'Brouillon'}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Aucune appréciation générale saisie pour cet élève.
              </p>
            )}
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <BookOpen size={14} className="text-primary" />
              Appréciations par matière
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      Matière
                    </th>
                    <th className="px-2 py-2 text-center text-2xs font-semibold text-muted-foreground uppercase">
                      Coeff.
                    </th>
                    <th className="px-2 py-2 text-center text-2xs font-semibold text-muted-foreground uppercase">
                      Moy.
                    </th>
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      Mention
                    </th>
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      Appréciation
                    </th>
                    <th className="px-2 py-2 text-left text-2xs font-semibold text-muted-foreground uppercase">
                      Enseignant
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.subjects.map((s) => (
                    <tr key={s.classSubjectId} className="border-b border-border last:border-b-0">
                      <td className="px-2 py-2 text-caption font-semibold text-foreground">
                        {s.subjectName}
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-muted-foreground">
                        {s.coefficient ?? '—'}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className="text-sm font-bold text-foreground">{fmt(s.average)}</span>
                      </td>
                      <td className="px-2 py-2">
                        {s.mention ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-2xs font-bold ${mentionClass(s.mention)}`}
                          >
                            {MENTION_LABEL[s.mention]}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="max-w-[240px] px-2 py-2">
                        <span className="block truncate text-xs text-foreground">
                          {s.text ?? <span className="text-muted-foreground italic">—</span>}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs font-medium text-foreground">
                        {s.teacherName ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
              <span className="text-caption font-medium text-muted-foreground">
                Moyenne générale
              </span>
              <span className="text-xl font-extrabold text-foreground">
                {fmt(data.overallAverage)} / 20
              </span>
              {data.general?.mention && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-2xs font-bold ${mentionClass(data.general.mention)}`}
                >
                  {MENTION_LABEL[data.general.mention]}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                — Rang : {data.rank ?? '—'} / {data.rankedCount}
              </span>
            </div>
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <AlertTriangle size={14} className="text-destructive-foreground" />
              Décision du conseil de classe
            </div>
            <p className="text-sm text-muted-foreground italic">
              Disponible avec le Conseil de classe (à venir).
            </p>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <BarChart2 size={14} className="text-muted-foreground" />
              Statistiques du trimestre
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatBox label="Moyenne" value={fmt(data.overallAverage)} />
              <StatBox label="Rang" value={data.rank ? `${data.rank}e` : '—'} />
              <StatBox label="Note min" value={fmt(minScore)} />
              <StatBox label="Note max" value={fmt(maxScore)} />
            </div>
            <div className="h-px bg-border" />
            <InfoRow label="Moy. de classe" value={`${fmt(data.classAverage)} / 20`} />
            <InfoRow label="Absences" value="—" />
            <InfoRow label="Retards" value="—" />
            <InfoRow
              label="Matières évaluées"
              value={`${gradedSubjects.length} / ${data.subjects.length}`}
            />
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <UserCheck size={14} className="text-primary" />
              Enseignant principal
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-bold text-primary">
                {data.homeroomTeacherName?.[0] ?? '—'}
              </div>
              <div>
                <div className="text-caption font-bold text-foreground">
                  {data.homeroomTeacherName ?? 'Non défini'}
                </div>
                <div className="text-xs text-muted-foreground">{data.className}</div>
              </div>
            </div>
            <div className="h-px bg-border" />
            <InfoRow label="Saisie le" value={fmtDate(data.general?.createdAt)} />
            <InfoRow label="Dernière modification" value={fmtDate(data.general?.updatedAt)} />
          </Card>

          <Card className="gap-2.5 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <History size={14} className="text-muted-foreground" />
              Historique des modifications
            </div>
            <p className="text-xs text-muted-foreground italic">
              L&apos;historique détaillé arrive avec le module d&apos;audit (à venir).
            </p>
          </Card>

          <Card className="gap-1 p-2">
            <div className="flex items-center gap-2 px-2 pt-2 text-sm font-bold text-foreground">
              <Zap size={14} className="text-muted-foreground" />
              Actions rapides
            </div>
            <button
              type="button"
              onClick={() => toast('Disponible avec les Bulletins (Epic 7).', 'info')}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-caption font-medium text-foreground hover:bg-muted"
            >
              <FileText size={14} className="text-muted-foreground" />
              Générer le bulletin PDF
            </button>
            <button
              type="button"
              onClick={() => toast('Messagerie — bientôt disponible.', 'info')}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-caption font-medium text-foreground hover:bg-muted"
            >
              <Mail size={14} className="text-muted-foreground" />
              Envoyer au tuteur légal
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-caption font-medium text-destructive-foreground hover:bg-destructive"
            >
              <Trash2 size={14} />
              Supprimer l&apos;appréciation
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-2.5 text-center">
      <div className="text-lg font-extrabold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-caption">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
