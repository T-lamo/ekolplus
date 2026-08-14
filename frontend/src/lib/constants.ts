// Monolith: the API lives in the same Next.js app under /api/*, so the
// default is an empty string (same-origin / relative fetch). Override only
// for rare cross-origin setups (e.g. a mobile client hitting a hosted
// instance). The legacy `http://localhost:4000` default was a leftover from
// the pre-monolith era when the backend ran as a separate Express server.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
export const COOKIE_PREFIX = process.env.NEXT_PUBLIC_COOKIE_PREFIX ?? 'app';

// French copy for the login screen — see .planning/banani/login-page.md.
export const AUTH_LOGIN = {
  brandName: 'School',
  brandSuffix: 'gesti',
  headline: 'Gérez votre école, simplement.',
  subline:
    'La plateforme tout-en-un pour les établissements scolaires : notes, présences, bulletins et bien plus.',
  features: [
    'Saisie et gestion des notes par matière',
    'Suivi des présences en temps réel',
    'Génération automatique des bulletins',
    'Statistiques et rapports détaillés',
  ],
  welcome: 'Bienvenue 👋',
  formSubtitle:
    'Connectez-vous à votre espace pour accéder au tableau de bord de votre établissement.',
  roleTabs: {
    admin: 'Administrateur',
    teacher: 'Enseignant',
    studentParent: 'Élève / Parent',
  },
  emailLabel: 'Adresse e-mail',
  passwordLabel: 'Mot de passe',
  forgotPassword: 'Mot de passe oublié ?',
  rememberMe: 'Se souvenir de moi sur cet appareil',
  submit: 'Se connecter',
  submitting: 'Connexion…',
  noAccount: 'Pas encore de compte ?',
  contactAdmin: "Contacter l'administrateur",
  securityNote: 'Connexion sécurisée — vos données sont chiffrées',
  errors: {
    TOO_MANY_LOGIN_ATTEMPTS: 'Trop de tentatives. Réessaie dans quelques minutes.',
    default: 'E-mail ou mot de passe incorrect.',
    network: 'Erreur réseau. Réessaie.',
  },
} as const;

// French copy for the "Mot de passe oublié" screen.
export const AUTH_FORGOT_PASSWORD = {
  title: 'Mot de passe oublié ?',
  subtitle: 'Indique ton adresse e-mail — on t’envoie un code pour réinitialiser ton mot de passe.',
  emailLabel: 'Adresse e-mail',
  submit: 'Envoyer le code',
  submitting: 'Envoi…',
  backToLogin: 'Retour à la connexion',
  confirmation: {
    title: 'Vérifie ta boîte mail',
    body: (email: string) =>
      `Si un compte existe pour ${email}, un code de réinitialisation vient d'être envoyé — il expire dans 15 minutes.`,
  },
  errors: {
    TOO_MANY_FORGOT_ATTEMPTS: 'Trop de demandes pour cette adresse. Réessaie dans une heure.',
    default: 'Une erreur est survenue. Réessaie.',
    network: 'Erreur réseau. Réessaie.',
  },
} as const;

// French copy for the /reset-password screen — consumes a PASSWORD_RESET
// code sent by /forgot-password. Does not log the user in (the API route
// deliberately issues no cookies) — success sends them back to /login.
export const AUTH_RESET_PASSWORD = {
  title: 'Réinitialise ton mot de passe',
  subtitle: 'Entre le code reçu par email et choisis un nouveau mot de passe.',
  emailLabel: 'Adresse e-mail',
  codeLabel: 'Code de réinitialisation',
  codePlaceholder: 'XXXXXXXX',
  passwordLabel: 'Nouveau mot de passe',
  submit: 'Réinitialiser le mot de passe',
  submitting: 'Réinitialisation…',
  backToLogin: 'Retour à la connexion',
  done: {
    title: 'Mot de passe mis à jour 🎉',
    subtitle: 'Tu peux maintenant te connecter avec ton nouveau mot de passe.',
    cta: 'Se connecter',
  },
  errors: {
    VERIFICATION_CODE_INVALID: 'Code invalide. Vérifie ta saisie.',
    VERIFICATION_CODE_EXPIRED: 'Ce code a expiré — demande-en un nouveau.',
    TOO_MANY_RESET_ATTEMPTS: 'Trop de tentatives. Réessaie dans quelques minutes.',
    PASSWORD_BANNED: 'Ce mot de passe est trop courant — choisis-en un autre.',
    PASSWORD_TOO_SHORT: 'Mot de passe trop court.',
    PASSWORD_PWNED: 'Ce mot de passe est apparu dans une fuite de données connue.',
    default: 'Une erreur est survenue. Réessaie.',
    network: 'Erreur réseau. Réessaie.',
  },
} as const;

