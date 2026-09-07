// The teacher fiche was absorbed into the unified Personnel module (spec
// docs/superpowers/specs/2026-09-04-personnel-module-design.md §6.1) — the
// same Teacher.id now resolves at /personnel/[id] (personnel/view.ts tries
// Teacher.id before falling back to User.id, so this is a same-id redirect,
// not a lookup). This file stays in place (not deleted) so any existing
// bookmark or external link to /enseignants/[id] keeps working instead of
// 404ing — mirrors the sibling /enseignants list redirect from Task 4.
import { redirect } from 'next/navigation';

export default async function EnseignantProfileRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/personnel/${id}`);
}
