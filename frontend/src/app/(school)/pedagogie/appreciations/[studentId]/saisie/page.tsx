'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Save,
  Check,
  Settings2,
  User,
  Star,
  BookOpen,
  BarChart2,
  Zap,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, SelectItem } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import type { AppreciationsListData, Mention, StudentAppreciationData } from '../../types';
import { MENTION_LABEL } from '../../types';

const MENTION_OPTIONS: Mention[] = [
  'TRES_BIEN',
  'BIEN',
  'ASSEZ_BIEN',
  'PASSABLE',
  'INSUFFISANT',
  'FAIBLE',
];
const MENTION_BTN_CLASS: Record<Mention, string> = {
  TRES_BIEN: 'border-success bg-success text-success-foreground',
  BIEN: 'border-[#2563eb] bg-info text-info-foreground',
  ASSEZ_BIEN: 'border-warning-foreground bg-warning text-warning-foreground',
  PASSABLE: 'border-border bg-muted text-muted-foreground',
  INSUFFISANT: 'border-destructive-foreground bg-destructive text-destructive-foreground',
  FAIBLE: 'border-destructive-foreground bg-destructive text-destructive-foreground',
};
const COMPORTEMENT_OPTIONS = ['Excellent', 'Satisfaisant', 'À améliorer', 'Perturbateur'];
const INVESTISSEMENT_OPTIONS = ['Excellent', 'Satisfaisant', 'À améliorer', 'Insuffisant'];
const ASSIDUITE_OPTIONS = ['Régulier', 'Irrégulier', 'Absences répétées'];
const QUICK_PHRASES = [
  'Élève sérieux et investi, encourage à continuer.',
  'Des efforts notables, mais des lacunes persistent.',
  'Résultats insuffisants. Un soutien scolaire est recommandé.',
  'Trimestre satisfaisant, peut viser encore mieux.',
  'Comportement exemplaire, excellente participation.',
  'Doit faire preuve de plus de régularité dans son travail.',
];

function suggestMention(avg: number | null): Mention | null {
  if (avg == null) return null;
  if (avg < 8) return 'FAIBLE';
  if (avg < 10) return 'INSUFFISANT';
  if (avg < 11) return 'PASSABLE';
  if (avg < 12) return 'ASSEZ_BIEN';
  if (avg < 14) return 'BIEN';
  return 'TRES_BIEN';
}

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(1).replace('.', ',');
}

interface SubjectRowState {
  text: string;
}

