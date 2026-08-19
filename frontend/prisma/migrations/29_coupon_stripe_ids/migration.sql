-- Coupons admin ↔ Stripe : un code créé dans le back-office doit être
-- saisissable tel quel sur la page Checkout hébergée (allow_promotion_codes).
-- On mémorise le Coupon Stripe (termes de la remise) et le Promotion Code
-- (code client, usages max, expiration, restriction client) créés en miroir.
-- Les deux restent NULL quand Stripe n'est pas configuré, quand le plan visé
-- n'est pas facturé via Stripe, ou pour les lignes antérieures à cette
-- migration (rattrapage : `pnpm stripe:sync-coupons`).

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN "stripeCouponId" TEXT,
ADD COLUMN "stripePromotionCodeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_stripeCouponId_key" ON "Coupon"("stripeCouponId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_stripePromotionCodeId_key" ON "Coupon"("stripePromotionCodeId");
