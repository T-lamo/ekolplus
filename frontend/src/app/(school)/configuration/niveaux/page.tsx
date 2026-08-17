'use client';

// Configuration → Niveaux — the school's ordered grade-level catalog
// ("6ème" → "5ème" → … → "Terminale"). Feeds the rollover wizard's
// "Suggérer toutes les promotions" (Step 2). ↑/↓ reorder (no DnD dep),
// pencil → rename Modal (project rule: edit icons open modals), trash →
// window.confirm (matches classes/matières delete pattern). The API enforces
// ADMIN on mutations; a MEMBER just gets the 403 message as a toast.
// Spec: docs/superpowers/specs/2026-08-17-grade-level-ordering-design.md

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
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

function RenameLevelModal({
  level,
  onRenamed,
  onClose,
}: {
  level: GradeLevel;
  onRenamed: (level: GradeLevel) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState(level.name);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = value.trim();
    if (!name) {
      setError('Le nom est requis.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ level: GradeLevel }>(`/api/school/grade-levels/${level.id}`, {
        method: 'PATCH',
        body: { name },
      });
      onRenamed(res.level);
      toast('Niveau renommé.', 'success');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Renommer le niveau" onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <Field
          label="Nom du niveau"
          autoFocus
          maxLength={40}
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
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function NiveauxPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const [levels, setLevels] = useState<GradeLevel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [renaming, setRenaming] = useState<GradeLevel | null>(null);

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

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const res = await api<{ level: GradeLevel }>('/api/school/grade-levels', {
        method: 'POST',
        body: { name },
      });
      setLevels((prev) => [...(prev ?? []), res.level]);
      setNewName('');
      toast('Niveau ajouté.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setAdding(false);
    }
  }

  async function onMove(index: number, delta: -1 | 1) {
    if (!levels) return;
    const target = index + delta;
    if (target < 0 || target >= levels.length) return;
    const previous = levels;
    const next = [...levels];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    // Optimistic — orders are re-derived from the server response below.
    setLevels(next.map((l, order) => ({ ...l, order })));
    setMoving(true);
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
      setMoving(false);
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
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">Niveaux</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Ordre des niveaux scolaires, du premier au dernier — utilisé pour suggérer les promotions
          lors du passage à l&apos;année suivante.
        </p>
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
        <Card className="max-w-2xl gap-4 p-4 sm:p-6">
          {levels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun niveau configuré — ajoute ton premier niveau ci-dessous.
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-border">
              {levels.map((level, index) => (
                <li key={level.id} className="flex items-center gap-3 py-2">
                  <span className="w-6 text-right text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium text-foreground">
                    {level.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-fit px-2"
                      aria-label={`Monter ${level.name}`}
                      disabled={moving || index === 0}
                      onClick={() => onMove(index, -1)}
                    >
                      <ArrowUp size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-fit px-2"
                      aria-label={`Descendre ${level.name}`}
                      disabled={moving || index === levels.length - 1}
                      onClick={() => onMove(index, 1)}
                    >
                      <ArrowDown size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-fit px-2"
                      aria-label={`Renommer ${level.name}`}
                      onClick={() => setRenaming(level)}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-fit px-2 text-destructive-foreground hover:text-destructive-foreground"
                      aria-label={`Supprimer ${level.name}`}
                      onClick={() => onDelete(level)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <form onSubmit={onAdd} className="flex items-end gap-2 border-t border-border pt-4">
            <div className="flex-1">
              <Field
                label="Nouveau niveau"
                name="newLevel"
                placeholder="Ex. 6ème"
                maxLength={40}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-fit" loading={adding} disabled={!newName.trim()}>
              <Plus size={14} />
              Ajouter
            </Button>
          </form>
        </Card>
      )}

      {renaming && (
        <RenameLevelModal
          level={renaming}
          onRenamed={(updated) =>
            setLevels((prev) =>
              prev ? prev.map((l) => (l.id === updated.id ? updated : l)) : prev,
            )
          }
          onClose={() => setRenaming(null)}
        />
      )}
    </div>
  );
}
