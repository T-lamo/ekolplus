// Server-side locale resolution — next-intl's "without routing" pattern
// (docs: https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing).
// Runs once per request (React `cache`-wrapped internally by next-intl);
// the first Server Component that needs a translation triggers it.
//
// Resolution order: sg-locale cookie (set by LocaleContext once a visitor
// has ever picked a language) → Accept-Language header (first visit,
// anonymous) → French.
//
// Phase 0 has two message namespaces (Common, Login); later phases add
// more `import()` + object-spread entries here as each screen migrates —
// there is no directory-scan helper by design, so every namespace this
// file serves is explicit and grep-able.
import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE_NAME, matchAcceptLanguage, resolveLocaleKey } from '@/lib/locales';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const locale = cookieValue
    ? resolveLocaleKey(cookieValue)
    : matchAcceptLanguage((await headers()).get('accept-language'));

  const [
    common,
    login,
    shell,
    schoolSidebar,
    adminSidebar,
    schoolTopbar,
    adminTopbar,
    forgotPassword,
    resetPassword,
    verifyEmail,
    dashboard,
    adminDashboard,
    schoolPlanCard,
    settings,
    themePicker,
    presences,
    enseignants,
    eleves,
    fees,
  ] = await Promise.all([
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/login.json`),
    import(`../messages/${locale}/shell.json`),
    import(`../messages/${locale}/schoolSidebar.json`),
    import(`../messages/${locale}/adminSidebar.json`),
    import(`../messages/${locale}/schoolTopbar.json`),
    import(`../messages/${locale}/adminTopbar.json`),
    import(`../messages/${locale}/forgotPassword.json`),
    import(`../messages/${locale}/resetPassword.json`),
    import(`../messages/${locale}/verifyEmail.json`),
    import(`../messages/${locale}/dashboard.json`),
    import(`../messages/${locale}/adminDashboard.json`),
    import(`../messages/${locale}/schoolPlanCard.json`),
    import(`../messages/${locale}/settings.json`),
    import(`../messages/${locale}/themePicker.json`),
    import(`../messages/${locale}/presences.json`),
    import(`../messages/${locale}/enseignants.json`),
    import(`../messages/${locale}/eleves.json`),
    import(`../messages/${locale}/fees.json`),
  ]);

  return {
    locale,
    messages: {
      Common: common.default,
      Login: login.default,
      Shell: shell.default,
      SchoolSidebar: schoolSidebar.default,
      AdminSidebar: adminSidebar.default,
      SchoolTopbar: schoolTopbar.default,
      AdminTopbar: adminTopbar.default,
      ForgotPassword: forgotPassword.default,
      ResetPassword: resetPassword.default,
      VerifyEmail: verifyEmail.default,
      Dashboard: dashboard.default,
      AdminDashboard: adminDashboard.default,
      SchoolPlanCard: schoolPlanCard.default,
      Settings: settings.default,
      ThemePicker: themePicker.default,
      Presences: presences.default,
      Enseignants: enseignants.default,
      Eleves: eleves.default,
      Fees: fees.default,
    },
  };
});
