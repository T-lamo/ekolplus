// Client-side formatting helpers shared by the 8 SaaS admin screens — one
// place so amount/date rendering can never drift between Dashboard, Écoles,
// Utilisateurs, Statistiques and the 3 Facturation pages.
// See .planning/banani/epic-2-admin-foundation.md.
//
// SaaS billing is integer USD cents everywhere (Epic 2 decision Q4) — these
// helpers are the only place cents become display strings.
//
// Locale note: every helper here is hardcoded to French vocabulary and
// fr-FR number grouping regardless of the active UI locale — deliberate,
// not an oversight, since this module is shared across all 8 admin screens
// and only one (the dashboard) is translated so far. Revisit when the rest
// of /admin/* gets its own i18n migration phase.

/** "$389.60" — table amounts, always 2 decimals, fr grouping (space). */
export function fmtUsd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const units = Math.floor(abs / 100)
    .toLocaleString('fr-FR')
    .replace(/\s/g, ' ');
  const dec = String(abs % 100).padStart(2, '0');
  return `${sign}$${units}.${dec}`;
}

/** "$14 205" — KPI amounts, rounded to whole dollars. */
export function fmtUsdRound(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const units = Math.round(Math.abs(cents) / 100)
    .toLocaleString('fr-FR')
    .replace(/\s/g, ' ');
  return `${sign}$${units}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c.getTime();
}

/** "Aujourd'hui" / "Hier" / "Il y a N j." — Écoles "Dernier accès" column. */
export function fmtRelativeDay(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = new Date(d);
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY_MS);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  return `Il y a ${days} j.`;
}

/** "Aujourd'hui, 08:42" / "Hier, 15:20" / "Il y a 8 jours" — Utilisateurs
 * "Dernière connexion" column. */
export function fmtRelativeWithTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = new Date(d);
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY_MS);
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (days <= 0) return `Aujourd'hui, ${time}`;
  if (days === 1) return `Hier, ${time}`;
  return `Il y a ${days} jours`;
}

/** "12 sept. 2023" — inscription dates across the admin tables. */
export function fmtDateMed(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** "Mars 2025" — covered-period label on billing transactions. */
export function fmtMonthYear(d: string | Date): string {
  const s = new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "25%" / "-$50" / "1 mois" — coupon discount, same wording everywhere. */
export function couponDiscountLabel(
  type: 'PERCENT' | 'FIXED' | 'FREE_MONTH',
  value: number,
): string {
  if (type === 'PERCENT') return `${value}%`;
  if (type === 'FIXED') return `-${fmtUsdRound(value)}`;
  return `${value} mois`;
}

/** "Il y a 2h" / "Hier" / "Il y a 4j" — compact recency for activity feeds. */
export function fmtAgoCompact(d: string | Date): string {
  const ms = Date.now() - new Date(d).getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "À l'instant";
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hier';
  return `Il y a ${days}j`;
}
