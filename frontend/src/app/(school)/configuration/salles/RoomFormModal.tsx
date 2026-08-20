'use client';

// Ajout / édition d'une salle du catalogue (configuration/salles). Mêmes
// atomes que les formulaires matière / classe (FormGroup / TextInput /
// BareSelect / ToggleRow) dans la Modal générique. 409 ROOM_NAME_TAKEN
// remonte sous le champ Nom.
import { useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('Configuration.salles.modal');
  const tSalles = useTranslations('Configuration.salles');
  const tCommon = useTranslations('Common');
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
    if (name.trim().length === 0) next.name = t('errors.nameRequired');
    else if (name.trim().length > 80) next.name = t('errors.nameTooLong');
    const cap = capacity.trim() === '' ? null : Number(capacity);
    if (cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > 5000)) {
      next.capacity = t('errors.capacityRange');
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
        setErrors({ name: t('errors.nameTaken') });
      } else {
        setServerError(err instanceof ApiError ? err.message : tCommon('errors.network'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={room ? t('editTitle') : t('createTitle')}
      subtitle={
        room
          ? `${room.name} · ${room.classCount} ${tSalles(
              room.classCount > 1 ? 'plural.wordClasses.other' : 'plural.wordClasses.one',
            )} · ${room.sessionCount} ${tSalles(
              room.sessionCount > 1 ? 'plural.wordSessions.other' : 'plural.wordSessions.one',
            )}`
          : t('createSubtitle')
      }
      onClose={onClose}
      bodyClassName="px-6 py-5"
      footerClassName="px-6 py-3.5"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <Button type="button" variant="outline" className="w-fit" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="button" className="w-fit" loading={submitting} onClick={submit}>
            <Check size={14} />
            {room ? t('save') : t('create')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <FormGroup
            label={t('nameLabel')}
            required
            error={errors.name}
            htmlFor="room-name"
            className="flex-1"
          >
            <TextInput
              id="room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              autoFocus
            />
          </FormGroup>
          <FormGroup label={t('typeLabel')} required htmlFor="room-type" className="sm:w-[200px]">
            <BareSelect id="room-type" value={type} onValueChange={(v) => setType(v as RoomType)}>
              {ROOM_TYPES.map((rt) => (
                <SelectItem key={rt} value={rt}>
                  {ROOM_TYPE_LABELS[rt]}
                </SelectItem>
              ))}
            </BareSelect>
          </FormGroup>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <FormGroup
            label={t('capacityLabel')}
            labelHint={t('capacityHint')}
            error={errors.capacity}
            htmlFor="room-capacity"
            className="sm:w-[140px]"
            hint={t('capacityAlertHint')}
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
          <FormGroup label={t('buildingLabel')} optional htmlFor="room-building" className="flex-1">
            <TextInput
              id="room-building"
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              placeholder={t('buildingPlaceholder')}
            />
          </FormGroup>
          <FormGroup label={t('floorLabel')} optional htmlFor="room-floor" className="flex-1">
            <TextInput
              id="room-floor"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder={t('floorPlaceholder')}
            />
          </FormGroup>
        </div>
        <FormGroup label={t('equipmentLabel')} optional htmlFor="room-equipment">
          <TextArea
            id="room-equipment"
            className="min-h-14"
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            placeholder={t('equipmentPlaceholder')}
          />
        </FormGroup>
        <div className="rounded-md border border-border px-3">
          <ToggleRow
            title={t('activeTitle')}
            description={t('activeDesc')}
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
