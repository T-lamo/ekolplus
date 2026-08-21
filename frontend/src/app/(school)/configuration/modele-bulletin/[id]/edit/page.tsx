'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Skeleton } from '@/components/ui/Skeleton';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { SignaturePad } from '@/components/ui/SignaturePad';
import {
  BulletinCanvas,
  getPageHeightPx,
  getPageWidthPx,
  type BulletinRenderData,
} from '@/components/bulletin/BulletinCanvas';
import { SAMPLE_BULLETIN_DATA } from '@/components/bulletin/sample-bulletin-data';
import { API_URL, COOKIE_PREFIX } from '@/lib/constants';
import { blockLabel } from '../../block-label';
import { REORDERABLE_BLOCK_IDS } from '../../types';
import type { BlockId, BulletinTemplateConfig, TemplateDetail } from '../../types';

// The editor preview renders BulletinCanvas at its TRUE natural page size
// (getPageWidthPx/getPageHeightPx — same 96dpi convention the PDF export
// uses, and the single source of truth BulletinCanvas itself relies on for
// its own min-height) and only ever visually scales it with CSS
// `transform: scale()` for zoom — it never resizes the actual box the
// content is laid out in. That distinction is what fixes the previous zoom
// bug: shrinking/growing the box itself while BulletinCanvas kept its
// natural DOM size caused clipping (zoom out) or dead whitespace (zoom in)
// instead of a faithful scaled reproduction.

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

type Tab = 'style' | 'content' | 'spacing';

