import {
  AsYouType,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';

export interface Country {
  iso2: CountryCode;
  name: string;
  dialCode: string;
}

// Regional-indicator flag emoji derived from the ISO 3166-1 alpha-2 code —
// no flag image/asset package needed.
export function flagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

// Sénégal first (this starter's primary market), then the rest of
// Francophone West/Central Africa, then the rest of the world. Not
// exhaustive (ISO 3166 has ~195 entries) but covers the full UEMOA/CEMAC
// zone plus every major global region. `CountryCode` is libphonenumber-js's
// own ISO2 union, so a typo'd code fails typecheck instead of silently
// producing a wrong/missing dial code.
const COUNTRY_NAMES: [CountryCode, string][] = [
  ['SN', 'Sénégal'],
  ['CI', "Côte d'Ivoire"],
  ['ML', 'Mali'],
  ['BF', 'Burkina Faso'],
  ['BJ', 'Bénin'],
  ['TG', 'Togo'],
  ['NE', 'Niger'],
  ['GN', 'Guinée'],
  ['GW', 'Guinée-Bissau'],
  ['MR', 'Mauritanie'],
  ['CV', 'Cap-Vert'],
  ['GM', 'Gambie'],
  ['SL', 'Sierra Leone'],
  ['LR', 'Liberia'],
  ['GH', 'Ghana'],
  ['NG', 'Nigeria'],
  ['CM', 'Cameroun'],
  ['TD', 'Tchad'],
  ['CF', 'République centrafricaine'],
  ['GA', 'Gabon'],
  ['CG', 'Congo-Brazzaville'],
  ['CD', 'RD Congo'],
  ['GQ', 'Guinée équatoriale'],
  ['RW', 'Rwanda'],
  ['BI', 'Burundi'],
  ['MA', 'Maroc'],
  ['DZ', 'Algérie'],
  ['TN', 'Tunisie'],
  ['LY', 'Libye'],
  ['EG', 'Égypte'],
  ['SD', 'Soudan'],
  ['KE', 'Kenya'],
  ['TZ', 'Tanzanie'],
  ['UG', 'Ouganda'],
  ['ET', 'Éthiopie'],
  ['SO', 'Somalie'],
  ['DJ', 'Djibouti'],
  ['ER', 'Érythrée'],
  ['MG', 'Madagascar'],
  ['MU', 'Maurice'],
  ['KM', 'Comores'],
  ['SC', 'Seychelles'],
  ['ZM', 'Zambie'],
  ['ZW', 'Zimbabwe'],
  ['MW', 'Malawi'],
  ['MZ', 'Mozambique'],
  ['NA', 'Namibie'],
  ['BW', 'Botswana'],
  ['ZA', 'Afrique du Sud'],
  ['LS', 'Lesotho'],
  ['SZ', 'Eswatini'],
  ['AO', 'Angola'],
  ['FR', 'France'],
  ['BE', 'Belgique'],
  ['CH', 'Suisse'],
  ['LU', 'Luxembourg'],
  ['DE', 'Allemagne'],
  ['GB', 'Royaume-Uni'],
  ['ES', 'Espagne'],
  ['PT', 'Portugal'],
  ['IT', 'Italie'],
  ['NL', 'Pays-Bas'],
  ['IE', 'Irlande'],
  ['AT', 'Autriche'],
  ['SE', 'Suède'],
  ['NO', 'Norvège'],
  ['DK', 'Danemark'],
  ['FI', 'Finlande'],
  ['PL', 'Pologne'],
  ['CZ', 'République tchèque'],
  ['RO', 'Roumanie'],
  ['GR', 'Grèce'],
  ['HU', 'Hongrie'],
  ['UA', 'Ukraine'],
  ['RU', 'Russie'],
  ['TR', 'Turquie'],
  ['US', 'États-Unis'],
  ['CA', 'Canada'],
  ['HT', 'Haïti'],
  ['MX', 'Mexique'],
  ['BR', 'Brésil'],
  ['AR', 'Argentine'],
  ['CL', 'Chili'],
  ['CO', 'Colombie'],
  ['PE', 'Pérou'],
  ['VE', 'Venezuela'],
  ['DO', 'République dominicaine'],
  ['LB', 'Liban'],
  ['SA', 'Arabie saoudite'],
  ['AE', 'Émirats arabes unis'],
  ['QA', 'Qatar'],
  ['CN', 'Chine'],
  ['IN', 'Inde'],
  ['JP', 'Japon'],
  ['KR', 'Corée du Sud'],
  ['VN', 'Vietnam'],
  ['TH', 'Thaïlande'],
  ['ID', 'Indonésie'],
  ['MY', 'Malaisie'],
  ['SG', 'Singapour'],
  ['PH', 'Philippines'],
  ['PK', 'Pakistan'],
  ['IL', 'Israël'],
  ['AU', 'Australie'],
  ['NZ', 'Nouvelle-Zélande'],
];

// Dial codes are computed from libphonenumber-js's own metadata rather than
// hand-typed, so the code shown next to a flag is always the one its
// formatter/validator actually uses for that country.
export const COUNTRIES: Country[] = COUNTRY_NAMES.map(([iso2, name]) => ({
  iso2,
  name,
  dialCode: `+${getCountryCallingCode(iso2)}`,
}));

export const DEFAULT_COUNTRY: Country = COUNTRIES[0]!;

// Longest-dial-code-first so "+1" (US/CA/DO) doesn't shadow a match that
// should resolve to a longer code sharing the same prefix.
const BY_DIAL_CODE_DESC = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);

