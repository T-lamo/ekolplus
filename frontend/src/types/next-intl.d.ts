// Type-safe translation keys: augments next-intl's AppConfig so
// `useTranslations('Login')` only accepts real keys from Login.json, and
// a typo like `t('sumbit')` is a compile error instead of a silent
// "sumbit" rendered to real users. French is the source of truth for the
// KEY SET (all 3 locales are asserted identical in locales.test.ts, so
// any locale would do here — French is simply this app's original
// language). See https://next-intl.dev/docs/workflows/typescript.
import type common from '@/messages/fr/common.json';
import type login from '@/messages/fr/login.json';
import type shell from '@/messages/fr/shell.json';
import type schoolSidebar from '@/messages/fr/schoolSidebar.json';
import type adminSidebar from '@/messages/fr/adminSidebar.json';
import type schoolTopbar from '@/messages/fr/schoolTopbar.json';
import type adminTopbar from '@/messages/fr/adminTopbar.json';
import type forgotPassword from '@/messages/fr/forgotPassword.json';
import type resetPassword from '@/messages/fr/resetPassword.json';
import type verifyEmail from '@/messages/fr/verifyEmail.json';
import type dashboard from '@/messages/fr/dashboard.json';
import type { LOCALE_KEYS } from '@/lib/locales';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof LOCALE_KEYS)[number];
    Messages: {
      Common: typeof common;
      Login: typeof login;
      Shell: typeof shell;
      SchoolSidebar: typeof schoolSidebar;
      AdminSidebar: typeof adminSidebar;
      SchoolTopbar: typeof schoolTopbar;
      AdminTopbar: typeof adminTopbar;
      ForgotPassword: typeof forgotPassword;
      ResetPassword: typeof resetPassword;
      VerifyEmail: typeof verifyEmail;
      Dashboard: typeof dashboard;
    };
  }
}
