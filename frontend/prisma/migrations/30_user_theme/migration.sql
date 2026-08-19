-- Thème de couleur (Paramètres › Apparence) — préférence PAR UTILISATEUR,
-- clé de src/lib/themes.ts (lavande | ocean | foret | ardoise | terracotta).
-- NULL = jamais choisi → thème par défaut (Lavande). Le client applique le
-- thème avant le premier rendu via localStorage ; la colonne sert à retrouver
-- le choix sur un autre appareil.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "theme" TEXT;
