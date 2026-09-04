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
    billingPlans,
    abonnement,
    abonnementPaiement,
    settings,
    themePicker,
    presences,
    enseignants,
    eleves,
    configuration,
    gradebook,
    fees,
    appreciations,
    timetable,
    setPassword,
    teacherPortal,
    teacherClasses,
    teacherTimetable,
    teacherStudents,
    teacherGradebook,
    teacherAppreciations,
    setPasswordEleve,
    elevePortal,
    permissions,
    spaces,
    personnel,
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
    import(`../messages/${locale}/billingPlans.json`),
    import(`../messages/${locale}/abonnement.json`),
    import(`../messages/${locale}/abonnementPaiement.json`),
    import(`../messages/${locale}/settings.json`),
    import(`../messages/${locale}/themePicker.json`),
    import(`../messages/${locale}/presences.json`),
    import(`../messages/${locale}/enseignants.json`),
    import(`../messages/${locale}/eleves.json`),
    import(`../messages/${locale}/configuration.json`),
    import(`../messages/${locale}/gradebook.json`),
    import(`../messages/${locale}/fees.json`),
    import(`../messages/${locale}/appreciations.json`),
    import(`../messages/${locale}/timetable.json`),
    import(`../messages/${locale}/setPassword.json`),
    import(`../messages/${locale}/teacherPortal.json`),
    import(`../messages/${locale}/teacherClasses.json`),
    import(`../messages/${locale}/teacherTimetable.json`),
    import(`../messages/${locale}/teacherStudents.json`),
    import(`../messages/${locale}/teacherGradebook.json`),
    import(`../messages/${locale}/teacherAppreciations.json`),
    import(`../messages/${locale}/setPasswordEleve.json`),
    import(`../messages/${locale}/elevePortal.json`),
    import(`../messages/${locale}/permissions.json`),
    import(`../messages/${locale}/spaces.json`),
    import(`../messages/${locale}/personnel.json`),
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
      BillingPlans: billingPlans.default,
      Abonnement: abonnement.default,
      AbonnementPaiement: abonnementPaiement.default,
      Settings: settings.default,
      ThemePicker: themePicker.default,
      Presences: presences.default,
      Enseignants: enseignants.default,
      Eleves: eleves.default,
      Configuration: configuration.default,
      Gradebook: gradebook.default,
      Fees: fees.default,
      Appreciations: appreciations.default,
      Timetable: timetable.default,
      SetPassword: setPassword.default,
      TeacherPortal: teacherPortal.default,
      TeacherClasses: teacherClasses.default,
      TeacherTimetable: teacherTimetable.default,
      TeacherStudents: teacherStudents.default,
      TeacherGradebook: teacherGradebook.default,
      TeacherAppreciations: teacherAppreciations.default,
      SetPasswordEleve: setPasswordEleve.default,
      ElevePortal: elevePortal.default,
      Permissions: permissions.default,
      Spaces: spaces.default,
      Personnel: personnel.default,
    },
  };
});
