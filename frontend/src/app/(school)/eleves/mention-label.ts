// Used by AppreciationsTab.tsx — replaces the old `MENTION_LABEL` runtime
// export from ./types (kept as a plain type there now). Unrelated to the
// separate `MENTION_LABEL` in pedagogie/appreciations/types.ts, which is
// its own independent copy for a different (not-yet-migrated) screen.
import type { Mention } from './types';

export type MentionLabelT = (key: Mention) => string;

/** `t` must be scoped to `Eleves.mention` (`useTranslations('Eleves.mention')`). */
export function mentionLabel(mention: Mention, t: MentionLabelT): string {
  return t(mention);
}