// French copy for the "Créer une école" admin screen — see
// .planning/banani/create-school.md.
export const ADMIN_CREATE_SCHOOL = {
  backToSchools: 'Retour aux écoles',
  title: 'Créer une nouvelle école',
  subtitle: "Renseignez les informations de l'établissement",
  schoolSection: {
    title: "Informations de l'établissement",
    subtitle: "Nom, localisation et type d'école",
    schoolName: "Nom de l'école",
    shortName: 'Nom abrégé / Sigle',
    shortNameHint: 'Utilisé pour les avatars et badges de l’école',
    country: 'Pays',
    city: 'Ville',
    schoolType: "Type d'établissement",
    primaryLanguage: 'Langue principale',
    address: 'Adresse complète',
    addressPlaceholder: 'Ex : 12, Rue des Mangues, Pétion-Ville',
    phone: 'Téléphone',
    phonePlaceholder: '+509...',
    estimatedStudents: "Nombre d'élèves estimé",
    estimatedStudentsHint: 'Utilisé pour estimer le coût mensuel',
  },
  adminSection: {
    title: 'Administrateur responsable',
    subtitle: 'Compte principal qui recevra les identifiants',
    firstName: 'Prénom',
    lastName: 'Nom',
    email: 'Adresse e-mail',
    emailHint: 'Un email de vérification sera envoyé à cette adresse pour activer le compte',
    role: 'Rôle',
    phone: 'Téléphone',
  },
  schoolTypes: [
    'École primaire',
    'École secondaire',
    'École primaire & secondaire',
    'Université',
    'Autre',
  ],
  submit: 'Créer l’école',
  submitting: 'Création…',
  requiredFieldsError: 'Merci de remplir tous les champs obligatoires.',
  successTitle: 'École créée avec succès',
  newAccountCreated: 'Un nouveau compte a été créé pour le propriétaire de cette école.',
  existingAccountLinked: 'Le compte existant a été ajouté comme propriétaire de cette école.',
  verificationEmailSentLabel: 'Email de vérification envoyé',
  verificationEmailSentNote:
    'Le propriétaire doit saisir le code reçu par email sur la page de vérification pour activer son compte et définir son propre mot de passe.',
  backToDashboard: 'Retour au tableau de bord',
} as const;

// Statut catalog for the Établissement settings tab's "Type d'établissement"
// field — distinct from ADMIN_CREATE_SCHOOL.schoolTypes, which models
// teaching *levels* (relabeled "Niveaux d'enseignement" on this same tab).
export const SCHOOL_STATUTES = [
  'École publique',
  'École privée laïque',
  'École privée confessionnelle',
  'École communautaire',
  'École internationale',
  'Autre',
] as const;

// "Type de période" catalog for the Nouvelle période modal — Term.type.
export const TERM_TYPES = [
  { value: 'TRIMESTRE', label: 'Trimestre', sub: '3 par an', icon: 'calendar' },
  { value: 'SEMESTRE', label: 'Semestre', sub: '2 par an', icon: 'calendar-range' },
  { value: 'LIBRE', label: 'Période libre', sub: 'Personnalisée', icon: 'layers' },
] as const;

// French ordinal labels for the "Numéro de la période" picker — purely a
// default-label helper on the client (see AnneeScolaireTab), the server
// still auto-assigns Term.order sequentially.
export const ORDINAL_LABELS = ['1er', '2e', '3e', '4e', '5e', '6e', '7e', '8e'] as const;

// French copy for the /verify-email screen — consumes an EMAIL_VERIFY code
// (signup, or a school owner invited via /admin/schools/new), logs the user
// in, then offers a one-time "set your password" step for accounts created
// without one (owners invited by an admin).
export const AUTH_VERIFY_EMAIL = {
  title: 'Vérifie ton adresse e-mail',
  subtitle: 'Entre le code à 8 caractères reçu par email pour activer ton compte.',
  emailLabel: 'Adresse e-mail',
  codeLabel: 'Code de vérification',
  codePlaceholder: 'XXXXXXXX',
  submit: 'Vérifier',
  submitting: 'Vérification…',
  backToLogin: 'Retour à la connexion',
  setPassword: {
    title: 'Adresse vérifiée 🎉',
    subtitle: 'Choisis un mot de passe pour te connecter la prochaine fois.',
    passwordLabel: 'Nouveau mot de passe',
    submit: 'Définir le mot de passe',
    submitting: 'Enregistrement…',
    skip: 'Plus tard',
  },
  done: {
    title: 'Tout est prêt !',
    cta: 'Accéder au tableau de bord',
  },
  errors: {
    VERIFICATION_CODE_INVALID: 'Code invalide. Vérifie ta saisie.',
    VERIFICATION_CODE_EXPIRED: 'Ce code a expiré — demande-en un nouveau.',
    TOO_MANY_VERIFY_ATTEMPTS: 'Trop de tentatives. Réessaie dans quelques minutes.',
    default: 'Une erreur est survenue. Réessaie.',
    network: 'Erreur réseau. Réessaie.',
  },
} as const;

