// Initials avatar with a deterministic color per name — Banani's mockups use
// stock photo avatars (storage.googleapis.com/banani-avatars/...) which we
// deliberately don't reproduce (third-party fixture assets, not a design
// token); initials-in-a-colored-circle is the standard fallback and matches
// the Sidebar's own current-user avatar treatment.
// Every entry keeps white initials ≥ 4.5:1 (WCAG AA — Lighthouse
// color-contrast): green/orange/teal were darkened one step (3.3 / 3.8 / 3.7
// → 5.0 / 5.2 / 5.5) on 2026-08-19; hue order unchanged so existing names
// keep their colour family. Data colours — deliberately NOT themed.
const PALETTE = [
  '#6C4CFF',
  '#2563eb',
  '#15803d',
  '#c2410c',
  '#c2185b',
  '#0f766e',
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

export function Avatar({
  name,
  size = 24,
  src,
}: {
  name: string;
  size?: number;
  /** Real uploaded photo (e.g. User.avatarUrl) — falls back to initials when absent. */
  src?: string | null | undefined;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
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
