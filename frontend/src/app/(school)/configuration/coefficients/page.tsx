import { redirect } from 'next/navigation';

// Retired 2026-08-17 — coefficients now live in the fiche classe's
// « Détail des matières » table (edited inline per class × subject) and on
// each subject's own fiche (`defaultCoefficient` field). Kept as a redirect
// rather than a hard 404 so old bookmarks / shared links still land
// somewhere useful. See .planning/banani/STATUS.md.
export default async function CoefficientsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const { classId } = await searchParams;
  redirect(classId ? `/configuration/classes/${classId}#card-matieres` : '/configuration/matieres');
}