// French copy for Frais & Scolarité (Payment Configuration / Fee Management
// / Relances Impayés / Payment Registration) — see
// .planning/banani/frais-scolarite.md.
export const FEES = {
  currency: 'HTG',
  nav: { label: 'Frais & Scolarité' },
  tabs: {
    paiements: 'Suivi des paiements',
    relances: 'Relances & Impayés',
    configuration: 'Configuration',
  },
  studentStatusLabel: {
    UP_TO_DATE: 'À jour',
    PARTIAL: 'Partiel',
    OVERDUE: 'En retard',
    UNPAID: 'Non payé',
  },
  trancheStatusLabel: {
    PAID: 'Payée',
    PARTIAL: 'Partiel',
    OVERDUE: 'En retard',
    UPCOMING: 'À venir',
  },
  paymentMethodLabel: {
    ESPECES: 'Espèces',
    MONCASH: 'MonCash',
    NATCASH: 'Natcash',
    CHEQUE: 'Chèque',
    VIREMENT: 'Virement',
  },
  configuration: {
    title: "Configuration des Frais d'Études",
    subtitle:
      "Définissez les frais de scolarité et les tranches par classe pour l'année académique",
    classListTitle: 'Classes de l’école',
    classListSubtitle: 'Sélectionnez une classe à configurer',
    configuredCount: (done: number, total: number) => `Configurées ${done} / ${total}`,
    filterAll: 'Toutes',
    filterConfigured: 'Configurées',
    filterPending: 'En attente',
    classSearchPlaceholder: 'Filtrer les classes...',
    globalSettingsTitle: 'Paramètres globaux',
    latePenaltyToggle: 'Pénalités de retard',
    latePenaltyToggleDesc: 'Appliquer des frais après la date limite',
    autoRemindersToggle: 'Rappels automatiques',
    autoRemindersToggleDesc: 'Notifications avant l’échéance',
    currencyLabel: 'Devise principale',
    currencyValue: 'HTG — Gourde haïtienne',
    editorConfigured: 'Configuré',
    editorPending: 'En attente',
    editorSubtitle: 'Définissez le montant total et les tranches pour cette classe',
    copyFromClass: 'Copier depuis une classe',
    save: 'Enregistrer',
    generalInfoTitle: 'Informations générales',
    totalAmountLabel: 'Montant total annuel',
    registrationFeeLabel: "Frais d'inscription",
    academicYearLabel: 'Année académique',
    tranchesBuilderTitle: 'Configurateur de Tranches',
    tranchesBuilderSubtitle: (total: string, count: number) =>
      `Total réparti : ${total} sur ${count} versements`,
    distributionLabel: (pct: number) => `Répartition : ${pct}%`,
    distributionPrefix: 'Répartition :',
    addTranche: 'Ajouter une tranche',
    editTranche: 'Modifier la tranche',
    trancheLabelField: 'Libellé',
    trancheDueDateField: 'Date limite',
    trancheAmountField: 'Montant / Pourcentage',
    trancheLatePenaltyField: 'Pénalité de retard (optionnel)',
    trancheGraceDaysField: 'Délai de grâce (jours)',
    noLatePenalty: 'Aucune pénalité',
    trancheLatePenaltySummary: (percent: number, graceDays: number | null) =>
      graceDays != null ? `${percent}% après ${graceDays} j.` : `${percent}%`,
    saveTranche: 'Enregistrer',
    saveBarHelper: 'Les modifications ne seront appliquées qu’après enregistrement.',
    cancel: 'Annuler',
    saveConfiguration: 'Enregistrer la configuration',
    emptyClassPrompt: 'Aucune configuration — définissez le montant total pour commencer.',
    noClassFound: 'Aucune classe trouvée.',
    selectClassPrompt: 'Sélectionnez une classe.',
  },
  overview: {
    title: 'Gestion des Frais & Scolarité',
    subtitle: 'Suivi des paiements, tranches et relances',
    export: 'Exporter',
    configureFees: 'Paramétrage des plans',
    yearFilterAll: 'Année :',
    trancheFilterAll: 'Toutes les tranches',
    alertBanner: (count: number, tranche: string, dueDate: string) =>
      `${count} élèves en retard de paiement — ${tranche} échue le ${dueDate}`,
    alertBannerSub: (amount: string) => `Montant total impayé : ${amount}`,
    kpiTotalCollected: 'Total Recouvré',
    kpiUpToDate: 'Élèves à jour',
    kpiOverdue: 'En Retard',
    kpiNextDueDate: 'Prochaine Échéance',
    searchPlaceholder: 'Nom ou matricule...',
    classFilterAll: 'Toutes les classes',
    statusFilterAll: 'Tous les statuts',
    resultCount: (n: number) => `${n} élèves`,
    columns: {
      student: 'Élève',
      class: 'Classe',
      totalDue: 'Total dû',
      paid: 'Payé',
      remaining: 'Reste à payer',
      status: 'Statut',
      tranches: 'Tranches',
      actions: 'Actions',
    },
    rowActions: {
      registerPayment: 'Enregistrer un paiement',
      sendWhatsapp: 'Envoyer WhatsApp',
      viewHistory: "Voir l'historique",
      printReceipt: 'Imprimer le reçu',
    },
  },
  overdue: {
    title: 'Relances & Impayés',
    subtitle: 'Gérez les retards de paiement et automatisez les rappels',
    exportList: 'Exporter la liste',
    bulkReminder: (count: number) => (count > 0 ? `Rappel groupé (${count})` : 'Rappel groupé'),
    kpiTotalUnpaid: 'Total impayés',
    kpiCritical: 'Retard critique',
    kpiSent: 'Rappels envoyés',
    kpiNextDue: 'Prochaine échéance',
    searchPlaceholder: 'Nom ou matricule...',
    trancheFilterAll: 'Toutes les tranches',
    statusFilterOverdue: 'En retard',
    selectedCount: (n: number) => `${n} sélectionnés`,
    sendReminder: 'Envoyer rappel',
    columns: {
      student: 'Élève',
      class: 'Classe',
      tranche: 'Tranche',
      amountDue: 'Montant dû',
      overdue: 'Retard',
      status: 'Statut',
      lastReminder: 'Dernier rappel',
      actions: 'Actions',
    },
    daysOverdue: (n: number) => `${n} jours`,
    statusCritical: 'Critique',
    statusOverdue: 'En retard',
    statusRecent: 'Récent',
    rowActions: {
      registerPayment: 'Enregistrer un paiement',
      sendReminder: 'Envoyer rappel WhatsApp',
      viewHistory: "Voir l'historique",
      markDisputed: 'Marquer comme litigieux',
    },
    automationTitle: 'Automatisation',
    automationSubtitle: 'Rappels automatiques',
    reminderBefore5Days: 'Rappel 5 jours avant',
    reminderBefore5DaysDesc: "Notifier avant l'échéance",
    reminderOnDueDate: 'Rappel le jour J',
    reminderOnDueDateDesc: "Le jour de l'échéance",
    reminderWeekly: 'Rappel hebdomadaire',
    reminderWeeklyDesc: 'Pour les impayés > 7 jours',
    reminderCritical: 'Alerte critique',
    reminderCriticalDesc: 'Retard > 30 jours',
    byClassTitle: 'Retards par classe',
    quickActionsTitle: 'Actions rapides',
    exportExcel: 'Exporter Excel',
    exportPdf: 'Exporter PDF',
  },
  registerPayment: {
    title: 'Enregistrer un paiement',
    subtitle: 'Saisissez les informations du versement ci-dessous',
    balanceLabel: 'Solde dû',
    selectTranche: 'Sélectionner la tranche',
    latePenaltyNote: (amount: string, percent: number) =>
      `Une pénalité de retard de ${amount} (${percent}%) sera appliquée automatiquement sur cette tranche.`,
    detailsTitle: 'Détails du versement',
    amountLabel: 'Montant versé',
    dateLabel: 'Date du paiement',
    referenceLabel: 'N° Référence / Reçu',
    referencePlaceholder: 'REF-2026-...',
    notesLabel: 'Notes (optionnel)',
    notesPlaceholder: 'Remarques...',
    methodTitle: 'Mode de paiement',
    totalTitle: 'Montant total à encaisser',
    breakdownLabel: (principal: string, penalty: string) =>
      `Principal ${principal} + Pénalité ${penalty}`,
    remainingAfter: 'Solde restant après paiement',
    settled: 'Compte soldé',
    cancel: 'Annuler',
    saveAndPrint: 'Enregistrer & Imprimer le reçu',
    confirm: 'Confirmer le paiement',
  },
  disputeModal: {
    title: 'Marquer comme litigieux',
    reasonLabel: 'Motif (optionnel)',
    confirm: 'Marquer comme litigieux',
    cancel: 'Annuler',
  },
  stub: 'Cette fonctionnalité arrive bientôt.',
} as const;

