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
