// Username format for no-email accounts (module Personnel, spec
// 2026-09-04-personnel-module-design.md §4). Pure — no `server-only`, so
// the live-availability field on the client can validate format before
// even calling the API. Never contains "@": the login route relies on
// that single character to route an identifier to the email or username
// lookup, so a valid username can never be mistaken for an email.
import { z } from 'zod';

export const USERNAME_REGEX = /^[a-z][a-z0-9._-]{2,29}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export const zUsername = z
  .string()
  .transform(normalizeUsername)
  .refine((v) => USERNAME_REGEX.test(v), 'Invalid username');
