'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Save,
  Download,
  Eye,
  LayoutTemplate,
  GripVertical,
  CheckCircle2,
  Copy,
  FileText,
  Monitor,
  Smartphone,
  ZoomIn,
  ZoomOut,
  Plus,
  Trash2,
  RectangleHorizontal,
  Columns2,
  PanelRight,
  Palette,
  MoveHorizontal,
  Component,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Square,
  SeparatorHorizontal,
  SquareDashed,
  SquareRoundCorner,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BareSelect, SelectItem } from '@/components/school/subjects/form-primitives';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Skeleton } from '@/components/ui/Skeleton';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { SignaturePad } from '@/components/ui/SignaturePad';
import { BulletinPage as BulletinPageCanvas } from '@/components/bulletin/BulletinPage';
import { getPageHeightPx, getPageWidthPx } from '@/components/bulletin/page-size';
import { Modal } from '@/components/ui/Modal';
import { RichTextEditor, richTextSummary } from '@/components/ui/RichTextEditor';
import { richTextFromPlain, richTextToPlain } from '@/components/bulletin/rich-text';
import type { BulletinRenderData } from '@/components/bulletin/render-data';
import { SAMPLE_BULLETIN_DATA } from '@/components/bulletin/sample-bulletin-data';
import { API_URL, COOKIE_PREFIX } from '@/lib/constants';
import { blockLabel } from '../../block-label';
import { BLOCK_TYPES, LEGACY_BLOCK_TYPES, DRAGGABLE_BLOCK_TYPES } from '../../types';
import type { Block, BlockType, BulletinTemplateConfig, TemplateDetail } from '../../types';

// The editor preview renders the current page's BulletinPage at its TRUE
// natural page size (getPageWidthPx/getPageHeightPx — same 96dpi convention
// the PDF export uses, and the single source of truth BulletinPage itself
// relies on for its own min-height) and only ever visually scales it with
// CSS `transform: scale()` for zoom — it never resizes the actual box the
// content is laid out in. That distinction is what fixes the previous zoom
// bug: shrinking/growing the box itself while BulletinPage kept its
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

type Tab = 'style' | 'content' | 'spacing' | 'block';

const TAB_ICON: Record<Tab, LucideIcon> = {
  style: Palette,
  content: FileText,
  spacing: MoveHorizontal,
  block: Component,
};

