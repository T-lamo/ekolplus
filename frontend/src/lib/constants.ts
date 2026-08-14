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
