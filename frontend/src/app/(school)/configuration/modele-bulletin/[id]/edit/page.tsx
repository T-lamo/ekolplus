'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Save,
  Download,
  Eye,
  LayoutTemplate,
  GripVertical,
  PanelTop,
  User,
  Table,
  BarChart2,
  CalendarX,
  MessageSquare,
  PenLine,
  CheckCircle2,
  Copy,
  FileText,
  Monitor,
  Smartphone,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Skeleton } from '@/components/ui/Skeleton';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { BulletinCanvas, type BulletinRenderData } from '@/components/bulletin/BulletinCanvas';
import { REORDERABLE_BLOCK_IDS, BLOCK_LABEL } from '../../types';
import type { BlockId, BulletinTemplateConfig, TemplateDetail } from '../../types';

// Real paper dimensions (mm) so the editor preview's aspect ratio actually
// changes when the format/orientation toggle changes — previously the
// preview stayed a fixed 760px box no matter what was selected.
const PAGE_SIZES_MM: Record<'A4' | 'LETTER', { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  LETTER: { w: 215.9, h: 279.4 },
};

// Preview is sized off its LONG edge, not a fixed width — that way
// switching Portrait<->Paysage can never make the preview wider than this
// constant (a portrait page's long edge is its height, a landscape page's
// long edge is its width), so it can never force the 3-column editor
// layout into horizontal scroll. Zoom scales on top of this baseline.
const PAPER_LONG_EDGE = 560;

const COLOR_SWATCHES = [
  '#6c2bd9',
  '#2563eb',
  '#1a9e5c',
  '#d93025',
  '#e65100',
  '#1a1a2e',
  '#f59e0b',
  '#0ea5e9',
];

const BLOCK_ICON: Record<BlockId, ComponentType<{ size?: number; style?: object }>> = {
  header: PanelTop,
  studentInfo: User,
  stats: BarChart2,
  notes: Table,
  absences: CalendarX,
  appreciation: MessageSquare,
  signatures: PenLine,
};

// Illustrative-only — the editor previews a fixed sample student so every
// config change (color/typography/columns/order) is visible without needing
// real class data. The Viewer builds the same BulletinRenderData shape from
// real grades/appreciations for whichever student is actually being viewed.
const SAMPLE_BULLETIN_DATA: BulletinRenderData = {
  schoolName: 'École LesÉtoiles',
  schoolLogoUrl: null,
  directorSignatureUrl: null,
  period: 'Trimestre 2',
  academicYear: '2024–2025',
  studentName: 'Jean-Pierre M.',
  className: '3ème A',
  classSize: 28,
  studentNumber: 'N° 2024-0047',
  subjects: [
    {
      name: 'Mathématiques',
      coefficient: 4,
      average: 15.67,
      classAverage: 12.8,
      min: 6.5,
      max: 19.0,
      appreciation: 'Très bon trimestre',
    },
    {
      name: 'Français',
      coefficient: 4,
      average: 12.0,
      classAverage: 11.4,
      min: 5.0,
      max: 17.5,
      appreciation: 'Peut mieux faire',
    },
    {
      name: 'Sciences',
      coefficient: 3,
      average: 18.0,
      classAverage: 13.2,
      min: 8.0,
      max: 20.0,
      appreciation: 'Excellent travail',
    },
    {
      name: 'Anglais',
      coefficient: 3,
      average: 10.0,
      classAverage: 12.1,
      min: 4.5,
      max: 18.0,
      appreciation: 'Efforts nécessaires',
    },
    {
      name: 'Histoire-Géo',
      coefficient: 2,
      average: 16.5,
      classAverage: 11.9,
      min: 7.0,
      max: 19.5,
      appreciation: 'Très bonne maîtrise',
    },
  ],
  overallAverage: 14.38,
  classAverage: 12.5,
  rank: 4,
  rankedCount: 28,
  generalAppreciation:
    "Élève sérieux et investi qui fait preuve d'une bonne volonté dans l'ensemble des matières. Les résultats en sciences sont excellents et encourageants. Des efforts supplémentaires sont attendus en anglais pour consolider les acquis. Continuez ainsi !",
  absencesDays: 3,
  retards: 1,
};

