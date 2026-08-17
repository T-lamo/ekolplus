'use client';

// Ajout / édition d'une salle du catalogue (configuration/salles). Mêmes
// atomes que les formulaires matière / classe (FormGroup / TextInput /
// BareSelect / ToggleRow) dans la Modal générique. 409 ROOM_NAME_TAKEN
// remonte sous le champ Nom.
import { useState } from 'react';
import { Check } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ROOM_TYPES, ROOM_TYPE_LABELS, type RoomRow, type RoomType } from '@/lib/rooms';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  BareSelect,
  FormGroup,
  SelectItem,
  TextArea,
  TextInput,
  ToggleRow,
} from '@/components/school/subjects/form-primitives';

export function RoomFormModal({
  room,
  onClose,
  onSaved,
}: {
  /** null = création. */
  room: RoomRow | null;
  onClose: () => void;
  onSaved: (room: RoomRow, mode: 'create' | 'edit') => void;
}) {
  const [name, setName] = useState(room?.name ?? '');
  const [type, setType] = useState<RoomType>(
    (ROOM_TYPES as readonly string[]).includes(room?.type ?? '')
      ? (room?.type as RoomType)
      : 'CLASSROOM',
  );
  const [capacity, setCapacity] = useState(room?.capacity != null ? String(room.capacity) : '');
  const [building, setBuilding] = useState(room?.building ?? '');
  const [floor, setFloor] = useState(room?.floor ?? '');
  const [equipment, setEquipment] = useState(room?.equipment ?? '');
  const [isActive, setIsActive] = useState(room?.isActive ?? true);
  const [errors, setErrors] = useState<{ name?: string; capacity?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const next: { name?: string; capacity?: string } = {};
    if (name.trim().length === 0) next.name = 'Le nom est requis.';
    else if (name.trim().length > 80) next.name = '80 caractères maximum.';
    const cap = capacity.trim() === '' ? null : Number(capacity);
    if (cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > 5000)) {
      next.capacity = 'Nombre entier entre 1 et 5000.';
    }
    setErrors(next);
    setServerError(null);
    if (Object.keys(next).length > 0) return;
    setSubmitting(true);
    const body = {
      name: name.trim(),
      type,
      capacity: cap,
      building: building.trim() || null,
      floor: floor.trim() || null,
      equipment: equipment.trim() || null,
      isActive,
    };
    try {
      const res = room
        ? await api<{ room: RoomRow }>(`/api/school/rooms/${room.id}`, { method: 'PATCH', body })
        : await api<{ room: RoomRow }>('/api/school/rooms', { method: 'POST', body });
      onSaved(res.room, room ? 'edit' : 'create');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ROOM_NAME_TAKEN') {
        setErrors({ name: 'Une salle porte déjà ce nom.' });
      } else {
        setServerError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={room ? 'Modifier la salle' : 'Nouvelle salle'}
      subtitle={
        room
          ? `${room.name} · ${room.classCount} classe${room.classCount > 1 ? 's' : ''} · ${room.sessionCount} séance${room.sessionCount > 1 ? 's' : ''}`
          : 'Ajouter une salle ou un lieu au catalogue de l’école'
      }
      onClose={onClose}
      bodyClassName="px-6 py-5"
      footerClassName="px-6 py-3.5"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <Button type="button" variant="outline" className="w-fit" onClick={onClose}>
            Annuler
          </Button>
          <Button type="button" className="w-fit" loading={submitting} onClick={submit}>
            <Check size={14} />
            {room ? 'Enregistrer' : 'Créer la salle'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <FormGroup
            label="Nom"
            required
            error={errors.name}
            htmlFor="room-name"
            className="flex-1"
          >
            <TextInput
              id="room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Salle 12, Labo SVT, Terrain"
              autoFocus
            />
          </FormGroup>
          <FormGroup label="Type" required htmlFor="room-type" className="sm:w-[200px]">
            <BareSelect id="room-type" value={type} onValueChange={(v) => setType(v as RoomType)}>
              {ROOM_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {ROOM_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </BareSelect>
          </FormGroup>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <FormGroup
            label="Capacité"
            labelHint="(places)"
            error={errors.capacity}
            htmlFor="room-capacity"
            className="sm:w-[140px]"
            hint="Alerte si l’effectif d’une classe la dépasse"
          >
            <TextInput
              id="room-capacity"
              type="number"
              inputMode="numeric"
              min={1}
              max={5000}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="—"
            />
          </FormGroup>
          <FormGroup label="Bâtiment" optional htmlFor="room-building" className="flex-1">
            <TextInput
              id="room-building"
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              placeholder="Ex. Bâtiment A"
            />
          </FormGroup>
          <FormGroup label="Étage" optional htmlFor="room-floor" className="flex-1">
            <TextInput
              id="room-floor"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="Ex. 1er étage"
            />
          </FormGroup>
        </div>
        <FormGroup label="Équipements" optional htmlFor="room-equipment">
          <TextArea
            id="room-equipment"
            className="min-h-14"
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            placeholder="Vidéoprojecteur, tableau blanc, paillasses…"
          />
        </FormGroup>
        <div className="rounded-md border border-border px-3">
          <ToggleRow
            title="Salle active"
            description="Une salle inactive n’est plus proposée pour les classes ni l’emploi du temps."
            checked={isActive}
            onChange={setIsActive}
          />
        </div>
        {serverError && (
          <p role="alert" className="text-xs text-destructive-foreground">
            {serverError}
          </p>
        )}
      </div>
    </Modal>
  );
}
