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
  UploadCloud,
  Copy,
  FileText,
  Monitor,
  Smartphone,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { REORDERABLE_BLOCK_IDS, BLOCK_LABEL } from '../../types';
import type { BlockId, BulletinTemplateConfig, TemplateDetail } from '../../types';

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

const SAMPLE_SUBJECTS = [
  {
    name: 'Mathématiques',
    coef: 4,
    avg: 15.67,
    classAvg: 12.8,
    min: 6.5,
    max: 19.0,
    note: 'Très bon trimestre',
  },
  {
    name: 'Français',
    coef: 4,
    avg: 12.0,
    classAvg: 11.4,
    min: 5.0,
    max: 17.5,
    note: 'Peut mieux faire',
  },
  {
    name: 'Sciences',
    coef: 3,
    avg: 18.0,
    classAvg: 13.2,
    min: 8.0,
    max: 20.0,
    note: 'Excellent travail',
  },
  {
    name: 'Anglais',
    coef: 3,
    avg: 10.0,
    classAvg: 12.1,
    min: 4.5,
    max: 18.0,
    note: 'Efforts nécessaires',
  },
  {
    name: 'Histoire-Géo',
    coef: 2,
    avg: 16.5,
    classAvg: 11.9,
    min: 7.0,
    max: 19.5,
    note: 'Très bonne maîtrise',
  },
];
function scoreColor(avg: number) {
  if (avg < 8) return '#d93025';
  if (avg < 12) return '#f59e0b';
  return '#1a9e5c';
}

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

  useEffect(() => {
    if (!user) return;
    api<TemplateDetail>(`/api/school/bulletin-templates/${params.id}`)
      .then((d) => {
        setData(d);
        setConfig(d.config);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setError('Modèle introuvable.');
          return;
        }
        setError('Impossible de charger le modèle.');
      });
  }, [user, params.id]);

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

  const orderedBlocks = useMemo(() => config?.blocks ?? [], [config]);

  if (!user || (!data && !error)) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </main>
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
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <LayoutTemplate size={14} className="text-primary" />
            {data.name}
          </div>
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
        <div className="flex flex-1 items-start justify-center overflow-y-auto bg-[#d8d8e8] p-7">
          <div style={{ width: 760 }}>
            <div className="mb-2 flex items-center justify-center gap-1.5 text-[11px] text-[#888]">
              <FileText size={12} />
              Format {config.pageFormat === 'LETTER' ? 'Letter' : 'A4'} ·{' '}
              {config.orientation === 'LANDSCAPE' ? 'Paysage' : 'Portrait'}
            </div>
            <BulletinCanvas config={config} selected={selected} onSelect={setSelected} />
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
                    onClick={() =>
                      t === 'style' ? setPropTab('style') : toast('Onglet à venir.', 'info')
                    }
                    className={`flex-1 rounded px-1 py-1 text-[11px] font-medium ${propTab === t ? 'bg-card text-foreground' : 'text-muted-foreground'}`}
                  >
                    {t === 'style' ? 'Style' : t === 'content' ? 'Contenu' : 'Espacement'}
                  </button>
                ))}
              </div>
            </div>

            <PropSection title="Logo de l'établissement">
              <div className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed border-border bg-background text-center">
                <UploadCloud size={18} className="text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">
                  Non câblé cette phase — PNG, SVG, JPG
                </span>
              </div>
            </PropSection>

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

            <PropSection title="Typographie">
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
                onChange={(v) => patchConfig({ typography: { ...config.typography, title: v } })}
              />
              <PropNumberRow
                label="Corps tableau"
                value={config.typography.tableBody}
                onChange={(v) =>
                  patchConfig({ typography: { ...config.typography, tableBody: v } })
                }
              />
            </PropSection>

            <PropSection title="Signatures">
              <SwitchRow
                label="Directeur"
                checked={config.signatures.director}
                onChange={(v) => patchConfig({ signatures: { ...config.signatures, director: v } })}
              />
              <SwitchRow
                label="Titulaire de classe"
                checked={config.signatures.homeroom}
                onChange={(v) => patchConfig({ signatures: { ...config.signatures, homeroom: v } })}
              />
              <SwitchRow
                label="Parent / Tuteur"
                checked={config.signatures.guardian}
                onChange={(v) => patchConfig({ signatures: { ...config.signatures, guardian: v } })}
              />
            </PropSection>

            <PropSection title="Colonnes du tableau" last>
              <SwitchRow
                label="Coeff."
                checked={config.columns.coefficient}
                onChange={(v) => patchConfig({ columns: { ...config.columns, coefficient: v } })}
              />
              <SwitchRow
                label="Moy. classe"
                checked={config.columns.classAverage}
                onChange={(v) => patchConfig({ columns: { ...config.columns, classAverage: v } })}
              />
              <SwitchRow
                label="Min. / Max."
                checked={config.columns.minMax}
                onChange={(v) => patchConfig({ columns: { ...config.columns, minMax: v } })}
              />
              <SwitchRow
                label="Appréciation"
                checked={config.columns.appreciation}
                onChange={(v) => patchConfig({ columns: { ...config.columns, appreciation: v } })}
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
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <PropRow label={label}>
      <input
        type="number"
        min={8}
        max={32}
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