export default function SaisirAppreciationPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const params = useParams<{ studentId: string }>();
  const searchParams = useSearchParams();

  const [data, setData] = useState<StudentAppreciationData | null>(null);
  const [roster, setRoster] = useState<AppreciationsListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [termId, setTermId] = useState(searchParams.get('termId') ?? '');

  const [mention, setMention] = useState<Mention | null>(null);
  const [text, setText] = useState('');
  const [comportement, setComportement] = useState('');
  const [investissement, setInvestissement] = useState('');
  const [assiduite, setAssiduite] = useState('');
  const [subjectRows, setSubjectRows] = useState<Record<string, SubjectRowState>>({});

  useEffect(() => {
    if (!user) return;
    const qs = termId ? `?termId=${termId}` : '';
    api<StudentAppreciationData>(`/api/school/students/${params.studentId}/appreciations${qs}`)
      .then((d) => {
        setData(d);
        setTermId(d.resolvedTermId ?? '');
        setMention(d.general?.mention ?? suggestMention(d.overallAverage));
        setText(d.general?.text ?? '');
        setComportement(d.general?.comportement ?? '');
        setInvestissement(d.general?.investissement ?? '');
        setAssiduite(d.general?.assiduite ?? '');
        const rows: Record<string, SubjectRowState> = {};
        for (const s of d.subjects) rows[s.subjectId] = { text: s.text ?? '' };
        setSubjectRows(rows);
        return api<AppreciationsListData>(
          `/api/school/classes/${d.classId}/appreciations?termId=${d.resolvedTermId}`,
        );
      })
      .then(setRoster)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setError('Élève introuvable.');
          return;
        }
        setError("Impossible de charger la saisie d'appréciation.");
      });
  }, [user, params.studentId, termId]);

  const filledSubjects = useMemo(
    () => Object.values(subjectRows).filter((r) => r.text.trim() !== '').length,
    [subjectRows],
  );

  async function save(publish: boolean) {
    if (!data) return;
    setSaving(true);
    setError(null);
    const status = publish ? 'PUBLISHED' : 'DRAFT';
    try {
      await api(`/api/school/students/${data.studentId}/appreciations`, {
        method: 'PUT',
        body: {
          termId: data.resolvedTermId,
          subjectId: null,
          mention,
          text,
          comportement,
          investissement,
          assiduite,
          status,
        },
      });
      await Promise.all(
        data.subjects
          .filter((s) => (subjectRows[s.subjectId]?.text ?? '').trim() !== '')
          .map((s) =>
            api(`/api/school/students/${data.studentId}/appreciations`, {
              method: 'PUT',
              body: {
                termId: data.resolvedTermId,
                subjectId: s.subjectId,
                text: subjectRows[s.subjectId]!.text,
                mention: suggestMention(s.average),
                status,
              },
            }),
          ),
      );
      if (publish) {
        toast('Appréciation validée.', 'success');
        if (data.nextStudentId) {
          router.push(
            `/pedagogie/appreciations/${data.nextStudentId}/saisie?termId=${data.resolvedTermId}`,
          );
        } else {
          router.push('/pedagogie/appreciations');
        }
      } else {
        toast('Brouillon enregistré.', 'success');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
    } finally {
      setSaving(false);
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
          Retour à la liste
        </Link>
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      </div>
    );
  }

  const currentTermLabel = data.terms.find((t) => t.id === data.resolvedTermId)?.label ?? '';
  const prevName = roster?.students.find((s) => s.studentId === data.prevStudentId);
  const nextName = roster?.students.find((s) => s.studentId === data.nextStudentId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Saisir une appréciation</h1>
          <p className="text-sm text-muted-foreground">
            {currentTermLabel} — {data.className}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/pedagogie/appreciations"
            className="flex w-fit items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold text-muted-foreground"
          >
            <ArrowLeft size={14} />
            Retour à la liste
          </Link>
          <Button
            variant="ghost"
            className="w-fit border border-border"
            onClick={() => save(false)}
            loading={saving}
          >
            <Save size={14} />
            Enregistrer brouillon
          </Button>
          <Button className="w-fit" onClick={() => save(true)} loading={saving}>
            <Check size={14} />
            Valider l&apos;appréciation
          </Button>
        </div>
      </div>

      {roster && (
        <Card className="flex-row items-center gap-3 p-3.5">
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            Progression de la classe :
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${roster.totalCount ? (roster.saisieCount / roster.totalCount) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="text-xs font-bold whitespace-nowrap text-primary">
            {roster.saisieCount} / {roster.totalCount} élèves
          </span>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Settings2 size={14} className="text-primary" />
              Contexte de saisie
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="mb-1 text-xs font-semibold text-foreground">Classe</div>
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
                  {data.className}
                </div>
              </div>
              <Select label="Trimestre" value={termId} onValueChange={setTermId}>
                {data.terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </Select>
              <div>
                <div className="mb-1 text-xs font-semibold text-foreground">Élève</div>
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
                  {data.studentIndex} / {data.classSize}
                </div>
              </div>
            </div>
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <User size={14} className="text-primary" />
                Élève sélectionné
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!data.prevStudentId}
                  onClick={() =>
                    data.prevStudentId &&
                    router.push(
                      `/pedagogie/appreciations/${data.prevStudentId}/saisie?termId=${data.resolvedTermId}`,
                    )
                  }
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground disabled:opacity-40"
                >
                  <ChevronLeft size={13} />
                  Précédent
                </button>
                <button
                  type="button"
                  disabled={!data.nextStudentId}
                  onClick={() =>
                    data.nextStudentId &&
                    router.push(
                      `/pedagogie/appreciations/${data.nextStudentId}/saisie?termId=${data.resolvedTermId}`,
                    )
                  }
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground disabled:opacity-40"
                >
                  Suivant
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3.5 rounded-md bg-secondary p-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {data.firstName[0]}
                {data.lastName[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-foreground">
                  {data.firstName} {data.lastName}
                </div>
                <div className="text-xs text-muted-foreground">
                  N° {data.studentNumber} · {data.className}
                  {data.rank ? ` · Rang provisoire : ${data.rank}e` : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="mb-0.5 text-2xs text-muted-foreground">Moyenne générale</div>
                <div className="text-xl font-extrabold text-foreground">
                  {fmt(data.overallAverage)}
                </div>
                <div className="text-2xs text-muted-foreground">/20</div>
              </div>
            </div>

            {roster && roster.students.length > 1 && (
              <div className="max-h-[180px] overflow-y-auto rounded-md border border-border">
                {roster.students.map((s) => (
                  <button
                    key={s.studentId}
                    type="button"
                    onClick={() =>
                      router.push(
                        `/pedagogie/appreciations/${s.studentId}/saisie?termId=${data.resolvedTermId}`,
                      )
                    }
                    className={`flex w-full items-center gap-2.5 border-b border-border px-3 py-2 text-left last:border-b-0 ${s.studentId === data.studentId ? 'bg-secondary' : 'hover:bg-muted'}`}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">
                      {s.firstName[0]}
                      {s.lastName[0]}
                    </span>
                    <span
                      className={`flex-1 truncate text-caption ${s.studentId === data.studentId ? 'font-semibold text-primary' : 'text-foreground'}`}
                    >
                      {s.firstName} {s.lastName}
                    </span>
                    <span className="text-xs font-bold text-muted-foreground">
                      {fmt(s.average)}
                    </span>
                    {s.status === 'PUBLISHED' ? (
                      <CheckCircle2 size={13} className="text-success-foreground" />
                    ) : (
                      <Clock size={13} className="text-warning-foreground" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Star size={14} className="text-primary" />
              Appréciation générale
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-foreground">Mention générale</div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {MENTION_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMention(m)}
                    className={`rounded-md border-2 px-2 py-2 text-center text-xs font-bold ${mention === m ? MENTION_BTN_CLASS[m] : 'border-border bg-card text-muted-foreground'}`}
                  >
                    {MENTION_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-border" />

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Commentaire général{' '}
                  <span className="font-normal text-muted-foreground">
                    (visible sur le bulletin)
                  </span>
                </span>
                <span className="text-2xs text-muted-foreground">
                  {text.length} / 500 caractères
                </span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 500))}
                rows={4}
                placeholder="Rédigez un commentaire constructif et bienveillant."
                className="w-full rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/10"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select label="Comportement" value={comportement} onValueChange={setComportement}>
                <SelectItem value="">—</SelectItem>
                {COMPORTEMENT_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </Select>
              <Select
                label="Investissement"
                value={investissement}
                onValueChange={setInvestissement}
              >
                <SelectItem value="">—</SelectItem>
                {INVESTISSEMENT_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </Select>
              <Select label="Assiduité" value={assiduite} onValueChange={setAssiduite}>
                <SelectItem value="">—</SelectItem>
                {ASSIDUITE_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <BookOpen size={14} className="text-primary" />
                Appréciations par matière
              </div>
              <span className="text-xs text-muted-foreground">
                {data.subjects.length} matières · Saisies : {filledSubjects}/{data.subjects.length}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {data.subjects.map((s) => (
                <div
                  key={s.classSubjectId}
                  className="grid grid-cols-[140px_60px_70px_1fr] items-start gap-2.5"
                >
                  <span className="pt-2 text-caption font-semibold text-foreground">
                    {s.subjectName}
                  </span>
                  <span className="pt-2 text-xs text-muted-foreground">× {s.coefficient ?? 1}</span>
                  <span className="pt-1.5">
                    <span className="inline-flex min-w-[44px] items-center justify-center rounded-md bg-muted px-2 py-1 text-xs font-bold text-foreground">
                      {fmt(s.average)}
                    </span>
                  </span>
                  <textarea
                    value={subjectRows[s.subjectId]?.text ?? ''}
                    onChange={(e) =>
                      setSubjectRows((prev) => ({
                        ...prev,
                        [s.subjectId]: { text: e.target.value.slice(0, 300) },
                      }))
                    }
                    rows={2}
                    placeholder="Cliquer pour saisir une appréciation..."
                    className="w-full rounded-md border border-border bg-input px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground placeholder:italic focus:border-primary"
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex-row items-center justify-between p-3.5">
            {prevName ? (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/pedagogie/appreciations/${prevName.studentId}/saisie?termId=${data.resolvedTermId}`,
                  )
                }
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
              >
                <ArrowLeft size={14} />
                Précédent : {prevName.firstName} {prevName.lastName}
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="w-fit border border-border"
                onClick={() => save(false)}
                loading={saving}
              >
                <Save size={14} />
                Enregistrer brouillon
              </Button>
              <Button className="w-fit" onClick={() => save(true)} loading={saving}>
                <Check size={14} />
                Valider et passer au suivant
              </Button>
            </div>
            {nextName ? (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/pedagogie/appreciations/${nextName.studentId}/saisie?termId=${data.resolvedTermId}`,
                  )
                }
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
              >
                Suivant : {nextName.firstName} {nextName.lastName}
                <ArrowRight size={14} />
              </button>
            ) : (
              <span />
            )}
          </Card>

          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card className="gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <BarChart2 size={14} className="text-primary" />
              Résumé de l&apos;élève
            </div>
            <div className="flex flex-col items-center gap-1.5 text-center">
              <div className="flex h-13 w-13 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
                {data.firstName[0]}
                {data.lastName[0]}
              </div>
              <div className="text-sm font-bold text-foreground">
                {data.firstName} {data.lastName}
              </div>
              <div className="text-xs text-muted-foreground">
                {data.className} · #{data.studentNumber}
              </div>
            </div>
            <div className="h-px bg-border" />
            <InfoRow label="Moyenne générale" value={`${fmt(data.overallAverage)} / 20`} />
            <InfoRow label="Rang" value={data.rank ? `${data.rank}e / ${data.rankedCount}` : '—'} />
            <InfoRow label="Absences" value="—" />
            <InfoRow label="Retards" value="—" />
            <InfoRow label="Moy. classe" value={`${fmt(data.classAverage)} / 20`} />
            {data.subjects.length > 0 && (
              <div className="mt-1">
                <div className="mb-1.5 text-2xs text-muted-foreground">Notes par matière</div>
                <div className="flex flex-col gap-1.5">
                  {data.subjects.map((s) => (
                    <div key={s.classSubjectId}>
                      <div className="mb-0.5 flex justify-between text-2xs">
                        <span className="font-medium text-foreground">{s.subjectName}</span>
                        <span className="font-bold text-foreground">{fmt(s.average)}</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${s.average != null ? (s.average / 20) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="gap-2 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Zap size={14} className="text-primary" />
              Phrases types
            </div>
            <p className="text-2xs text-muted-foreground">
              Cliquer pour insérer dans le commentaire
            </p>
            <div className="flex flex-col gap-1.5">
              {QUICK_PHRASES.map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  onClick={() =>
                    setText((prev) => (prev ? `${prev.trim()} ${phrase}` : phrase).slice(0, 500))
                  }
                  className="rounded-md border border-border px-2.5 py-2 text-left text-2xs text-foreground hover:bg-muted"
                >
                  {phrase}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
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
