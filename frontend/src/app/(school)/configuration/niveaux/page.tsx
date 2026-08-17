'use client';

// Configuration → Niveaux — the school's ordered grade-level catalog
// ("6ème" → "5ème" → … → "Terminale"). Feeds the rollover wizard's
// "Suggérer toutes les promotions" (Step 2). Reorder by drag & drop
// (@dnd-kit/sortable — pointer, touch and keyboard sensors; user decision
// 2026-08-17, replacing the ↑/↓ buttons), add via a header button → Modal
// (same decision), pencil → rename Modal (project rule: edit icons open
// modals), trash → window.confirm (matches classes/matières delete pattern).
// The API enforces ADMIN on mutations; a MEMBER just gets the 403 as a toast.
// Spec: docs/superpowers/specs/2026-08-17-grade-level-ordering-design.md

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';

interface GradeLevel {
  id: string;
  name: string;
  order: number;
}

/** `ApiError.message` carries the stable server code — switch on it (project
 * convention: branch on `err.code`, never on the message string). */
function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Erreur réseau. Réessaie.';
  switch (err.code) {
    case 'LEVEL_NAME_TAKEN':
      return 'Ce niveau existe déjà.';
    case 'INVALID_LEVEL_SET':
      return 'La liste des niveaux a changé — recharge la page et réessaie.';
    case 'ORG_ROLE_INSUFFICIENT':
      return "Tu n'as pas les droits pour modifier les niveaux.";
    case 'VALIDATION_FAILED':
      return 'Nom invalide (1 à 40 caractères).';
    default:
      return err.message;
  }
}

/** Shared name form for the add + rename modals. */
function LevelNameModal({
  title,
  submitLabel,
  initialName,
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  initialName: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = value.trim();
    if (!name) {
      setError('Le nom est requis.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(name);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <Field
          label="Nom du niveau"
          name="levelName"
          autoFocus
          maxLength={40}
          placeholder="Ex. 6ème"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" className="w-fit" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={submitting} className="w-fit">
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SortableLevelRow({
  level,
  index,
  disabled,
  onRename,
  onDelete,
}: {
  level: GradeLevel;
  index: number;
  disabled: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: level.id, disabled });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 bg-card py-2',
        isDragging && 'relative z-10 rounded-md shadow-md ring-1 ring-border',
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Réordonner ${level.name}`}
        className={cn(
          'flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/10 focus-visible:outline-none active:cursor-grabbing',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <span className="w-6 text-right text-xs font-semibold text-muted-foreground">
        {index + 1}
      </span>
      <span className="flex-1 truncate text-sm font-medium text-foreground">{level.name}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit px-2"
          aria-label={`Renommer ${level.name}`}
          onClick={onRename}
        >
          <Pencil size={14} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-fit px-2 text-destructive-foreground hover:text-destructive-foreground"
          aria-label={`Supprimer ${level.name}`}
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </li>
  );
}

export default function NiveauxPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const [levels, setLevels] = useState<GradeLevel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<GradeLevel | null>(null);

  const sensors = useSensors(
    // Small activation distance so a plain click on the handle doesn't start
    // a drag, and the row's own buttons stay clickable.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!user) return;
    api<{ levels: GradeLevel[] }>('/api/school/grade-levels')
      .then((res) => setLevels(res.levels))
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_SCHOOL') {
          router.replace('/');
          return;
        }
        setError('Impossible de charger les niveaux.');
      });
  }, [user, router]);

  async function addLevel(name: string) {
    const res = await api<{ level: GradeLevel }>('/api/school/grade-levels', {
      method: 'POST',
      body: { name },
    });
    setLevels((prev) => [...(prev ?? []), res.level]);
    toast('Niveau ajouté.', 'success');
  }

  async function renameLevel(level: GradeLevel, name: string) {
    const res = await api<{ level: GradeLevel }>(`/api/school/grade-levels/${level.id}`, {
      method: 'PATCH',
      body: { name },
    });
    setLevels((prev) => (prev ? prev.map((l) => (l.id === res.level.id ? res.level : l)) : prev));
    toast('Niveau renommé.', 'success');
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!levels || !over || active.id === over.id) return;
    const from = levels.findIndex((l) => l.id === active.id);
    const to = levels.findIndex((l) => l.id === over.id);
    if (from < 0 || to < 0) return;

    const previous = levels;
    const next = arrayMove(levels, from, to).map((l, order) => ({ ...l, order }));
    // Optimistic — orders are re-derived from the server response below.
    setLevels(next);
    setSaving(true);
    try {
      const res = await api<{ levels: GradeLevel[] }>('/api/school/grade-levels/reorder', {
        method: 'POST',
        body: { orderedIds: next.map((l) => l.id) },
      });
      setLevels(res.levels);
    } catch (err) {
      setLevels(previous);
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(level: GradeLevel) {
    if (!window.confirm(`Supprimer le niveau « ${level.name} » ?`)) return;
    try {
      await api(`/api/school/grade-levels/${level.id}`, { method: 'DELETE' });
      setLevels((prev) => (prev ? prev.filter((l) => l.id !== level.id) : prev));
      toast('Niveau supprimé.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">Niveaux</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ordre des niveaux scolaires, du premier au dernier — glisse une ligne pour réordonner.
            Utilisé pour suggérer les promotions lors du passage à l&apos;année suivante.
          </p>
        </div>
        <Button className="w-fit" onClick={() => setAdding(true)}>
          <Plus size={14} />
          Ajouter un niveau
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      {levels === null && !error && (
        <Card className="gap-3 p-4 sm:p-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </Card>
      )}

      {levels !== null && (
        <Card className="max-w-2xl p-4 sm:p-6">
          {levels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun niveau configuré — ajoute ton premier niveau avec le bouton ci-dessus.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={levels.map((l) => l.id)}
                strategy={verticalListSortingStrategy}
              >
                <ol className="flex flex-col divide-y divide-border">
                  {levels.map((level, index) => (
                    <SortableLevelRow
                      key={level.id}
                      level={level}
                      index={index}
                      disabled={saving}
                      onRename={() => setRenaming(level)}
                      onDelete={() => onDelete(level)}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          )}
        </Card>
      )}

      {adding && (
        <LevelNameModal
          title="Ajouter un niveau"
          submitLabel="Ajouter"
          initialName=""
          onSubmit={addLevel}
          onClose={() => setAdding(false)}
        />
      )}

      {renaming && (
        <LevelNameModal
          title="Renommer le niveau"
          submitLabel="Enregistrer"
          initialName={renaming.name}
          onSubmit={(name) => renameLevel(renaming, name)}
          onClose={() => setRenaming(null)}
        />
      )}
    </div>
  );
}
