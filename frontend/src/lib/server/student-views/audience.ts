// Who a per-student read model is being built for. `staff` is the fiche
// élève (school app) and keeps everything the school sees; `student` is
// the Espace Élève and applies the portal rules from the Phase 2 spec
// (docs/superpowers/specs/2026-09-02-espace-eleve-phase2-design.md): no
// nominative ranking, no prev/next classmate ids, PUBLISHED evaluations
// and appreciations only. A plain type module (no `server-only`) so the
// print-token payload and its test can import it too.
export type ViewAudience = 'staff' | 'student';
