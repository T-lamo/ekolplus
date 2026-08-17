import { redirect } from 'next/navigation';

// Retired 2026-08-17 — teacher×subject×class affectations are now edited
// inline from each subject's fiche (« Affectations » tab) and from the fiche
// classe's « Détail des matières » table, instead of a separate standalone
// screen. Kept as a redirect rather than a hard 404 so old bookmarks /
// shared links still land somewhere useful. See .planning/banani/STATUS.md.
export default function AffectationsRedirectPage() {
  redirect('/configuration/matieres');
}
