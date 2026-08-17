// Icône Lucide par type de salle (catalogue configuration/salles) — partagée
// par la liste des salles, le formulaire classe et la modale de séance.
import {
  DoorOpen,
  Dumbbell,
  FlaskConical,
  MapPin,
  Monitor,
  Palette,
  type LucideIcon,
} from 'lucide-react';
import type { RoomType } from '@/lib/rooms';

const ICONS: Record<RoomType, LucideIcon> = {
  CLASSROOM: DoorOpen,
  LAB: FlaskConical,
  COMPUTER: Monitor,
  SPORTS: Dumbbell,
  ARTS: Palette,
  OTHER: MapPin,
};

export function roomTypeIcon(type: string): LucideIcon {
  return (ICONS as Record<string, LucideIcon>)[type] ?? MapPin;
}
