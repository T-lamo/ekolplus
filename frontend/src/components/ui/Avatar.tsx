// Initials avatar with a deterministic color per name — Banani's mockups use
// stock photo avatars (storage.googleapis.com/banani-avatars/...) which we
// deliberately don't reproduce (third-party fixture assets, not a design
// token); initials-in-a-colored-circle is the standard fallback and matches
// the Sidebar's own current-user avatar treatment.
const PALETTE = [
  '#6C4CFF',
  '#2563eb',
  '#16A34A',
  '#e65100',
  '#c2185b',
  '#0d9488',
  '#7c3aed',
  '#d93025',
];

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash);
}

function initials(name: string): string {
  const cleaned = name.replace(/^(M\.|Mme|Mlle)\s+/i, '').trim();
  const parts = cleaned.split(/\s+/);
  return (parts[0]?.[0] ?? '').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase();
}

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const color = PALETTE[hashString(name) % PALETTE.length]!;
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: color }}
    >
      {initials(name)}
    </div>
  );
}