function BulletinCanvas({
  config,
  selected,
  onSelect,
}: {
  config: BulletinTemplateConfig;
  selected: BlockId;
  onSelect: (id: BlockId) => void;
}) {
  const visible = (id: BlockId) => config.blocks.find((b) => b.id === id)?.visible ?? true;
  const wrap = (id: BlockId, content: React.ReactNode) =>
    visible(id) ? (
      <div
        onClick={() => onSelect(id)}
        className={`relative mb-2.5 cursor-pointer rounded ${selected === id ? 'outline outline-2 outline-primary' : ''}`}
      >
        {content}
      </div>
    ) : null;

  return (
    <div
      className="relative overflow-hidden rounded-[2px] bg-white shadow-2xl"
      style={{ minHeight: 586 }}
    >
      <div
        className="h-1.5"
        style={{ background: `linear-gradient(90deg, ${config.primaryColor}, #a855f7)` }}
      />

      {(visible('header') || visible('studentInfo')) && (
        <div
          onClick={() => onSelect(visible('header') ? 'header' : 'studentInfo')}
          className="flex items-center gap-0 border-b-[1.5px] px-5 py-3.5"
          style={{ borderColor: `${config.primaryColor}30`, background: '#fdfcff' }}
        >
          {visible('header') && (
            <>
              <div
                className="flex h-13 w-13 shrink-0 items-center justify-center rounded-md border-[1.5px] border-dashed"
                style={{
                  borderColor: `${config.primaryColor}80`,
                  background: `${config.primaryColor}0d`,
                }}
              >
                <LayoutTemplate size={18} style={{ color: `${config.primaryColor}80` }} />
              </div>
              <div className="flex flex-1 flex-col items-center gap-0.5">
                <div
                  className="font-extrabold"
                  style={{ color: config.primaryColor, fontSize: config.typography.schoolName }}
                >
                  École LesÉtoiles
                </div>
                <div
                  className="font-black tracking-widest text-[#1a1a2e] uppercase"
                  style={{ fontSize: config.typography.title }}
                >
                  BULLETIN SCOLAIRE
                </div>
                <div className="text-[10px] text-[#8884a0]">Année 2024–2025 · Trimestre 2</div>
              </div>
            </>
          )}
          {visible('studentInfo') && (
            <div
              className="min-w-[150px] rounded-md border p-2.5 text-right"
              style={{
                background: `${config.primaryColor}0d`,
                borderColor: `${config.primaryColor}30`,
              }}
            >
              <div className="text-xs font-extrabold text-[#1a1a2e]">JEAN-PIERRE M.</div>
              <div className="mt-0.5 text-[10px] text-[#6b6b8d]">3ème A · Effectif : 28</div>
              <div className="text-[9px] text-[#8884a0]">N° 2024-0047</div>
            </div>
          )}
        </div>
      )}

      <div className="px-5 py-3.5">
        {wrap(
          'stats',
          <div className="flex gap-2.5">
            <StatBox label="Moyenne générale" value="14.38" color={config.primaryColor} />
            {config.columns.rank && (
              <StatBox label="Rang dans la classe" value="4ème" color="#1a9e5c" />
            )}
            {config.columns.absences && (
              <>
                <StatBox label="Absences (j.)" value="3" color="#f59e0b" tint="#fff8e1" />
                <StatBox label="Retards" value="1" color="#f59e0b" tint="#fff8e1" />
              </>
            )}
            <StatBox label="Moy. classe" value="12.50" color="#d93025" tint="#fdecea" />
          </div>,
        )}

        {wrap(
          'notes',
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr style={{ background: config.primaryColor }}>
                <th className="p-1.5 text-left text-[10px] font-bold text-white">Matière</th>
                {config.columns.coefficient && (
                  <th className="p-1.5 text-left text-[10px] font-bold text-white">Coeff.</th>
                )}
                <th className="p-1.5 text-left text-[10px] font-bold text-white">Moy. élève</th>
                {config.columns.classAverage && (
                  <th className="p-1.5 text-left text-[10px] font-bold text-white">Moy. classe</th>
                )}
                {config.columns.minMax && (
                  <>
                    <th className="p-1.5 text-left text-[10px] font-bold text-white">Min.</th>
                    <th className="p-1.5 text-left text-[10px] font-bold text-white">Max.</th>
                  </>
                )}
                {config.columns.appreciation && (
                  <th className="p-1.5 text-left text-[10px] font-bold text-white">Appréciation</th>
                )}
              </tr>
            </thead>
            <tbody>
              {SAMPLE_SUBJECTS.map((s, i) => (
                <tr key={s.name} style={i % 2 === 1 ? { background: '#faf9ff' } : undefined}>
                  <td
                    className="border-b border-[#f0eef8] p-1.5"
                    style={{ fontSize: config.typography.tableBody }}
                  >
                    <strong>{s.name}</strong>
                  </td>
                  {config.columns.coefficient && (
                    <td className="border-b border-[#f0eef8] p-1.5">{s.coef}</td>
                  )}
                  <td
                    className="border-b border-[#f0eef8] p-1.5 font-bold"
                    style={{ color: scoreColor(s.avg) }}
                  >
                    {s.avg.toFixed(2)}
                  </td>
                  {config.columns.classAverage && (
                    <td className="border-b border-[#f0eef8] p-1.5">{s.classAvg.toFixed(2)}</td>
                  )}
                  {config.columns.minMax && (
                    <>
                      <td className="border-b border-[#f0eef8] p-1.5">{s.min.toFixed(2)}</td>
                      <td className="border-b border-[#f0eef8] p-1.5">{s.max.toFixed(2)}</td>
                    </>
                  )}
                  {config.columns.appreciation && (
                    <td className="border-b border-[#f0eef8] p-1.5 text-[#6b6b8d] italic">
                      {s.note}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: `${config.primaryColor}14` }}>
                <td className="p-1.5 font-bold" colSpan={config.columns.coefficient ? 2 : 1}>
                  Moyenne générale
                </td>
                <td className="p-1.5 text-[12px] font-bold" style={{ color: config.primaryColor }}>
                  14.38 / 20
                </td>
                <td
                  colSpan={
                    (config.columns.classAverage ? 1 : 0) +
                    (config.columns.minMax ? 2 : 0) +
                    (config.columns.appreciation ? 1 : 0)
                  }
                  className="p-1.5 text-[10px] text-[#8884a0]"
                >
                  Rang : 4ème / 28 élèves
                </td>
              </tr>
            </tfoot>
          </table>,
        )}

        <div className="mb-2.5 flex gap-3">
          {wrap(
            'absences',
            <div className="w-[200px] shrink-0">
              <div className="mb-1.5 text-[9px] font-bold tracking-wide text-[#8884a0] uppercase">
                Absences &amp; Retards
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 rounded-md bg-[#fff8e1] px-2.5 py-1.5">
                  <CalendarX size={14} className="shrink-0 text-[#f59e0b]" />
                  <div>
                    <div className="text-[13px] font-extrabold text-[#f59e0b]">3 jours</div>
                    <div className="text-[9px] text-[#8884a0]">Absences totales</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 rounded-md bg-[#fdecea] px-2.5 py-1.5">
                  <CalendarX size={14} className="shrink-0 text-[#d93025]" />
                  <div>
                    <div className="text-[13px] font-extrabold text-[#d93025]">1</div>
                    <div className="text-[9px] text-[#8884a0]">Retards</div>
                  </div>
                </div>
              </div>
            </div>,
          )}
          {wrap(
            'appreciation',
            <div className="flex-1 rounded-md border border-[#e8e4f6] bg-[#faf9ff] p-2.5">
              <div className="mb-1 text-[9px] font-bold tracking-wide text-[#8884a0] uppercase">
                Appréciation générale du conseil de classe
              </div>
              <div className="text-[11px] leading-relaxed text-[#1a1a2e] italic">
                Élève sérieux et investi qui fait preuve d&apos;une bonne volonté dans
                l&apos;ensemble des matières. Les résultats en sciences sont excellents et
                encourageants. Des efforts supplémentaires sont attendus en anglais pour consolider
                les acquis. Continuez ainsi !
              </div>
            </div>,
          )}
        </div>

        {wrap(
          'signatures',
          <div>
            <div className="mb-1.5 text-[9px] font-bold tracking-wide text-[#8884a0] uppercase">
              Signatures
            </div>
            <div className="flex gap-3.5">
              {config.signatures.director && (
                <SigBox label="Signature du Directeur" color={config.primaryColor} />
              )}
              {config.signatures.homeroom && (
                <SigBox label="Signature du Titulaire de classe" color={config.primaryColor} />
              )}
              {config.signatures.guardian && (
                <SigBox label="Signature du Parent / Tuteur" color={config.primaryColor} />
              )}
            </div>
          </div>,
        )}
      </div>

      <div
        className="h-1.5"
        style={{ background: `linear-gradient(90deg, ${config.primaryColor}, #a855f7)` }}
      />
    </div>
  );
}

function StatBox({
  label,
  value,
  color,
  tint,
}: {
  label: string;
  value: string;
  color: string;
  tint?: string;
}) {
  return (
    <div
      className="flex-1 rounded-md p-2.5 text-center"
      style={{ background: tint ?? `${color}0d` }}
    >
      <div className="text-base font-extrabold" style={{ color }}>
        {value}
      </div>
      <div className="mt-0.5 text-[9px] text-[#8884a0]">{label}</div>
    </div>
  );
}

function SigBox({ label, color }: { label: string; color: string }) {
  return (
    <div
      className="flex min-h-13.5 flex-1 flex-col items-center justify-end gap-1 rounded-md border-[1.5px] border-dashed p-2.5 pb-1.5"
      style={{ borderColor: `${color}80` }}
    >
      <div className="text-center text-[9px] text-[#8884a0]">{label}</div>
    </div>
  );
}
