// Initial password for a username-only account (module Personnel, spec
// 2026-09-04-personnel-module-design.md §5.3). Generated once, hashed
// immediately (hashPassword from auth.ts), returned in the creating
// route's response ONE time and never persisted or logged in clear text.
import 'server-only';
import { randomInt } from 'node:crypto';

// Excludes 0/O/1/l/I — characters an admin reading this off a screen and
// dictating it over the phone could easily transpose.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const LENGTH = 12;

function isUppercase(c: string): boolean {
  return c >= 'A' && c <= 'Z';
}
function isLowercase(c: string): boolean {
  return c >= 'a' && c <= 'z';
}
function isDigit(c: string): boolean {
  return c >= '2' && c <= '9';
}

export function generateInitialPassword(): string {
  for (;;) {
    let out = '';
    for (let i = 0; i < LENGTH; i++) {
      out += ALPHABET[randomInt(ALPHABET.length)];
    }
    if ([...out].some(isUppercase) && [...out].some(isLowercase) && [...out].some(isDigit)) {
      return out;
    }
  }
}