// ─── SaaS admin (Epic 2 — .planning/banani/epic-2-admin-foundation.md) ───

// Shared status/plan vocabulary — one label per status app-wide (the Banani
// dashboard mock said "Payé" where the transactions mock said "Réussie";
// we standardize on the transactions vocabulary, deviation noted in plan).
export const ADMIN_SAAS = {
  subscriptionStatus: {
    TRIAL: 'Essai',
    ACTIVE: 'Actif',
    EXPIRED: 'Expiré',
    SUSPENDED: 'Suspendu',
    CANCELED: 'Annulé',
    NONE: 'Inactif',
  },
  expiringSoon: 'Expire bientôt',
  transactionStatus: {
    SUCCEEDED: 'Réussie',
    PENDING: 'En attente',
    FAILED: 'Échouée',
    REFUNDED: 'Remboursée',
  },
  couponStatus: {
    ACTIVE: 'Actif',
    EXPIRING: 'Bientôt expiré',
    EXHAUSTED: 'Épuisé',
    EXPIRED: 'Expiré',
    INACTIVE: 'Désactivé',
  },
  userStatus: { ACTIVE: 'Actif', SUSPENDED: 'Suspendu' },
  orgRole: { OWNER: 'Propriétaire', ADMIN: 'Admin', MEMBER: 'Membre' },
  planEmoji: { PREMIUM: '⭐', ESSENTIEL: '📚', STARTER: '🚀' } as Record<string, string>,
  stub: 'Cette fonctionnalité arrive bientôt.',
} as const;