export default function BulletinEditorPage() {
  const user = useUser();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const t = useTranslations('Configuration.modeleBulletin.editor');
  const tBlock = useTranslations('Configuration.modeleBulletin.block');
  const tBadge = useTranslations('Configuration.modeleBulletin.badge');
  const tRich = useTranslations('Common.richText');
  const [config, setConfig] = useState<BulletinTemplateConfig | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  // The free-text block edits in a modal: the side panel is too narrow for
  // a toolbar plus a comfortable writing surface.
  const [textEditorOpen, setTextEditorOpen] = useState(false);
  const [selected, setSelected] = useState<{ pageId: string; blockId: string } | null>(null);
  const [propTab, setPropTab] = useState<Tab>('style');
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [zoom, setZoom] = useState(100);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  // Every page is painted in the canvas, one under the other; this map holds
  // each sheet's natural-size element (overflow check, scroll-to-page).
  const pageRefs = useRef(new Map<string, HTMLDivElement>());
  const [overflowingPages, setOverflowingPages] = useState<Set<string>>(new Set());

  const { data, mutate: mutateData } = useApi<TemplateDetail>(
    `/api/school/bulletin-templates/${params.id}`,
    {
      skip: !user,
      onError: (err) => {
        setDetailError(
          err instanceof ApiError && err.status === 404 ? t('notFound') : t('loadError'),
        );
        return true;
      },
    },
  );
  const error = detailError;
  const { data: schoolData, mutate: mutateSchoolData } = useApi<{
    school: { logoUrl: string | null; directorSignatureUrl: string | null };
  }>('/api/school', { skip: !user });
  const school = schoolData?.school ?? null;

  // `config`/`nameInput` are a working copy the user actively edits before
  // Save — seeded once per template id, never resynced from a later
  // background revalidation of the cached read (which would otherwise
  // silently overwrite in-progress unsaved edits).
  const seededForId = useRef<string | null>(null);
  useEffect(() => {
    if (data && seededForId.current !== params.id) {
      setConfig(data.config);
      setNameInput(data.name);
      seededForId.current = params.id;
      const firstPage = data.config.pages[0];
      if (firstPage) {
        setCurrentPageId(firstPage.id);
        setSelected({ pageId: firstPage.id, blockId: firstPage.blocks[0]?.id ?? firstPage.id });
      }
    }
  }, [data, params.id]);

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

  function patchConfig(patch: Partial<BulletinTemplateConfig>) {
    setConfig((c) => (c ? { ...c, ...patch } : c));
  }

  function patchPage(pageId: string, patch: Partial<BulletinTemplateConfig['pages'][number]>) {
    setConfig((c) =>
      c ? { ...c, pages: c.pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)) } : c,
    );
  }

  function toggleBlock(pageId: string, blockId: string) {
    setConfig((c) =>
      c
        ? {
            ...c,
            pages: c.pages.map((p) =>
              p.id !== pageId
                ? p
                : {
                    ...p,
                    blocks: p.blocks.map((b) =>
                      b.id === blockId ? { ...b, visible: !b.visible } : b,
                    ),
                  },
            ),
          }
        : c,
    );
  }

  function reorder(pageId: string, targetBlockId: string) {
    if (!dragBlockId || dragBlockId === targetBlockId || !config) return;
    const page = config.pages.find((p) => p.id === pageId);
    if (!page) return;
    const blocks = [...page.blocks];
    const from = blocks.findIndex((b) => b.id === dragBlockId);
    const to = blocks.findIndex((b) => b.id === targetBlockId);
    if (from < 0 || to < 0) return;
    const [moved] = blocks.splice(from, 1);
    if (!moved) return;
    blocks.splice(to, 0, moved);
    patchPage(pageId, { blocks });
  }

  function addBlock(pageId: string, type: BlockType) {
    setConfig((c) => {
      if (!c) return c;
      const page = c.pages.find((p) => p.id === pageId);
      if (!page) return c;
      const id = `${type}-${Date.now()}`;
      const newBlock: Block =
        type === 'text'
          ? {
              id,
              type,
              visible: true,
              text: '',
              align: 'left',
              fontSize: 12,
              bold: false,
              italic: false,
            }
          : type === 'cover'
            ? {
                id,
                type,
                visible: true,
                sectionLabel: '',
                titlePattern: 'Bulletin du {term}',
                showLogo: true,
                framed: true,
                fields: ['lastName', 'firstName', 'className'],
              }
            : type === 'criteriaGrids'
              ? { id, type, visible: true, showScaleHeader: true }
              : ({ id, type, visible: true } as Block);
      return {
        ...c,
        pages: c.pages.map((p) =>
          p.id === pageId ? { ...p, blocks: [...p.blocks, newBlock] } : p,
        ),
      };
    });
  }

  function removeBlock(pageId: string, blockId: string) {
    setConfig((c) => {
      if (!c) return c;
      const page = c.pages.find((p) => p.id === pageId);
      // pageSchema.blocks is .min(1) server-side: removing a page's last
      // remaining block would build a config the editor's own schema
      // rejects on save, with nothing to tell the user which page/field
      // broke. Mirrors deletePage's last-page guard below.
      if (!page || page.blocks.length <= 1) return c;
      return {
        ...c,
        pages: c.pages.map((p) =>
          p.id !== pageId ? p : { ...p, blocks: p.blocks.filter((b) => b.id !== blockId) },
        ),
      };
    });
  }

  function patchBlock(pageId: string, blockId: string, patch: Partial<Block>) {
    setConfig((c) =>
      c
        ? {
            ...c,
            pages: c.pages.map((p) =>
              p.id !== pageId
                ? p
                : {
                    ...p,
                    blocks: p.blocks.map((b) =>
                      b.id === blockId ? ({ ...b, ...patch } as Block) : b,
                    ),
                  },
            ),
          }
        : c,
    );
  }

  function addPage() {
    setConfig((c) => {
      if (!c || c.pages.length >= 6) return c;
      const id = `page-${Date.now()}`;
      const newPage = {
        id,
        layout: 'full' as const,
        showPageNumber: false,
        blocks: [
          {
            id: `text-${Date.now()}`,
            type: 'text' as const,
            visible: true,
            text: '',
            align: 'left' as const,
            fontSize: 12,
            bold: false,
            italic: false,
          },
        ],
      };
      setCurrentPageId(id);
      return { ...c, pages: [...c.pages, newPage] };
    });
  }

  function duplicatePage(pageId: string) {
    setConfig((c) => {
      if (!c || c.pages.length >= 6) return c;
      const source = c.pages.find((p) => p.id === pageId);
      if (!source) return c;
      // Fresh ids from a stable base (matching addPage()/addBlock()'s own
      // convention) rather than appending a `-copy-${Date.now()}` suffix to
      // the source id: chain-duplicating a duplicate compounded that suffix
      // every time and blew past the schema's 60-char id cap by the 3rd
      // nesting, silently rejecting the whole PATCH.
      const now = Date.now();
      const copy = {
        ...source,
        id: `page-${now}`,
        blocks: source.blocks.map((b, i) => ({ ...b, id: `${b.type}-${now}-${i}` })),
      };
      setCurrentPageId(copy.id);
      const index = c.pages.findIndex((p) => p.id === pageId);
      const pages = [...c.pages];
      pages.splice(index + 1, 0, copy);
      return { ...c, pages };
    });
  }

  function deletePage(pageId: string) {
    setConfig((c) => {
      if (!c || c.pages.length <= 1) return c;
      const index = c.pages.findIndex((p) => p.id === pageId);
      const pages = c.pages.filter((p) => p.id !== pageId);
      const fallback = pages[Math.max(0, index - 1)];
      if (fallback) setCurrentPageId(fallback.id);
      return { ...c, pages };
    });
  }

  const BLOCK_TAB_TYPES: BlockType[] = [
    'appreciation',
    'signatures',
    'text',
    'cover',
    'criteriaGrids',
    'yearGrid',
    'yearDecisions',
    'yearSignatures',
  ];
  const selectedBlock = config?.pages
    .find((p) => p.id === selected?.pageId)
    ?.blocks.find((b) => b.id === selected?.blockId);
  const showBlockTab = selectedBlock != null && BLOCK_TAB_TYPES.includes(selectedBlock.type);

  useEffect(() => {
    if (propTab === 'block' && !showBlockTab) setPropTab('style');
  }, [propTab, showBlockTab]);

  useEffect(() => {
    if (!config) return;
    const natH = getPageHeightPx(config);
    // halves pages give the sheet a definite height with column-fill: auto
    // (BulletinPage.tsx), so content that doesn't fit no longer grows the
    // sheet vertically — per the CSS multicol spec it spills into extra
    // columns on the inline (horizontal) axis instead. Check scrollWidth
    // too so that overflow still trips the warning for halves pages.
    const natW = getPageWidthPx(config);
    setOverflowingPages((prev) => {
      const next = new Set<string>();
      for (const page of config.pages) {
        const el = pageRefs.current.get(page.id);
        if (!el) continue;
        if (el.scrollHeight > natH || el.scrollWidth > natW) next.add(page.id);
      }
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, [config, zoom]);

  // The page the user is looking at drives the left panel (its blocks, its
  // layout): as the canvas scrolls past a sheet, the most visible one becomes
  // the current page, so the panel follows the scroll instead of a page tab.
  useEffect(() => {
    const root = canvasContainerRef.current;
    if (!root || !config) return;
    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.pageId;
          if (id) ratios.set(id, entry.intersectionRatio);
        }
        let best: { id: string; ratio: number } | null = null;
        for (const [id, ratio] of ratios) {
          if (!best || ratio > best.ratio) best = { id, ratio };
        }
        if (best && best.ratio > 0) setCurrentPageId(best.id);
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const page of config.pages) {
      const el = pageRefs.current.get(page.id)?.parentElement;
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [config?.pages, zoom]);

  function scrollToPage(pageId: string) {
    pageRefs.current
      .get(pageId)
      ?.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      mutateData({ ...data, isActive: true });
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
    mutateData({ ...data, name: trimmed });
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
    if (school) mutateSchoolData({ school: { ...school, logoUrl: url } });
    try {
      await api('/api/school', { method: 'PUT', body: { logoUrl: url } });
    } catch {
      toast(t('toast.logoError'), 'error');
    }
  }

  async function updateSchoolSignature(url: string | null) {
    if (school) mutateSchoolData({ school: { ...school, directorSignatureUrl: url } });
    try {
      await api('/api/school', { method: 'PUT', body: { directorSignatureUrl: url } });
    } catch {
      toast(t('toast.signatureError'), 'error');
    }
  }

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
          {/* Left: pages + current page's blocks */}
          {data.isOwn && config && (
            <div className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-card p-3.5">
              <div className="mb-2.5 text-2xs font-bold tracking-wide text-muted-foreground uppercase">
                {t('pagesPanel.title')}
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {config.pages.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setCurrentPageId(p.id);
                      setSelected(null);
                      scrollToPage(p.id);
                    }}
                    className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium ${
                      currentPageId === p.id
                        ? 'border-primary/40 bg-secondary text-primary'
                        : 'border-border bg-background text-foreground'
                    }`}
                  >
                    {t('pagesPanel.pageLabel', { n: i + 1 })}
                    {overflowingPages.has(p.id) && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-warning"
                        title={t('pagesPanel.overflowWarning')}
                      />
                    )}
                  </button>
                ))}
              </div>
              <div className="mb-3 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={addPage}
                  disabled={config.pages.length >= 6}
                  title={t('pagesPanel.addPage')}
                  aria-label={t('pagesPanel.addPage')}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40"
                >
                  <Plus size={15} />
                </button>
                {currentPageId && (
                  <>
                    <button
                      type="button"
                      onClick={() => duplicatePage(currentPageId)}
                      disabled={config.pages.length >= 6}
                      title={t('pagesPanel.duplicatePage')}
                      aria-label={t('pagesPanel.duplicatePage')}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePage(currentPageId)}
                      disabled={config.pages.length <= 1}
                      title={t('pagesPanel.deletePage')}
                      aria-label={t('pagesPanel.deletePage')}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-destructive-foreground hover:bg-destructive/10 disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>

              {currentPageId &&
                (() => {
                  const page = config.pages.find((p) => p.id === currentPageId);
                  if (!page) return null;
                  return (
                    <>
                      <div className="mb-3 flex flex-col gap-2 border-b border-border pb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">
                            {t('pagesPanel.layoutLabel')}
                          </span>
                          <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
                            {(
                              [
                                ['full', t('pagesPanel.layoutFull'), RectangleHorizontal],
                                ['halves', t('pagesPanel.layoutHalves'), Columns2],
                                ['sidebar', t('pagesPanel.layoutSidebar'), PanelRight],
                              ] as const
                            ).map(([layout, label, Icon]) => (
                              <button
                                key={layout}
                                type="button"
                                onClick={() => patchPage(page.id, { layout })}
                                title={label}
                                aria-label={label}
                                aria-pressed={page.layout === layout}
                                className={`flex h-7 w-8 items-center justify-center rounded ${page.layout === layout ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                              >
                                <Icon size={15} />
                              </button>
                            ))}
                          </div>
                        </div>
                        <SwitchRow
                          label={t('pagesPanel.showPageNumber')}
                          checked={page.showPageNumber}
                          onChange={(v) => patchPage(page.id, { showPageNumber: v })}
                        />
                        {page.layout === 'sidebar' && (
                          <PropSliderRow
                            label={t('pagesPanel.asideWidth')}
                            value={page.asideWidth ?? 25}
                            min={15}
                            max={50}
                            suffix="%"
                            onChange={(v) => patchPage(page.id, { asideWidth: v })}
                          />
                        )}
                      </div>

                      <p className="mb-2.5 text-2xs text-muted-foreground">
                        {t('blocksPanel.hint')}
                      </p>
                      {page.blocks.map((b) => {
                        const draggable = DRAGGABLE_BLOCK_TYPES.includes(b.type);
                        const isLegacy = (LEGACY_BLOCK_TYPES as readonly string[]).includes(b.type);
                        return (
                          <div
                            key={b.id}
                            draggable={draggable}
                            onDragStart={() => draggable && setDragBlockId(b.id)}
                            onDragOver={(e) => draggable && e.preventDefault()}
                            onDrop={() => draggable && reorder(page.id, b.id)}
                            onDragEnd={() => setDragBlockId(null)}
                            onClick={() => setSelected({ pageId: page.id, blockId: b.id })}
                            className={`mb-1 flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs font-medium ${
                              selected?.pageId === page.id && selected.blockId === b.id
                                ? 'border-primary/40 bg-secondary text-primary'
                                : 'border-border bg-background text-foreground'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={
                                  draggable
                                    ? 'cursor-grab text-muted-foreground'
                                    : 'text-transparent'
                                }
                              >
                                <GripVertical size={13} />
                              </span>
                              <span>{blockLabel(b.type, tBlock)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleBlock(page.id, b.id);
                                }}
                                className={
                                  b.visible ? 'text-foreground' : 'text-muted-foreground opacity-40'
                                }
                                aria-label={
                                  b.visible
                                    ? t('blocksPanel.hideBlock')
                                    : t('blocksPanel.showBlock')
                                }
                              >
                                <Eye size={12} />
                              </button>
                              {!isLegacy && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeBlock(page.id, b.id);
                                    if (selected?.blockId === b.id) setSelected(null);
                                  }}
                                  disabled={page.blocks.length <= 1}
                                  className="text-muted-foreground disabled:opacity-40"
                                  aria-label={t('blocksPanel.removeBlock')}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      <div className="mt-3 border-t border-border pt-3">
                        <div className="mb-2 text-2xs font-bold tracking-wide text-muted-foreground uppercase">
                          {t('blockPalette.title')}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {BLOCK_TYPES.map((type) => {
                            const isLegacy = (LEGACY_BLOCK_TYPES as readonly string[]).includes(
                              type,
                            );
                            const alreadyPresent =
                              isLegacy && page.blocks.some((b) => b.type === type);
                            return (
                              <button
                                key={type}
                                type="button"
                                disabled={alreadyPresent}
                                title={alreadyPresent ? t('blockPalette.alreadyOnPage') : undefined}
                                onClick={() => addBlock(page.id, type)}
                                className="rounded-md border border-border bg-background px-2 py-1 text-2xs font-medium text-foreground disabled:opacity-30"
                              >
                                {blockLabel(type, tBlock)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  );
                })()}
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
                  BulletinPageCanvas ever reflows, clips, or overlaps at any
                  zoom level. overflow stays visible (no overflow-hidden) so
                  content taller than one physical page is never silently
                  cropped — it's visible below the page edge instead. */}
                {/* Every page of the template, one under the other, so the
                  whole document is read by scrolling; the page tabs on the
                  left only jump to a sheet. */}
                {config.pages.map((page, pageIndex) => (
                  <div key={page.id} className={pageIndex > 0 ? 'mt-6' : undefined}>
                    {config.pages.length > 1 && (
                      <div
                        className={`mb-1.5 text-2xs font-medium ${currentPageId === page.id ? 'text-primary' : 'text-[#888]'}`}
                      >
                        {t('pagesPanel.pageLabel', { n: pageIndex + 1 })}
                      </div>
                    )}
                    <div
                      data-page-id={page.id}
                      style={{ width: scaledSize.width, height: scaledSize.height }}
                    >
                      <div
                        ref={(el) => {
                          if (el) pageRefs.current.set(page.id, el);
                          else pageRefs.current.delete(page.id);
                        }}
                        className={`rounded-[2px] bg-white shadow-2xl ${currentPageId === page.id && config.pages.length > 1 ? 'ring-2 ring-primary/40' : ''}`}
                        style={{
                          width: naturalSize.width,
                          height: naturalSize.height,
                          transform: `scale(${zoom / 100})`,
                          transformOrigin: 'top left',
                        }}
                      >
                        <BulletinPageCanvas
                          page={page}
                          pageIndex={pageIndex}
                          totalPages={config.pages.length}
                          config={config}
                          data={previewData}
                          chrome={false}
                          selected={selected ?? undefined}
                          onSelect={(pageId, blockId) => {
                            setCurrentPageId(pageId);
                            setSelected({ pageId, blockId });
                          }}
                          dragBlockId={dragBlockId}
                          onDragStart={setDragBlockId}
                          onDrop={(blockId) => reorder(page.id, blockId)}
                          onDragEnd={() => setDragBlockId(null)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: properties */}
          {data.isOwn && (
            <div className="flex w-64 shrink-0 flex-col overflow-y-auto border-l border-border bg-card">
              <div className="border-b border-border p-3.5">
                <div className="mb-3 flex items-center gap-2">
                  <div>
                    <div className="text-caption font-bold text-foreground">
                      {selectedBlock ? blockLabel(selectedBlock.type, tBlock) : ''}
                    </div>
                    <div className="text-2xs text-muted-foreground">{t('selectedBlock')}</div>
                  </div>
                </div>
                <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
                  {(
                    [
                      'style',
                      'content',
                      'spacing',
                      ...(showBlockTab ? (['block'] as const) : []),
                    ] as Tab[]
                  ).map((tabKey) => {
                    const Icon = TAB_ICON[tabKey];
                    const label = t(`tabs.${tabKey}`);
                    return (
                      <button
                        key={tabKey}
                        type="button"
                        title={label}
                        aria-label={label}
                        aria-pressed={propTab === tabKey}
                        onClick={() => setPropTab(tabKey)}
                        className={`flex flex-1 items-center justify-center rounded px-1 py-1.5 ${propTab === tabKey ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        <Icon size={15} />
                      </button>
                    );
                  })}
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
                    <PropIconRow
                      label={t('spacing.borderStyleLabel')}
                      value={config.layout.borderStyle}
                      options={[
                        {
                          value: 'solid',
                          icon: (p2) => <BorderStyleIcon variant="solid" {...p2} />,
                          label: t('spacing.borderStyle.solid'),
                        },
                        {
                          value: 'dashed',
                          icon: (p2) => <BorderStyleIcon variant="dashed" {...p2} />,
                          label: t('spacing.borderStyle.dashed'),
                        },
                        {
                          value: 'dotted',
                          icon: (p2) => <BorderStyleIcon variant="dotted" {...p2} />,
                          label: t('spacing.borderStyle.dotted'),
                        },
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
                    <SwitchRow
                      label={t('spacing.showDecoration')}
                      checked={config.layout.showDecoration ?? true}
                      onChange={(v) =>
                        patchConfig({ layout: { ...config.layout, showDecoration: v } })
                      }
                    />
                  </PropSection>
                </>
              )}

              {propTab === 'block' && selected && selectedBlock && (
                <>
                  {selectedBlock.type === 'appreciation' && (
                    <PropSection title={t('blockProperties.appreciationTitle')} last>
                      <PropIconRow
                        label={t('blockProperties.appreciationStyle')}
                        value={selectedBlock.style ?? 'box'}
                        options={[
                          {
                            value: 'box',
                            icon: Square,
                            label: t('blockProperties.appreciationStyleBox'),
                          },
                          {
                            value: 'lines',
                            icon: SeparatorHorizontal,
                            label: t('blockProperties.appreciationStyleLines'),
                          },
                        ]}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            style: v as 'box' | 'lines',
                          })
                        }
                      />
                      {selectedBlock.style === 'lines' && (
                        <PropNumberRow
                          label={t('blockProperties.appreciationLines')}
                          value={selectedBlock.lines ?? 3}
                          min={3}
                          max={12}
                          onChange={(v) =>
                            patchBlock(selected.pageId, selected.blockId, { lines: v })
                          }
                        />
                      )}
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.appreciationTitleLabel')}
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={selectedBlock.title ?? ''}
                        placeholder="Appréciation générale du conseil de classe"
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            title: e.target.value || undefined,
                          })
                        }
                        className="w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                    </PropSection>
                  )}

                  {selectedBlock.type === 'signatures' && (
                    <PropSection title={t('blockProperties.signaturesLabelsTitle')} last>
                      <PropIconRow
                        label={t('blockProperties.signaturesStyle')}
                        value={selectedBlock.style ?? 'boxes'}
                        options={[
                          {
                            value: 'boxes',
                            icon: Square,
                            label: t('blockProperties.signaturesStyleBoxes'),
                          },
                          {
                            value: 'lines',
                            icon: SeparatorHorizontal,
                            label: t('blockProperties.signaturesStyleLines'),
                          },
                        ]}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            style: v as 'boxes' | 'lines',
                          })
                        }
                      />
                      <SwitchRow
                        label={t('blockProperties.signaturesHomeroomFirst')}
                        checked={selectedBlock.homeroomFirst ?? false}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, { homeroomFirst: v })
                        }
                      />
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.signatureDirectorLabel')}
                      </label>
                      <input
                        type="text"
                        maxLength={40}
                        value={selectedBlock.labels?.director ?? ''}
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            labels: { ...selectedBlock.labels, director: e.target.value },
                          })
                        }
                        className="mb-2 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.signatureHomeroomLabel')}
                      </label>
                      <input
                        type="text"
                        maxLength={40}
                        value={selectedBlock.labels?.homeroom ?? ''}
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            labels: { ...selectedBlock.labels, homeroom: e.target.value },
                          })
                        }
                        className="mb-2 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.signatureGuardianLabel')}
                      </label>
                      <input
                        type="text"
                        maxLength={40}
                        value={selectedBlock.labels?.guardian ?? ''}
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            labels: { ...selectedBlock.labels, guardian: e.target.value },
                          })
                        }
                        className="w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                    </PropSection>
                  )}

                  {selectedBlock.type === 'text' && (
                    <PropSection title={t('blockProperties.textTitle')} last>
                      <button
                        type="button"
                        onClick={() => setTextEditorOpen(true)}
                        className="mb-2.5 flex w-full flex-col gap-1.5 rounded-md border border-border bg-muted px-2.5 py-2 text-left hover:bg-muted/70"
                      >
                        <span className="line-clamp-3 text-xs whitespace-pre-line text-foreground">
                          {richTextSummary(
                            selectedBlock.rich ?? richTextFromPlain(selectedBlock.text),
                            160,
                          ) || tRich('empty')}
                        </span>
                        <span className="text-2xs font-semibold text-primary">{tRich('edit')}</span>
                      </button>
                      <p className="mb-2.5 text-2xs text-muted-foreground">
                        {t('blockProperties.textVariablesHint')}
                      </p>
                      {textEditorOpen && (
                        <Modal
                          title={tRich('editorTitle')}
                          subtitle={tRich('editorHint')}
                          medium
                          onClose={() => setTextEditorOpen(false)}
                          footer={
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => setTextEditorOpen(false)}
                                className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                              >
                                {tRich('done')}
                              </button>
                            </div>
                          }
                        >
                          <RichTextEditor
                            autoFocus
                            minHeight={320}
                            value={selectedBlock.rich ?? richTextFromPlain(selectedBlock.text)}
                            onChange={(rich) =>
                              patchBlock(selected.pageId, selected.blockId, {
                                rich,
                                text: richTextToPlain(rich).slice(0, 2000),
                              })
                            }
                          />
                        </Modal>
                      )}
                      <PropIconRow
                        label={t('blockProperties.textAlign')}
                        value={selectedBlock.align}
                        options={[
                          { value: 'left', icon: AlignLeft, label: t('blockProperties.alignLeft') },
                          {
                            value: 'center',
                            icon: AlignCenter,
                            label: t('blockProperties.alignCenter'),
                          },
                          {
                            value: 'right',
                            icon: AlignRight,
                            label: t('blockProperties.alignRight'),
                          },
                          {
                            value: 'justify',
                            icon: AlignJustify,
                            label: t('blockProperties.alignJustify'),
                          },
                        ]}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            align: v as 'left' | 'center' | 'right' | 'justify',
                          })
                        }
                      />
                      <PropIconRow
                        label={t('blockProperties.textVerticalAlign')}
                        value={selectedBlock.verticalAlign ?? 'top'}
                        options={[
                          {
                            value: 'top',
                            icon: AlignVerticalJustifyStart,
                            label: t('blockProperties.verticalAlignTop'),
                          },
                          {
                            value: 'middle',
                            icon: AlignVerticalJustifyCenter,
                            label: t('blockProperties.verticalAlignMiddle'),
                          },
                          {
                            value: 'bottom',
                            icon: AlignVerticalJustifyEnd,
                            label: t('blockProperties.verticalAlignBottom'),
                          },
                        ]}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            verticalAlign: v as 'top' | 'middle' | 'bottom',
                          })
                        }
                      />
                      <PropSliderRow
                        label={t('blockProperties.textFontSize')}
                        value={selectedBlock.fontSize}
                        min={8}
                        max={20}
                        suffix="px"
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, { fontSize: v })
                        }
                      />
                      <SwitchRow
                        label={t('blockProperties.textBold')}
                        checked={selectedBlock.bold}
                        onChange={(v) => patchBlock(selected.pageId, selected.blockId, { bold: v })}
                      />
                      <SwitchRow
                        label={t('blockProperties.textItalic')}
                        checked={selectedBlock.italic}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, { italic: v })
                        }
                      />
                    </PropSection>
                  )}

                  {selectedBlock.type === 'cover' && (
                    <PropSection title={t('blockProperties.coverTitle')} last>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.coverSectionLabel')}
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={selectedBlock.sectionLabel}
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            sectionLabel: e.target.value,
                          })
                        }
                        className="mb-2.5 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.coverTitlePattern')}
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={selectedBlock.titlePattern}
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            titlePattern: e.target.value,
                          })
                        }
                        className="mb-2.5 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <SwitchRow
                        label={t('blockProperties.coverShowLogo')}
                        checked={selectedBlock.showLogo}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, { showLogo: v })
                        }
                      />
                      <SwitchRow
                        label={t('blockProperties.coverFramed')}
                        checked={selectedBlock.framed}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, { framed: v })
                        }
                      />
                      {selectedBlock.framed && (
                        <PropIconRow
                          label={t('blockProperties.coverFrameStyle')}
                          value={selectedBlock.frameStyle ?? 'dashed'}
                          options={[
                            {
                              value: 'dashed',
                              icon: SquareDashed,
                              label: t('blockProperties.coverFrameDashed'),
                            },
                            {
                              value: 'solid',
                              icon: Square,
                              label: t('blockProperties.coverFrameSolid'),
                            },
                            {
                              value: 'rounded',
                              icon: SquareRoundCorner,
                              label: t('blockProperties.coverFrameRounded'),
                            },
                          ]}
                          onChange={(v) =>
                            patchBlock(selected.pageId, selected.blockId, {
                              frameStyle: v as 'dashed' | 'solid' | 'rounded',
                            })
                          }
                        />
                      )}
                      <SwitchRow
                        label={t('blockProperties.coverUppercase')}
                        checked={selectedBlock.uppercase ?? true}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, { uppercase: v })
                        }
                      />
                      <PropSelectRow
                        label={t('blockProperties.coverLogoPosition')}
                        value={selectedBlock.logoPosition ?? 'top'}
                        options={[
                          { value: 'top', label: t('blockProperties.coverLogoTop') },
                          { value: 'belowTitle', label: t('blockProperties.coverLogoBelowTitle') },
                        ]}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            logoPosition: v as 'top' | 'belowTitle',
                          })
                        }
                      />
                      <div className="mt-2 text-xs font-medium text-foreground">
                        {t('blockProperties.coverFields')}
                      </div>
                      {(
                        [
                          'lastName',
                          'firstName',
                          'fullName',
                          'className',
                          'studentNumber',
                          'nisu',
                          'academicYear',
                        ] as const
                      ).map((field) => (
                        <div key={field}>
                          <SwitchRow
                            label={t(`blockProperties.coverField.${field}`)}
                            checked={selectedBlock.fields.includes(field)}
                            onChange={(v) =>
                              patchBlock(selected.pageId, selected.blockId, {
                                fields: v
                                  ? [...selectedBlock.fields, field]
                                  : selectedBlock.fields.filter((f) => f !== field),
                              })
                            }
                          />
                          {selectedBlock.fields.includes(field) && (
                            <input
                              type="text"
                              maxLength={60}
                              aria-label={t('blockProperties.coverFieldLabel', {
                                field: t(`blockProperties.coverField.${field}`),
                              })}
                              placeholder={t('blockProperties.coverFieldLabel', {
                                field: t(`blockProperties.coverField.${field}`),
                              })}
                              value={selectedBlock.fieldLabels?.[field] ?? ''}
                              onChange={(e) => {
                                const newLabel: string | undefined = e.target.value || undefined;
                                patchBlock(selected.pageId, selected.blockId, {
                                  fieldLabels: { ...selectedBlock.fieldLabels, [field]: newLabel },
                                });
                              }}
                              className="mb-2 w-full rounded border-none bg-muted px-2 py-1 text-xs text-foreground outline-none"
                            />
                          )}
                        </div>
                      ))}
                    </PropSection>
                  )}

                  {selectedBlock.type === 'criteriaGrids' && (
                    <PropSection title={t('blockProperties.criteriaGridsTitle')} last>
                      <PropSelectRow
                        label={t('blockProperties.gridStyle')}
                        value={selectedBlock.style ?? 'modern'}
                        options={[
                          { value: 'modern', label: t('blockProperties.gridStyleModern') },
                          { value: 'grid', label: t('blockProperties.gridStyleGrid') },
                        ]}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            style: v as 'modern' | 'grid',
                          })
                        }
                      />
                      <SwitchRow
                        label={t('blockProperties.showScaleHeader')}
                        checked={selectedBlock.showScaleHeader}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, { showScaleHeader: v })
                        }
                      />
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.gridSubjects')}
                      </label>
                      <textarea
                        rows={4}
                        value={(selectedBlock.subjects ?? []).join('\n')}
                        placeholder={t('blockProperties.gridSubjectsPlaceholder')}
                        onChange={(e) => {
                          const subjects = e.target.value
                            .split('\n')
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .slice(0, 20);
                          patchBlock(selected.pageId, selected.blockId, {
                            subjects: subjects.length > 0 ? subjects : undefined,
                          });
                        }}
                        className="w-full resize-none rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <div className="mt-1 text-2xs text-muted-foreground">
                        {t('blockProperties.gridSubjectsHint')}
                      </div>
                    </PropSection>
                  )}

                  {selectedBlock.type === 'yearGrid' && (
                    <PropSection title={t('blockProperties.yearGridTitle')} last>
                      <SwitchRow
                        label={t('blockProperties.yearGridShowDomains')}
                        checked={selectedBlock.showDomains ?? false}
                        onChange={(v) =>
                          patchBlock(selected.pageId, selected.blockId, { showDomains: v })
                        }
                      />
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.yearGridNotesLabel')}
                      </label>
                      <input
                        type="text"
                        maxLength={20}
                        value={selectedBlock.notesLabel ?? ''}
                        placeholder="Notes"
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            notesLabel: e.target.value || undefined,
                          })
                        }
                        className="mb-2.5 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.yearGridMaxLabel')}
                      </label>
                      <input
                        type="text"
                        maxLength={20}
                        value={selectedBlock.maxLabel ?? ''}
                        placeholder="Sur"
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            maxLabel: e.target.value || undefined,
                          })
                        }
                        className="mb-2.5 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                    </PropSection>
                  )}

                  {selectedBlock.type === 'yearDecisions' && (
                    <PropSection title={t('blockProperties.yearDecisionsTitle')} last>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.yearDecisionsHeading')}
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={selectedBlock.title ?? ''}
                        placeholder="Décisions"
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            title: e.target.value || undefined,
                          })
                        }
                        className="mb-2.5 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                    </PropSection>
                  )}

                  {selectedBlock.type === 'yearSignatures' && (
                    <PropSection title={t('blockProperties.yearSignaturesTitle')} last>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.yearSignaturesHeading')}
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={selectedBlock.title ?? ''}
                        placeholder="Signatures"
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            title: e.target.value || undefined,
                          })
                        }
                        className="mb-2.5 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.yearSignaturesDirector')}
                      </label>
                      <input
                        type="text"
                        maxLength={40}
                        value={selectedBlock.labels?.director ?? ''}
                        placeholder="Direction"
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            labels: {
                              ...selectedBlock.labels,
                              director: e.target.value || undefined,
                            },
                          })
                        }
                        className="mb-2.5 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {t('blockProperties.yearSignaturesGuardian')}
                      </label>
                      <input
                        type="text"
                        maxLength={40}
                        value={selectedBlock.labels?.guardian ?? ''}
                        placeholder="Les Parents"
                        onChange={(e) =>
                          patchBlock(selected.pageId, selected.blockId, {
                            labels: {
                              ...selectedBlock.labels,
                              guardian: e.target.value || undefined,
                            },
                          })
                        }
                        className="mb-2.5 w-full rounded border-none bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                    </PropSection>
                  )}
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