/** Splits a stored "+<dialcode><national>" string into country + national part. */
export function splitPhoneValue(value: string | null | undefined): {
  country: Country;
  national: string;
} {
  const v = (value ?? '').trim();
  if (!v) return { country: DEFAULT_COUNTRY, national: '' };

  // Prefer libphonenumber-js's own metadata-backed country detection —
  // more reliable than prefix matching for shared dial codes (NANP's +1
  // covers the US, Canada, and a dozen Caribbean states).
  const parsed = parsePhoneNumberFromString(v);
  if (parsed?.country) {
    const match = COUNTRIES.find((c) => c.iso2 === parsed.country);
    if (match) return { country: match, national: parsed.nationalNumber };
  }

  // Fallback for input too short/malformed to parse yet (e.g. mid-typing).
  const fallback = BY_DIAL_CODE_DESC.find((c) => v.startsWith(c.dialCode));
  if (!fallback) return { country: DEFAULT_COUNTRY, national: v.replace(/^\+/, '') };
  return { country: fallback, national: v.slice(fallback.dialCode.length) };
}

/** Live "as you type" formatting of the national number, per the selected country's convention. */
export function formatAsYouType(country: Country, national: string): string {
  const digits = national.replace(/\D/g, '');
  if (!digits) return '';
  return new AsYouType(country.iso2).input(digits);
}

/**
 * Combines country + national digits into the string stored/sent to the
 * server. Prefers libphonenumber-js's clean E.164 output once the number is
 * complete and valid for that country; falls back to a plain
 * dial-code+digits concatenation while the user is still typing, so partial
 * input is never silently dropped.
 */
export function joinPhoneValue(country: Country, national: string): string {
  const digits = national.replace(/\D/g, '');
  if (!digits) return '';
  const parsed = parsePhoneNumberFromString(digits, country.iso2);
  if (parsed?.isValid()) return parsed.number;
  return `${country.dialCode}${digits}`;
}

/** True once there's enough input to meaningfully judge validity — avoids flashing an error on the first digit or two. */
export function isLikelyInvalid(country: Country, national: string): boolean {
  const digits = national.replace(/\D/g, '');
  if (digits.length < 6) return false;
  return !isValidPhoneNumber(digits, country.iso2);
}
