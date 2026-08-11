// Monolith: the API lives in the same Next.js app under /api/*, so the
// default is an empty string (same-origin / relative fetch). Override only
// for rare cross-origin setups (e.g. a mobile client hitting a hosted
// instance). The legacy `http://localhost:4000` default was a leftover from
// the pre-monolith era when the backend ran as a separate Express server.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
export const COOKIE_PREFIX = process.env.NEXT_PUBLIC_COOKIE_PREFIX ?? 'app';

// French copy for the login screen — see .planning/banani/login-page.md.
export const AUTH_LOGIN = {
  brandName: 'Ekol',
  brandSuffix: 'Plus',
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
    emailHint: 'Les identifiants de connexion seront envoyés à cette adresse',
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
  newAccountCreated: 'Un nouveau compte administrateur a été créé.',
  existingAccountLinked: 'Le compte existant a été ajouté comme propriétaire de cette école.',
  tempPasswordLabel: 'Mot de passe temporaire',
  tempPasswordNote:
    "Communique ces identifiants à l'administrateur — ils ne seront plus affichés après avoir quitté cette page.",
  copy: 'Copier',
  copied: 'Copié',
  backToDashboard: 'Retour au tableau de bord',
} as const;
