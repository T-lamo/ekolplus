// The Enseignants list was absorbed into the unified Personnel module (spec
// docs/superpowers/specs/2026-09-04-personnel-module-design.md §6.1) — the
// sidebar entry now points at /personnel directly. This file stays in place
// (not deleted) so any existing bookmark or external link to /enseignants
// keeps working instead of 404ing.
import { redirect } from 'next/navigation';

export default function EnseignantsRedirectPage() {
  redirect('/personnel');
}
