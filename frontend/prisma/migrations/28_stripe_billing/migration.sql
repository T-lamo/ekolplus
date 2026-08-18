-- Facturation Stripe des écoles (abonnement SaaS) — Checkout hébergé,
-- Customer Portal, webhooks, cron de réconciliation quotidien.
--
-- 1. Réconciliation du catalogue avec la tarification publique (landing) :
--    STARTER (gratuit ≤ 50 élèves) / PRO (0,60 $/élève/mois, ex-ESSENTIEL) /
--    ENTERPRISE (sur devis, ex-PREMIUM). Renommage EN PLACE — jamais
--    supprimer/recréer : Subscription.planId référence SubscriptionPlan.id
--    avec ON DELETE RESTRICT, et les abonnements existants doivent suivre.
--    Le WHERE sur l'ancienne clé rend le script rejouable sans effet.
UPDATE "SubscriptionPlan"
SET "key" = 'PRO', "name" = 'Établissement Pro', "pricePerStudentCents" = 60, "sortOrder" = 2
WHERE "key" = 'ESSENTIEL';

UPDATE "SubscriptionPlan"
SET "key" = 'ENTERPRISE', "name" = 'Enterprise', "sortOrder" = 3
WHERE "key" = 'PREMIUM';

UPDATE "SubscriptionPlan"
SET "pricePerStudentCents" = 0, "sortOrder" = 1
WHERE "key" = 'STARTER';

-- 2. Intervalle de facturation Stripe (mensuel / annuel −10 %).
-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- 3. Client Stripe de l'école (survit aux abonnements successifs).
-- AlterTable
ALTER TABLE "School" ADD COLUMN "stripeCustomerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "School_stripeCustomerId_key" ON "School"("stripeCustomerId");

-- 4. Liaison Stripe sur l'abonnement — tous nullables (les abonnements
--    manuels du back-office n'en ont pas).
-- AlterTable
ALTER TABLE "Subscription"
    ADD COLUMN "stripeSubscriptionId" TEXT,
    ADD COLUMN "stripeSubscriptionItemId" TEXT,
    ADD COLUMN "stripeStatus" TEXT,
    ADD COLUMN "billingInterval" "BillingInterval",
    ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "billedSeats" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- 5. Liaison Stripe sur les transactions (factures Stripe).
-- AlterTable
ALTER TABLE "BillingTransaction"
    ADD COLUMN "stripeInvoiceId" TEXT,
    ADD COLUMN "stripePaymentIntentId" TEXT,
    ADD COLUMN "stripeInvoiceUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BillingTransaction_stripeInvoiceId_key" ON "BillingTransaction"("stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingTransaction_stripePaymentIntentId_key" ON "BillingTransaction"("stripePaymentIntentId");
