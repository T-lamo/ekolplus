-- Langue de l'interface (Paramètres › Langue) — préférence PAR UTILISATEUR,
-- clé de src/lib/locales.ts (fr | ht | en). NULL = jamais choisi → langue
-- par défaut (français). Contrairement au thème (purement côté client), la
-- langue doit être connue du SERVEUR à chaque requête (next-intl résout le
-- fichier de messages via le cookie sg-locale, voir src/i18n/request.ts) ;
-- cette colonne sert à retrouver le choix sur un autre appareil.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "locale" TEXT;