interface IconLike {
  size?: number;
  className?: string;
}

/**
 * A single-select row of icon buttons instead of a dropdown: each option's
 * icon is meant to read the choice at a glance (an alignment direction, a
 * literal line-style preview), with the full label still available as a
 * native tooltip on hover / focus for anyone who wants the word.
 */
function PropIconRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; icon: React.ComponentType<IconLike>; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <PropRow label={label}>
      <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.label}
            aria-label={o.label}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`flex h-7 w-7 items-center justify-center rounded ${
              value === o.value
                ? 'bg-card text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <o.icon size={14} />
          </button>
        ))}
      </div>
    </PropRow>
  );
}

/** Literal preview of a border line style (solid / dashed / dotted), read
 * at a glance instead of guessing from a generic icon. */
function BorderStyleIcon({
  variant,
  size = 14,
}: {
  variant: 'solid' | 'dashed' | 'dotted';
  size?: number;
}) {
  return (
    <svg width={size * 1.3} height={size} viewBox="0 0 18 14" fill="none" aria-hidden="true">
      <line
        x1="1"
        y1="7"
        x2="17"
        y2="7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap={variant === 'dotted' ? 'round' : 'butt'}
        strokeDasharray={
          variant === 'dashed' ? '4 3' : variant === 'dotted' ? '0.1 3.4' : undefined
        }
      />
    </svg>
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
      <BareSelect
        value={value}
        onValueChange={onChange}
        aria-label={label}
        className="w-auto min-w-44 px-2 py-1"
      >
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </BareSelect>
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
