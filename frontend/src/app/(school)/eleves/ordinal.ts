// Formats a rank as an ordinal ("3e" fr, "3rd" en) using the real CLDR
// ordinal-plural category for the display locale, rather than hardcoding
// a single "e" suffix — French only ever selects 'one'/'other', but
// English distinguishes 'one'/'two'/'few'/'other' (1st/2nd/3rd/4th), so a
// fixed suffix would silently mistranslate "2e"/"3e" as "2th"/"3th".
export type OrdinalCategory = 'one' | 'two' | 'few' | 'other';
export type OrdinalT = (key: OrdinalCategory, values: { rank: number }) => string;

export function formatOrdinal(rank: number, bcp47: string, t: OrdinalT): string {
  const category = new Intl.PluralRules(bcp47, { type: 'ordinal' }).select(rank);
  const key: OrdinalCategory =
    category === 'one' || category === 'two' || category === 'few' ? category : 'other';
  return t(key, { rank });
}
