// Registre → composant lucide (`PermissionModule.icon` est une string kebab
// pure, pour rester importable côté serveur sans tirer React ; ce fichier est
// le seul point qui la résout en composant, côté client).
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  NotebookPen,
  MessageSquareText,
  CalendarCheck,
  CalendarDays,
  Wallet,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react';

export const PERMISSION_MODULE_ICONS: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  users: Users,
  'user-check': UserCheck,
  'notebook-pen': NotebookPen,
  'message-square-text': MessageSquareText,
  'calendar-check': CalendarCheck,
  'calendar-days': CalendarDays,
  wallet: Wallet,
  'settings-2': Settings2,
  'sliders-horizontal': SlidersHorizontal,
};