type Tab = 'style' | 'content' | 'spacing';

export default function BulletinEditorPage() {
  const user = useUser();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [data, setData] = useState<TemplateDetail | null>(null);
  const [config, setConfig] = useState<BulletinTemplateConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<BlockId>('header');
  const [propTab, setPropTab] = useState<Tab>('style');
  const [dragId, setDragId] = useState<BlockId | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [zoom, setZoom] = useState(100);
  const [school, setSchool] = useState<{
    logoUrl: string | null;
    directorSignatureUrl: string | null;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    api<TemplateDetail>(`/api/school/bulletin-templates/${params.id}`)
      .then((d) => {
        setData(d);
        setConfig(d.config);
        setNameInput(d.name);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setError('Modèle introuvable.');
          return;
        }
        setError('Impossible de charger le modèle.');
      });
  }, [user, params.id]);

  useEffect(() => {
    if (!user) return;
    api<{ school: { logoUrl: string | null; directorSignatureUrl: string | null } }>('/api/school')
      .then((d) => setSchool(d.school))
      .catch(() => {
        // Non-fatal — the logo/signature panels just show the empty state.
      });
  }, [user]);

  function patchConfig(patch: Partial<BulletinTemplateConfig>) {
    setConfig((c) => (c ? { ...c, ...patch } : c));
  }

  function toggleBlock(id: BlockId) {
    setConfig((c) =>
      c
        ? {
            ...c,
            blocks: c.blocks.map((b) => (b.id === id ? { ...b, visible: !b.visible } : b)),
          }
        : c,
    );
  }

  function reorder(targetId: BlockId) {
    if (!dragId || dragId === targetId || !config) return;
    const blocks = [...config.blocks];
    const from = blocks.findIndex((b) => b.id === dragId);
    const to = blocks.findIndex((b) => b.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = blocks.splice(from, 1);
    if (!moved) return;
    blocks.splice(to, 0, moved);
    patchConfig({ blocks });
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      await api(`/api/school/bulletin-templates/${params.id}`, {
        method: 'PATCH',
        body: { config },
      });
      toast('Modèle enregistré.', 'success');
    } catch {
      toast("Erreur lors de l'enregistrement.", 'error');
    } finally {
      setSaving(false);
    }
  }

  async function fork() {
    if (!data) return;
    try {
      const res = await api<{ template: { id: string } }>(
        `/api/school/bulletin-templates/${data.id}/fork`,
        { method: 'POST' },
      );
      toast('Modèle dupliqué — vous pouvez maintenant le personnaliser.', 'success');
      router.push(`/configuration/modele-bulletin/${res.template.id}/edit`);
    } catch {
      toast('Erreur lors de la duplication du modèle.', 'error');
    }
  }

  async function setActive() {
    if (!data) return;
    try {
      await api(`/api/school/bulletin-templates/${data.id}`, {
        method: 'PATCH',
        body: { isActive: true },
      });
      toast('Modèle défini comme actif.', 'success');
      setData((d) => (d ? { ...d, isActive: true } : d));
    } catch {
      toast("Erreur lors de l'activation du modèle.", 'error');
    }
  }

  async function renameTemplate(name: string) {
    const trimmed = name.trim();
    if (!data || !trimmed) {
      setNameInput(data?.name ?? '');
      return;
    }
    if (trimmed === data.name) return;
    setData((d) => (d ? { ...d, name: trimmed } : d));
    setNameInput(trimmed);
    try {
      await api(`/api/school/bulletin-templates/${params.id}`, {
        method: 'PATCH',
        body: { name: trimmed },
      });
    } catch {
      toast('Erreur lors du renommage du modèle.', 'error');
    }
  }

  async function updateSchoolLogo(url: string | null) {
    setSchool((s) => (s ? { ...s, logoUrl: url } : s));
    try {
      await api('/api/school', { method: 'PUT', body: { logoUrl: url } });
    } catch {
      toast("Erreur lors de l'enregistrement du logo.", 'error');
    }
  }

  async function updateSchoolSignature(url: string | null) {
    setSchool((s) => (s ? { ...s, directorSignatureUrl: url } : s));
    try {
      await api('/api/school', { method: 'PUT', body: { directorSignatureUrl: url } });
    } catch {
      toast("Erreur lors de l'enregistrement de la signature.", 'error');
    }
  }

  const orderedBlocks = useMemo(() => config?.blocks ?? [], [config]);
  const previewData: BulletinRenderData = useMemo(
    () => ({
      ...SAMPLE_BULLETIN_DATA,
      schoolLogoUrl: school?.logoUrl ?? null,
      directorSignatureUrl: school?.directorSignatureUrl ?? null,
    }),
    [school],
  );
  const paperSize = useMemo(() => {
    if (!config) return { width: PAPER_LONG_EDGE, height: PAPER_LONG_EDGE };
    const dims = PAGE_SIZES_MM[config.pageFormat];
    const [mmW, mmH] = config.orientation === 'LANDSCAPE' ? [dims.h, dims.w] : [dims.w, dims.h];
    const scale = PAPER_LONG_EDGE / Math.max(mmW, mmH);
    return { width: Math.round(mmW * scale), height: Math.round(mmH * scale) };
  }, [config]);
  const previewWidth = Math.round(paperSize.width * (zoom / 100));
  const previewHeight = Math.round(paperSize.height * (zoom / 100));

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }
  if (!data && !error) {
    return (
      <div className="-m-6 flex h-screen flex-col overflow-hidden">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-5">
          <Skeleton className="h-7 w-20 rounded-md" />
          <div className="h-5 w-px bg-border" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-60 shrink-0 flex-col gap-2.5 overflow-y-auto border-r border-border bg-card p-3.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
          <div className="flex flex-1 items-start justify-center overflow-y-auto bg-[#d8d8e8] p-7">
            <Skeleton className="h-[600px] w-[440px] max-w-full rounded-md" />
          </div>
          <div className="flex w-64 shrink-0 flex-col gap-2.5 overflow-y-auto border-l border-border bg-card p-3.5">
            <Skeleton className="h-6 w-full" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (error || !data || !config) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => router.push('/configuration/modele-bulletin')}
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft size={14} />
          Retour
        </button>
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="-m-6 flex h-screen flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/configuration/modele-bulletin')}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground"
          >
            <ArrowLeft size={12} />
            Retour
          </button>
          <div className="h-5 w-px bg-border" />
          {data.isOwn ? (
            <div className="flex items-center gap-1.5">
              <LayoutTemplate size={14} className="shrink-0 text-primary" />
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={() => renameTemplate(nameInput)}
                maxLength={120}
                aria-label="Nom du modèle"
                className="w-48 rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-semibold text-foreground outline-none hover:border-border focus:border-primary focus:bg-background"
              />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
              <LayoutTemplate size={14} className="text-primary" />
              {data.name}
            </div>
          )}
          {data.isActive && (
            <span className="flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[11px] font-semibold text-success-foreground">
              <CheckCircle2 size={10} />
              Actif
            </span>
          )}
          {!data.isOwn && (
            <span className="flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-[11px] font-semibold text-warning-foreground">
              Lecture seule — modèle global
            </span>
          )}
        </div>
        {data.isOwn ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
              <button
                type="button"
                onClick={() => patchConfig({ pageFormat: 'LETTER' })}
                className={`rounded px-2.5 py-1 text-xs font-medium ${config.pageFormat === 'LETTER' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                Letter
              </button>
              <button
                type="button"
                onClick={() => patchConfig({ pageFormat: 'A4' })}
                className={`rounded px-2.5 py-1 text-xs font-medium ${config.pageFormat === 'A4' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                A4
              </button>
            </div>
            <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
              <button
                type="button"
                onClick={() => patchConfig({ orientation: 'LANDSCAPE' })}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium ${config.orientation === 'LANDSCAPE' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                <Monitor size={12} />
                Paysage
              </button>
              <button
                type="button"
                onClick={() => patchConfig({ orientation: 'PORTRAIT' })}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium ${config.orientation === 'PORTRAIT' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                <Smartphone size={12} />
                Portrait
              </button>
            </div>
            <div className="h-5 w-px bg-border" />
            {!data.isActive && (
              <button
                type="button"
                onClick={setActive}
                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground"
              >
                <CheckCircle2 size={12} />
                Définir comme actif
              </button>
            )}
            <button
              type="button"
              onClick={() => toast('Export PDF — bientôt disponible.', 'info')}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground"
            >
              <Download size={12} />
              Exporter PDF
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Save size={12} />
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={fork}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            <Copy size={12} />
            Dupliquer pour personnaliser
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: block list */}
        {data.isOwn && (
          <div className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-card p-3.5">
            <div className="mb-2.5 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              Blocs du bulletin
            </div>
            <p className="mb-2.5 text-[11px] text-muted-foreground">
              Glissez pour réorganiser les blocs
            </p>
            {orderedBlocks.map((b) => {
              const Icon = BLOCK_ICON[b.id];
              const draggable = REORDERABLE_BLOCK_IDS.includes(b.id);
              return (
                <div
                  key={b.id}
                  draggable={draggable}
                  onDragStart={() => draggable && setDragId(b.id)}
                  onDragOver={(e) => draggable && e.preventDefault()}
                  onDrop={() => draggable && reorder(b.id)}
                  onClick={() => setSelected(b.id)}
                  className={`mb-1 flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs font-medium ${
                    selected === b.id
                      ? 'border-primary/40 bg-secondary text-primary'
                      : 'border-border bg-background text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        draggable ? 'cursor-grab text-muted-foreground' : 'text-transparent'
                      }
                    >
                      <GripVertical size={13} />
                    </span>
                    <span className="flex h-6.5 w-6.5 items-center justify-center rounded bg-secondary">
                      <Icon size={13} style={{ color: 'var(--color-primary)' }} />
                    </span>
                    <span>{BLOCK_LABEL[b.id]}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleBlock(b.id);
                    }}
                    className={b.visible ? 'text-foreground' : 'text-muted-foreground opacity-40'}
                    aria-label={b.visible ? 'Masquer le bloc' : 'Afficher le bloc'}
                  >
                    <Eye size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Canvas */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-center gap-2 border-b border-border bg-card py-1.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(50, z - 10))}
              className="flex h-6.5 w-6.5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
              aria-label="Zoom arrière"
            >
              <ZoomOut size={13} />
            </button>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
              {zoom}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(200, z + 10))}
              className="flex h-6.5 w-6.5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
              aria-label="Zoom avant"
            >
              <ZoomIn size={13} />
            </button>
            {zoom !== 100 && (
              <button
                type="button"
                onClick={() => setZoom(100)}
                className="text-[11px] font-medium text-primary"
              >
                Réinitialiser
              </button>
            )}
          </div>
          <div className="flex flex-1 items-start justify-center overflow-auto bg-[#d8d8e8] p-7">
            <div style={{ width: previewWidth }}>
              <div className="mb-2 flex items-center justify-center gap-1.5 text-[11px] text-[#888]">
                <FileText size={12} />
                Format {config.pageFormat === 'LETTER' ? 'Letter' : 'A4'} ·{' '}
                {config.orientation === 'LANDSCAPE' ? 'Paysage' : 'Portrait'}
              </div>
              <div
                className="overflow-hidden rounded-[2px] bg-white shadow-2xl"
                style={{ width: previewWidth, height: previewHeight }}
              >
                <BulletinCanvas
                  config={config}
                  data={previewData}
                  selected={selected}
                  onSelect={setSelected}
                  chrome={false}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: properties */}
        {data.isOwn && (
          <div className="flex w-64 shrink-0 flex-col overflow-y-auto border-l border-border bg-card">
            <div className="border-b border-border p-3.5">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded bg-secondary">
                  {(() => {
                    const Icon = BLOCK_ICON[selected];
                    return <Icon size={14} style={{ color: 'var(--color-primary)' }} />;
                  })()}
                </span>
                <div>
                  <div className="text-[13px] font-bold text-foreground">
                    {BLOCK_LABEL[selected]}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Bloc sélectionné</div>
                </div>
              </div>
              <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
                {(['style', 'content', 'spacing'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPropTab(t)}
                    className={`flex-1 rounded px-1 py-1 text-[11px] font-medium ${propTab === t ? 'bg-card text-foreground' : 'text-muted-foreground'}`}
                  >
                    {t === 'style' ? 'Style' : t === 'content' ? 'Contenu' : 'Espacement'}
                  </button>
                ))}
              </div>
            </div>

            {propTab === 'style' && (
              <>
                <PropSection title="Couleurs du thème">
                  <PropRow label="Couleur principale">
                    <input
                      type="color"
                      value={config.primaryColor}
                      onChange={(e) => patchConfig({ primaryColor: e.target.value })}
                      className="h-5 w-8 cursor-pointer rounded border-none bg-transparent"
                    />
                  </PropRow>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {COLOR_SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => patchConfig({ primaryColor: c })}
                        style={{ background: c }}
                        className={`h-5 w-5 rounded ${config.primaryColor.toLowerCase() === c ? 'ring-2 ring-foreground ring-offset-1' : ''}`}
                        aria-label={c}
                      />
                    ))}
                  </div>
                </PropSection>

                <PropSection title="Typographie" last>
                  <PropNumberRow
                    label="Nom établissement"
                    value={config.typography.schoolName}
                    onChange={(v) =>
                      patchConfig({ typography: { ...config.typography, schoolName: v } })
                    }
                  />
                  <PropNumberRow
                    label="Titre bulletin"
                    value={config.typography.title}
                    onChange={(v) =>
                      patchConfig({ typography: { ...config.typography, title: v } })
                    }
                  />
                  <PropNumberRow
                    label="Corps tableau"
                    value={config.typography.tableBody}
                    onChange={(v) =>
                      patchConfig({ typography: { ...config.typography, tableBody: v } })
                    }
                  />
                </PropSection>
              </>
            )}

            {propTab === 'content' && (
              <>
                <PropSection title="Logo de l'établissement">
                  <ImageUploader
                    label="Logo"
                    hint="PNG, JPG ou WebP — 10 Mo max"
                    value={school?.logoUrl ?? null}
                    onChange={updateSchoolLogo}
                  />
                </PropSection>

                <PropSection title="Signature du directeur">
                  <ImageUploader
                    label="Signature"
                    hint="PNG, JPG ou WebP — 10 Mo max"
                    value={school?.directorSignatureUrl ?? null}
                    onChange={updateSchoolSignature}
                  />
                </PropSection>

                <PropSection title="Texte du bulletin">
                  <label
                    className="mb-1 block text-xs font-medium text-foreground"
                    htmlFor="content-title"
                  >
                    Titre du bulletin
                  </label>
                  <input
                    id="content-title"
                    type="text"
                    maxLength={60}
                    value={config.content.title}
                    onChange={(e) =>
                      patchConfig({ content: { ...config.content, title: e.target.value } })
                    }
                    className="mb-3 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                  />
                  <label
                    className="mb-1 block text-xs font-medium text-foreground"
                    htmlFor="content-footer"
                  >
                    Message de pied de page
                  </label>
                  <textarea
                    id="content-footer"
                    maxLength={200}
                    rows={3}
                    value={config.content.footerMessage ?? ''}
                    onChange={(e) =>
                      patchConfig({
                        content: { ...config.content, footerMessage: e.target.value || null },
                      })
                    }
                    className="w-full resize-none rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                    placeholder="Optionnel — ex. « Ensemble vers la réussite »"
                  />
                </PropSection>

                <PropSection title="Signatures">
                  <SwitchRow
                    label="Directeur"
                    checked={config.signatures.director}
                    onChange={(v) =>
                      patchConfig({ signatures: { ...config.signatures, director: v } })
                    }
                  />
                  <SwitchRow
                    label="Titulaire de classe"
                    checked={config.signatures.homeroom}
                    onChange={(v) =>
                      patchConfig({ signatures: { ...config.signatures, homeroom: v } })
                    }
                  />
                  <SwitchRow
                    label="Parent / Tuteur"
                    checked={config.signatures.guardian}
                    onChange={(v) =>
                      patchConfig({ signatures: { ...config.signatures, guardian: v } })
                    }
                  />
                </PropSection>

                <PropSection title="Colonnes du tableau" last>
                  <SwitchRow
                    label="Coeff."
                    checked={config.columns.coefficient}
                    onChange={(v) =>
                      patchConfig({ columns: { ...config.columns, coefficient: v } })
                    }
                  />
                  <SwitchRow
                    label="Moy. classe"
                    checked={config.columns.classAverage}
                    onChange={(v) =>
                      patchConfig({ columns: { ...config.columns, classAverage: v } })
                    }
                  />
                  <SwitchRow
                    label="Min. / Max."
                    checked={config.columns.minMax}
                    onChange={(v) => patchConfig({ columns: { ...config.columns, minMax: v } })}
                  />
                  <SwitchRow
                    label="Appréciation"
                    checked={config.columns.appreciation}
                    onChange={(v) =>
                      patchConfig({ columns: { ...config.columns, appreciation: v } })
                    }
                  />
                  <SwitchRow
                    label="Absences (statistiques)"
                    checked={config.columns.absences}
                    onChange={(v) => patchConfig({ columns: { ...config.columns, absences: v } })}
                  />
                  <SwitchRow
                    label="Rang (statistiques)"
                    checked={config.columns.rank}
                    onChange={(v) => patchConfig({ columns: { ...config.columns, rank: v } })}
                  />
                </PropSection>
              </>
            )}

            {propTab === 'spacing' && (
              <PropSection title="Espacement" last>
                <PropNumberRow
                  label="Marge de page (px)"
                  value={config.layout.pageMargin}
                  min={0}
                  max={48}
                  onChange={(v) => patchConfig({ layout: { ...config.layout, pageMargin: v } })}
                />
                <PropNumberRow
                  label="Espacement entre les blocs (px)"
                  value={config.layout.blockSpacing}
                  min={0}
                  max={32}
                  onChange={(v) => patchConfig({ layout: { ...config.layout, blockSpacing: v } })}
                />
                <PropNumberRow
                  label="Épaisseur de bordure (px)"
                  value={config.layout.borderWidth}
                  min={0}
                  max={4}
                  onChange={(v) => patchConfig({ layout: { ...config.layout, borderWidth: v } })}
                />
                <PropRow label="Couleur de bordure">
                  <input
                    type="color"
                    value={config.layout.borderColor}
                    onChange={(e) =>
                      patchConfig({ layout: { ...config.layout, borderColor: e.target.value } })
                    }
                    className="h-5 w-8 cursor-pointer rounded border-none bg-transparent"
                  />
                </PropRow>
              </PropSection>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PropSection({
  title,
  children,
  last = false,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`p-3.5 ${last ? '' : 'border-b border-border'}`}>
      <div className="mb-2.5 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
        {title}
      </div>
      {children}
    </div>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
    </div>
  );
}

function PropNumberRow({
  label,
  value,
  onChange,
  min = 8,
  max = 32,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <PropRow label={label}>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-14 rounded border-none bg-muted px-2 py-1 text-right text-xs text-foreground outline-none"
      />
    </PropRow>
  );
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-4.5 w-8 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted-foreground/40'}`}
        aria-pressed={checked}
      >
        <span
          className="absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all"
          style={{ left: checked ? '15px' : '2px' }}
        />
      </button>
    </div>
  );
}
