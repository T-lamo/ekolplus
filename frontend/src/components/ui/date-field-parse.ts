// Pure helpers behind `DateField`'s typed input — kept out of the component
// so the parsing rules are unit-tested without React.
//
// Contract: dates travel as 'YYYY-MM-DD' strings ('' when empty), the same
// as `<input type="date">`, so no form/API/zod schema changes when the field
// gains a typed input.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// jj/mm/aaaa with / - . or space as separator, 1–2 digit day/month, 4-digit
// year (a 2-digit year is ambiguous → refused rather than guessed).
const DMY_RE = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/;
const DIGITS8_RE = /^(\d{2})(\d{2})(\d{4})$/;

const pad = (n: number) => String(n).padStart(2, '0');

function isoOf(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Real calendar check (31/02, 30/02, 29/02 on non-leap years, …).
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Text typed by the user → ISO date, or null when it isn't a real date (or
 * falls outside the inclusive `min`/`max` ISO bounds). No year cap. */
export function parseTypedDate(
  raw: string,
  bounds: { min?: string | undefined; max?: string | undefined } = {},
): string | null {
  const text = raw.trim();
  if (!text) return null;
  let iso: string | null = null;
  let m: RegExpExecArray | null;
  if ((m = ISO_RE.exec(text))) iso = isoOf(Number(m[1]), Number(m[2]), Number(m[3]));
  else if ((m = DMY_RE.exec(text))) iso = isoOf(Number(m[3]), Number(m[2]), Number(m[1]));
  else if ((m = DIGITS8_RE.exec(text))) iso = isoOf(Number(m[3]), Number(m[2]), Number(m[1]));
  if (!iso) return null;
  // ISO strings compare lexicographically as dates.
  if (bounds.min && iso < bounds.min) return null;
  if (bounds.max && iso > bounds.max) return null;
  return iso;
}

/** Progressive jj/mm/aaaa mask: only touches input made of digits and
 * slashes (the typing path); anything with other separators — a pasted
 * "2025-06-16" or "16.06.2025" — is left as typed for `parseTypedDate`. */
export function maskDateInput(raw: string): string {
  if (!/^[\d/]*$/.test(raw)) return raw;
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  let out = d;
  if (digits.length > 2) out += `/${m}`;
  if (digits.length > 4) out += `/${y}`;
  return out;
}

/** ISO → jj/mm/aaaa for the edit box ('' when empty or malformed). */
export function formatTyped(iso: string): string {
  const m = ISO_RE.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