export default function BulletinEditorPage() {
  const user = useUser();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const t = useTranslations('Configuration.modeleBulletin.editor');
  const tBlock = useTranslations('Configuration.modeleBulletin.block');
  const tBadge = useTranslations('Configuration.modeleBulletin.badge');
  const [data, setData] = useState<TemplateDetail | null>(null);
  const [config, setConfig] = useState<BulletinTemplateConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [selected, setSelected] = useState<BlockId>('header');
  const [propTab, setPropTab] = useState<Tab>('style');
  const [dragId, setDragId] = useState<BlockId | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [zoom, setZoom] = useState(100);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [school, setSchool] = useState<{
    logoUrl: string | null;
    directorSignatureUrl: string | null;
  } | null>(null);

  // Zoom level that shows the whole page inside the visible canvas area —
  // recomputed whenever the page format/orientation changes so the user
  // never has to manually zoom out to see the full page after switching
  // Portrait<->Paysage or A4<->Letter.
  const computeFitZoom = useCallback((): number => {
    const el = canvasContainerRef.current;
    if (!el || !config) return 100;
    const natW = getPageWidthPx(config);
    const natH = getPageHeightPx(config);
    const availW = el.clientWidth - 56;
    const availH = el.clientHeight - 96;
    if (availW <= 0 || availH <= 0) return 100;
    const fit = Math.min(availW / natW, availH / natH) * 100;
    return Math.max(20, Math.min(100, Math.floor(fit)));
  }, [config?.pageFormat, config?.orientation]);

  useEffect(() => {
    if (!config) return;
    setZoom(computeFitZoom());
    function handleResize() {
      setZoom(computeFitZoom());
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [config?.pageFormat, config?.orientation, computeFitZoom]);

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
          setError(t('notFound'));
          return;
        }
        setError(t('loadError'));
      });
  }, [user, params.id, t]);

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
      toast(t('toast.saved'), 'success');
    } catch {
      toast(t('toast.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function exportPdf() {
    if (!config) return;
    setExportingPdf(true);
    try {
      const escaped = COOKIE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}-csrf=([^;]*)`));
      const csrfToken = match?.[1] ? decodeURIComponent(match[1]) : null;
      const res = await fetch(`${API_URL}/api/school/bulletin-templates/${params.id}/preview-pdf`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `apercu-${(data?.name ?? 'modele-bulletin').replace(/\s+/g, '-').toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast(t('toast.exportError'), 'error');
    } finally {
      setExportingPdf(false);
    }
  }

  async function fork() {
    if (!data) return;
    try {
      const res = await api<{ template: { id: string } }>(
        `/api/school/bulletin-templates/${data.id}/fork`,
        { method: 'POST' },
      );
      toast(t('toast.forked'), 'success');
      router.push(`/configuration/modele-bulletin/${res.template.id}/edit`);
    } catch {
      toast(t('toast.forkError'), 'error');
    }
  }

  async function setActive() {
    if (!data) return;
    try {
      await api(`/api/school/bulletin-templates/${data.id}`, {
        method: 'PATCH',
        body: { isActive: true },
      });
      toast(t('toast.activated'), 'success');
      setData((d) => (d ? { ...d, isActive: true } : d));
    } catch {
      toast(t('toast.activateError'), 'error');
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
      toast(t('toast.renameError'), 'error');
    }
  }

  async function updateSchoolLogo(url: string | null) {
    setSchool((s) => (s ? { ...s, logoUrl: url } : s));
    try {
      await api('/api/school', { method: 'PUT', body: { logoUrl: url } });
    } catch {
      toast(t('toast.logoError'), 'error');
    }
  }

  async function updateSchoolSignature(url: string | null) {
    setSchool((s) => (s ? { ...s, directorSignatureUrl: url } : s));
    try {
      await api('/api/school', { method: 'PUT', body: { directorSignatureUrl: url } });
    } catch {
      toast(t('toast.signatureError'), 'error');
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
  // Natural (unscaled) page size in px — identical rules to the PDF export.
  const naturalSize = useMemo(() => {
    if (!config) return { width: 816, height: 1056 };
    return { width: getPageWidthPx(config), height: getPageHeightPx(config) };
  }, [config]);
  const scaledSize = {
    width: Math.round(naturalSize.width * (zoom / 100)),
    height: Math.round(naturalSize.height * (zoom / 100)),
  };

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-10 w-10 rounded-full" />
      </main>
    );
  }
  if (!data && !error) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
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
          {t('back')}
        </button>
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* This is a drag-and-drop block editor with a live WYSIWYG canvas
          rendered at true print pixel size plus a properties panel either
          side — a 3-column desktop tool that can't meaningfully reflow to a
          phone (unlike a list or a form, there's no "stack the columns"
          fallback that keeps it usable). Gated below `lg` rather than
          shipping a broken squeeze — user decision: hide what can't work
          instead of forcing it. */}
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center lg:hidden">
        <Monitor size={32} className="text-muted-foreground" />
        <p className="text-caption font-semibold text-foreground">{t('mobileGate.title')}</p>
        <p className="max-w-xs text-xs text-muted-foreground">{t('mobileGate.description')}</p>
        <button
          type="button"
          onClick={() => router.push('/configuration/modele-bulletin')}
          className="mt-1 flex items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground"
        >
          <ArrowLeft size={14} />
          {t('mobileGate.back')}
        </button>
      </div>

      <div className="hidden h-full flex-col overflow-hidden lg:flex">
        {/* Toolbar */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/configuration/modele-bulletin')}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground"
            >
              <ArrowLeft size={12} />
              {t('back')}
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
                  aria-label={t('nameAria')}
                  className="w-48 rounded border border-transparent bg-transparent px-1 py-0.5 text-caption font-semibold text-foreground outline-none hover:border-border focus:border-primary focus:bg-background"
                />
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-caption font-semibold text-foreground">
                <LayoutTemplate size={14} className="text-primary" />
                {data.name}
              </div>
            )}
            {data.isActive && (
              <span className="flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-2xs font-semibold text-success-foreground">
                <CheckCircle2 size={10} />
                {tBadge('active')}
              </span>
            )}
            {!data.isOwn && (
              <span className="flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-2xs font-semibold text-warning-foreground">
                {t('readOnlyBadge')}
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
                  {t('orientation.landscape')}
                </button>
                <button
                  type="button"
                  onClick={() => patchConfig({ orientation: 'PORTRAIT' })}
                  className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium ${config.orientation === 'PORTRAIT' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
                >
                  <Smartphone size={12} />
                  {t('orientation.portrait')}
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
                  {t('setActive')}
                </button>
              )}
              <button
                type="button"
                onClick={exportPdf}
                disabled={exportingPdf}
                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-60"
              >
                <Download size={12} />
                {exportingPdf ? t('exporting') : t('exportPdf')}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                <Save size={12} />
                {saving ? t('saving') : t('save')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={fork}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              <Copy size={12} />
              {t('forkToCustomize')}
            </button>
          )}
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: block list */}
          {data.isOwn && (
            <div className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-card p-3.5">
              <div className="mb-2.5 text-2xs font-bold tracking-wide text-muted-foreground uppercase">
                {t('blocksPanel.title')}
              </div>
              <p className="mb-2.5 text-2xs text-muted-foreground">{t('blocksPanel.hint')}</p>
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
                    onDragEnd={() => setDragId(null)}
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
                      <span>{blockLabel(b.id, tBlock)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBlock(b.id);
                      }}
                      className={b.visible ? 'text-foreground' : 'text-muted-foreground opacity-40'}
                      aria-label={
                        b.visible ? t('blocksPanel.hideBlock') : t('blocksPanel.showBlock')
                      }
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
                aria-label={t('zoomOut')}
              >
                <ZoomOut size={13} />
              </button>
              <span className="rounded-md bg-muted px-2 py-0.5 text-2xs font-medium text-foreground">
                {zoom}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(200, z + 10))}
                className="flex h-6.5 w-6.5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                aria-label={t('zoomIn')}
              >
                <ZoomIn size={13} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(computeFitZoom())}
                className="text-2xs font-medium text-primary"
              >
                {t('fitToPage')}
              </button>
            </div>
            <div
              ref={canvasContainerRef}
              className="flex flex-1 items-start justify-center overflow-auto bg-[#d8d8e8] p-7"
            >
              <div style={{ width: scaledSize.width }}>
                <div className="mb-2 flex items-center justify-center gap-1.5 text-2xs text-[#888]">
                  <FileText size={12} />
                  {t('formatLine', {
                    format: config.pageFormat === 'LETTER' ? 'Letter' : 'A4',
                    orientation:
                      config.orientation === 'LANDSCAPE'
                        ? t('orientation.landscape')
                        : t('orientation.portrait'),
                  })}
                </div>
                {/* Outer div reserves the SCALED footprint so the scroll area
                  sizes correctly; the inner div is the real page at its
                  natural (unscaled) size — transform:scale only changes how
                  it's painted, never its layout box, so nothing inside
                  BulletinCanvas ever reflows, clips, or overlaps at any
                  zoom level. overflow stays visible (no overflow-hidden) so
                  content taller than one physical page is never silently
                  cropped — it's visible below the page edge instead. */}
                <div style={{ width: scaledSize.width, height: scaledSize.height }}>
                  <div
                    className="rounded-[2px] bg-white shadow-2xl"
                    style={{
                      width: naturalSize.width,
                      height: naturalSize.height,
                      transform: `scale(${zoom / 100})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <BulletinCanvas
                      config={config}
                      data={previewData}
                      selected={selected}
                      onSelect={setSelected}
                      chrome={false}
                      dragId={dragId}
                      onDragStart={setDragId}
                      onDrop={reorder}
                      onDragEnd={() => setDragId(null)}
                    />
                  </div>
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
                    <div className="text-caption font-bold text-foreground">
                      {blockLabel(selected, tBlock)}
                    </div>
                    <div className="text-2xs text-muted-foreground">{t('selectedBlock')}</div>
                  </div>
                </div>
                <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
                  {(['style', 'content', 'spacing'] as Tab[]).map((tabKey) => (
                    <button
                      key={tabKey}
                      type="button"
                      onClick={() => setPropTab(tabKey)}
                      className={`flex-1 rounded px-1 py-1 text-2xs font-medium ${propTab === tabKey ? 'bg-card text-foreground' : 'text-muted-foreground'}`}
                    >
                      {t(`tabs.${tabKey}`)}
                    </button>
                  ))}
                </div>
              </div>

              {propTab === 'style' && (
                <>
                  <PropSection title={t('style.colorsTitle')}>
                    <PropRow label={t('style.primaryColor')}>
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

                  <PropSection title={t('style.typographyTitle')} last>
                    <PropSliderRow
                      label={t('style.schoolName')}
                      value={config.typography.schoolName}
                      min={8}
                      max={32}
                      suffix="px"
                      onChange={(v) =>
                        patchConfig({ typography: { ...config.typography, schoolName: v } })
                      }
                    />
                    <PropSliderRow
                      label={t('style.titleSize')}
                      value={config.typography.title}
                      min={8}
                      max={32}
                      suffix="px"
                      onChange={(v) =>
                        patchConfig({ typography: { ...config.typography, title: v } })
                      }
                    />
                    <PropSliderRow
                      label={t('style.tableBody')}
                      value={config.typography.tableBody}
                      min={8}
                      max={24}
                      suffix="px"
                      onChange={(v) =>
                        patchConfig({ typography: { ...config.typography, tableBody: v } })
                      }
                    />
                    <PropSliderRow
                      label={t('style.tableHeader')}
                      value={config.typography.tableHeader}
                      min={8}
                      max={16}
                      suffix="px"
                      onChange={(v) =>
                        patchConfig({ typography: { ...config.typography, tableHeader: v } })
                      }
                    />
                    <PropSliderRow
                      label={t('style.noteValue')}
                      value={config.typography.noteValue}
                      min={8}
                      max={20}
                      suffix="px"
                      onChange={(v) =>
                        patchConfig({ typography: { ...config.typography, noteValue: v } })
                      }
                    />
                    <PropSliderRow
                      label={t('style.footer')}
                      value={config.typography.footer}
                      min={6}
                      max={14}
                      suffix="px"
                      onChange={(v) =>
                        patchConfig({ typography: { ...config.typography, footer: v } })
                      }
                    />
                  </PropSection>
                </>
              )}

              {propTab === 'content' && (
                <>
                  <PropSection title={t('content.logoTitle')}>
                    <ImageUploader
                      label={t('content.logoLabel')}
                      hint={t('content.imageHint')}
                      value={school?.logoUrl ?? null}
                      onChange={updateSchoolLogo}
                    />
                    <PropSliderRow
                      label={t('content.logoSizeLabel')}
                      value={config.layout.logoSize ?? 52}
                      min={32}
                      max={96}
                      suffix="px"
                      onChange={(v) => patchConfig({ layout: { ...config.layout, logoSize: v } })}
                    />
                  </PropSection>

                  <PropSection title={t('content.signatureTitle')}>
                    <SignaturePad
                      label={t('content.signatureLabel')}
                      hint={t('content.imageHint')}
                      value={school?.directorSignatureUrl ?? null}
                      onChange={updateSchoolSignature}
                    />
                    <PropSliderRow
                      label={t('content.signatureSizeLabel')}
                      value={config.layout.signatureSize ?? 32}
                      min={20}
                      max={64}
                      suffix="px"
                      onChange={(v) =>
                        patchConfig({ layout: { ...config.layout, signatureSize: v } })
                      }
                    />
                  </PropSection>

                  <PropSection title={t('content.textTitle')}>
                    <label
                      className="mb-1 block text-xs font-medium text-foreground"
                      htmlFor="content-title"
                    >
                      {t('content.titleLabel')}
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
                      {t('content.footerLabel')}
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
                      placeholder={t('content.footerPlaceholder')}
                    />
                  </PropSection>

                  <PropSection title={t('content.signaturesTitle')}>
                    <SwitchRow
                      label={t('content.signatureDirector')}
                      checked={config.signatures.director}
                      onChange={(v) =>
                        patchConfig({ signatures: { ...config.signatures, director: v } })
                      }
                    />
                    <SwitchRow
                      label={t('content.signatureHomeroom')}
                      checked={config.signatures.homeroom}
                      onChange={(v) =>
                        patchConfig({ signatures: { ...config.signatures, homeroom: v } })
                      }
                    />
                    <SwitchRow
                      label={t('content.signatureGuardian')}
                      checked={config.signatures.guardian}
                      onChange={(v) =>
                        patchConfig({ signatures: { ...config.signatures, guardian: v } })
                      }
                    />
                  </PropSection>

                  <PropSection title={t('content.columnsTitle')} last>
                    <SwitchRow
                      label={t('content.colCoefficient')}
                      checked={config.columns.coefficient}
                      onChange={(v) =>
                        patchConfig({ columns: { ...config.columns, coefficient: v } })
                      }
                    />
                    <SwitchRow
                      label={t('content.colClassAverage')}
                      checked={config.columns.classAverage}
                      onChange={(v) =>
                        patchConfig({ columns: { ...config.columns, classAverage: v } })
                      }
                    />
                    <SwitchRow
                      label={t('content.colMinMax')}
                      checked={config.columns.minMax}
                      onChange={(v) => patchConfig({ columns: { ...config.columns, minMax: v } })}
                    />
                    <SwitchRow
                      label={t('content.colAppreciation')}
                      checked={config.columns.appreciation}
                      onChange={(v) =>
                        patchConfig({ columns: { ...config.columns, appreciation: v } })
                      }
                    />
                    <SwitchRow
                      label={t('content.colAbsences')}
                      checked={config.columns.absences}
                      onChange={(v) => patchConfig({ columns: { ...config.columns, absences: v } })}
                    />
                    <SwitchRow
                      label={t('content.colRank')}
                      checked={config.columns.rank}
                      onChange={(v) => patchConfig({ columns: { ...config.columns, rank: v } })}
                    />
                  </PropSection>
                </>
              )}

              {propTab === 'spacing' && (
                <>
                  <PropSection title={t('spacing.layoutTitle')}>
                    <PropNumberRow
                      label={t('spacing.pageMargin')}
                      value={config.layout.pageMargin}
                      min={0}
                      max={48}
                      onChange={(v) => patchConfig({ layout: { ...config.layout, pageMargin: v } })}
                    />
                    <PropNumberRow
                      label={t('spacing.blockSpacing')}
                      value={config.layout.blockSpacing}
                      min={0}
                      max={32}
                      onChange={(v) =>
                        patchConfig({ layout: { ...config.layout, blockSpacing: v } })
                      }
                    />
                  </PropSection>

                  <PropSection title={t('spacing.tableTitle')} last>
                    <PropSliderRow
                      label={t('spacing.cellPaddingX')}
                      value={config.layout.cellPaddingX}
                      min={0}
                      max={24}
                      suffix="px"
                      onChange={(v) =>
                        patchConfig({ layout: { ...config.layout, cellPaddingX: v } })
                      }
                    />
                    <PropSliderRow
                      label={t('spacing.cellPaddingY')}
                      value={config.layout.cellPaddingY}
                      min={0}
                      max={16}
                      suffix="px"
                      onChange={(v) =>
                        patchConfig({ layout: { ...config.layout, cellPaddingY: v } })
                      }
                    />
                    <PropSliderRow
                      label={t('spacing.lineHeight')}
                      value={config.layout.tableLineHeight}
                      min={1}
                      max={2.4}
                      step={0.1}
                      onChange={(v) =>
                        patchConfig({ layout: { ...config.layout, tableLineHeight: v } })
                      }
                    />
                    <PropNumberRow
                      label={t('spacing.borderWidth')}
                      value={config.layout.borderWidth}
                      min={0}
                      max={4}
                      onChange={(v) =>
                        patchConfig({ layout: { ...config.layout, borderWidth: v } })
                      }
                    />
                    <PropSelectRow
                      label={t('spacing.borderStyleLabel')}
                      value={config.layout.borderStyle}
                      options={[
                        { value: 'solid', label: t('spacing.borderStyle.solid') },
                        { value: 'dashed', label: t('spacing.borderStyle.dashed') },
                        { value: 'dotted', label: t('spacing.borderStyle.dotted') },
                      ]}
                      onChange={(v) =>
                        patchConfig({
                          layout: {
                            ...config.layout,
                            borderStyle: v as BulletinTemplateConfig['layout']['borderStyle'],
                          },
                        })
                      }
                    />
                    <PropRow label={t('spacing.borderColor')}>
                      <input
                        type="color"
                        value={config.layout.borderColor}
                        onChange={(e) =>
                          patchConfig({ layout: { ...config.layout, borderColor: e.target.value } })
                        }
                        className="h-5 w-8 cursor-pointer rounded border-none bg-transparent"
                      />
                    </PropRow>
                    <SwitchRow
                      label={t('spacing.showBackgrounds')}
                      checked={config.layout.showTableBackgrounds}
                      onChange={(v) =>
                        patchConfig({ layout: { ...config.layout, showTableBackgrounds: v } })
                      }
                    />
                  </PropSection>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
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
      <div className="mb-2.5 text-2xs font-bold tracking-wide text-muted-foreground uppercase">
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

function PropSliderRow({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = '',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-2xs text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

function PropSelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <PropRow label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border-none bg-muted px-2 py-1 text-xs text-foreground outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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
