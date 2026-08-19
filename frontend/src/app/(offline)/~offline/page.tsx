// Shown by the service worker (see sw.ts's `fallbacks`) when a navigation
// isn't in the precache/runtime cache AND the network is unreachable — the
// last-resort screen instead of the browser's own "no internet" page.
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <h1 className="text-xl font-bold text-foreground">Pas de connexion</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Cette page n&apos;a pas encore été chargée hors-ligne. Reconnecte-toi puis réessaie — les
        écrans déjà consultés (présences, notes, appréciations) restent disponibles hors-ligne.
      </p>
    </main>
  );
}