export const ADMIN_DASHBOARD = {
  title: 'Tableau de bord Administration',
  subtitle: 'Vue globale de la plateforme',
  exportReport: 'Exporter le rapport',
  createSchool: 'Créer une école',
  seeAll: 'Voir tout',
  kpi: {
    totalSchools: 'Écoles actives',
    totalUsers: 'Utilisateurs totaux',
    activeUsers: 'Utilisateurs actifs',
    activeSubscriptions: 'Abonnements actifs',
    monthRevenue: 'Revenus du mois',
    thisMonth: 'ce mois',
    ofTotal: 'du total',
    expiringSoon: 'expirent bientôt',
    vsLastMonth: 'vs mois dernier',
  },
  revenue: {
    title: 'Évolution des revenus',
    subtitle: '6 derniers mois · Facturation par élève',
    total: 'Total 6 mois',
    avg: 'Moy. mensuelle',
    growth: 'Croissance',
  },
  recentUsers: {
    title: 'Utilisateurs récents',
    subtitle: 'Dernières inscriptions',
    empty: 'Aucun utilisateur pour le moment.',
  },
  schools: {
    title: 'Écoles clientes',
    subtitle: (n: number) =>
      `${n} établissement${n > 1 ? 's' : ''} enregistré${n > 1 ? 's' : ''} sur la plateforme`,
    searchPlaceholder: 'Rechercher...',
    newSchool: 'Nouvelle école',
    columns: {
      school: 'École',
      location: 'Pays / Ville',
      plan: 'Plan',
      students: 'Élèves',
      users: 'Utilisateurs',
      billing: 'Facturation / mois',
      status: 'Statut',
      renewal: 'Renouvellement',
    },
    empty: 'Aucune école enregistrée pour le moment.',
  },
  transactions: {
    title: 'Transactions récentes',
    subtitle: 'Historique des paiements',
    columns: { school: 'École', amount: 'Montant', date: 'Date', status: 'Statut' },
    empty: 'Aucune transaction pour le moment.',
  },
  coupons: {
    title: 'Codes promotionnels',
    subtitle: 'Gérez les coupons de réduction',
    newCoupon: 'Nouveau coupon',
    columns: {
      code: 'Code',
      discount: 'Réduction',
      uses: 'Utilisations',
      expiry: 'Expiration',
      status: 'Statut',
    },
    noLimit: 'Sans limite',
    permanent: 'Permanent',
    empty: 'Aucun coupon créé pour le moment.',
  },
  loadError: 'Impossible de charger le tableau de bord.',
  retry: 'Réessayer',
} as const;
