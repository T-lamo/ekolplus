-- Per-school reminder channel toggle: email is the default/free channel
-- (Resend, already wired), WhatsApp is opt-in and costs a per-message Meta
-- fee on top of Twilio's own fee — the platform (not the school) foots the
-- Twilio bill, so this is a per-school choice, not a global switch.
ALTER TABLE "FeeAutomationSettings" ADD COLUMN     "whatsappRemindersEnabled" BOOLEAN NOT NULL DEFAULT false;
