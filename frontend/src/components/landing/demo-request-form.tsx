'use client';

import { useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Field } from '@/components/ui/Field';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Select, SelectItem } from '@/components/ui/Select';

// Effectif représentatif par tranche → estimation du plan Pro (0,60 $/élève/mois).
// null = « Plus de 1000 » → tarif entreprise (sur devis).
const RATE = 0.6;
const SIZE_TO_COUNT: Record<string, number | null> = {
  small: 150,
  medium: 350,
  large: 750,
  xlarge: null,
};

// Success-burst confetti — 12 dots scattered from the check, precomputed so
// the render is deterministic (no Math.random in render). Angles sweep the
// full circle; distance/size alternate for an organic feel.
const CONFETTI = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const dist = i % 2 === 0 ? 76 : 52;
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    size: i % 3 === 0 ? 8 : 6,
    color: ['#2563eb', '#10b981', '#f2cf6b', '#3b82f6'][i % 4]!,
    delay: 0.25 + (i % 4) * 0.04,
  };
});

/**
 * Landing demo-request form → POST /api/demo-requests (public, pre-session —
 * same CSRF carve-out as /api/auth/signup, no cookie exists yet to verify).
 * Anti-spam: hidden honeypot (`company`) + per-email rate limit server-side.
 *
 * Visual shell is Banani's flat `.contact-card` (Electric Blue) with an
 * authored "wow" pass: spring entrance, a slow-breathing gradient halo
 * behind the card, a morphing submit button, and a success panel with an
 * SVG check drawn in + a one-shot confetti burst. State machine and submit
 * logic are unchanged from before the redesign (plus the optional
 * `message` textarea the API now accepts).
 */
export function DemoRequestForm() {
  // Callback ref (not useRef): Select/PhoneInput's Radix portals need the
  // real DOM node to render into — portaling into this card keeps the
  // popovers inside #landing-root so they inherit the landing token scope
  // instead of the logged-in user's own app theme.
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [school, setSchool] = useState('');
  const [size, setSize] = useState('small');
  const [plan, setPlan] = useState('pro');
  const [message, setMessage] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const rawCount = SIZE_TO_COUNT[size];
  const estimate = typeof rawCount === 'number' ? Math.round(rawCount * RATE) : null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg(null);
    try {
      await api('/api/demo-requests', {
        method: 'POST',
        body: { fullName, phone, email, school, size, plan, message, company },
      });
      setStatus('sent');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setErrorMsg('Trop de tentatives. Réessaie dans quelques minutes.');
      } else {
        setErrorMsg(err instanceof ApiError ? err.message : 'Envoi impossible. Réessaie.');
      }
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="relative overflow-hidden rounded-[18px] border border-border bg-card p-8 text-center sm:p-10"
      >
        <div className="relative mx-auto h-16 w-16">
          {!reduceMotion &&
            CONFETTI.map((dot, i) => (
              <motion.span
                key={i}
                initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                animate={{ x: dot.x, y: dot.y, opacity: 0, scale: 1 }}
                transition={{ duration: 0.9, delay: dot.delay, ease: 'easeOut' }}
                style={{
                  width: dot.size,
                  height: dot.size,
                  backgroundColor: dot.color,
                  left: '50%',
                  top: '50%',
                }}
                className="absolute rounded-full"
                aria-hidden="true"
              />
            ))}
          <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden="true">
            <motion.circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="#10b981"
              strokeWidth="4"
              initial={reduceMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
            <motion.path
              d="M20 33 L28 41 L44 25"
              fill="none"
              stroke="#10b981"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduceMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.4, delay: 0.35, ease: 'easeOut' }}
            />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-extrabold text-foreground">Merci ! Demande envoyée.</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Un expert SchoolGesti vous recontactera sous 24h pour votre démonstration personnalisée.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 40, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      className="relative"
    >
      {/* Slow-breathing gradient halo behind the card. */}
      <motion.div
        aria-hidden="true"
        {...(reduceMotion ? {} : { animate: { opacity: [0.5, 0.9, 0.5] } })}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="pointer-events-none absolute -inset-[3px] rounded-[20px] bg-[linear-gradient(135deg,rgba(37,99,235,0.35),rgba(167,243,208,0.30),rgba(37,99,235,0.20))] blur-[6px]"
      />
      <div
        ref={setCardEl}
        className="relative rounded-[18px] border border-border bg-card p-6 sm:p-[26px]"
      >
        <form onSubmit={handleSubmit} suppressHydrationWarning>
          {/* Honeypot — hidden from users; bots fill it and get dropped server-side. */}
          <input
            type="text"
            name="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />

          <h3 className="text-[17px] font-extrabold text-foreground">Demander à être rappelé</h3>

          <div className="mt-[18px] grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <Field
              label="Responsable"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Marie Saint-Louis"
            />
            <PhoneInput
              label="Téléphone"
              value={phone}
              onChange={setPhone}
              portalContainer={cardEl}
            />

            <div className="sm:col-span-2">
              <Field
                label="Email professionnel"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="direction@ecole.edu"
              />
            </div>

            <Field
              label="Nom de l'établissement"
              required
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="Collège Horizon"
            />
            <Select
              label="Nombre d'élèves"
              value={size}
              onValueChange={setSize}
              portalContainer={cardEl}
            >
              <SelectItem value="small">Moins de 200</SelectItem>
              <SelectItem value="medium">200 - 500</SelectItem>
              <SelectItem value="large">500 - 1000</SelectItem>
              <SelectItem value="xlarge">Plus de 1000</SelectItem>
            </Select>

            <div className="sm:col-span-2">
              <Select
                label="Plan souhaité"
                value={plan}
                onValueChange={setPlan}
                portalContainer={cardEl}
              >
                <SelectItem value="starter">Gratuit</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Grande École (sur mesure)</SelectItem>
              </Select>
            </div>

            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="text-xs font-semibold text-foreground">Votre besoin</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Je souhaite voir le suivi des paiements, la gestion des bulletins et le passage à la nouvelle année scolaire."
                className="min-h-[104px] rounded-md border border-border bg-input px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/10"
              />
            </label>
          </div>

          {plan === 'pro' && (
            <div className="mt-3.5 flex items-center justify-between rounded-md border border-border bg-secondary px-3.5 py-3">
              <span className="text-xs font-bold text-muted-foreground">Estimation plan Pro</span>
              {estimate === null ? (
                <span className="text-xs font-semibold text-primary">
                  Tarif entreprise, sur devis
                </span>
              ) : (
                <span className="text-base font-bold text-primary">
                  ~{estimate} ${' '}
                  <span className="text-xs font-normal text-muted-foreground">/mois</span>
                </span>
              )}
            </div>
          )}

          <motion.button
            type="submit"
            disabled={status === 'sending'}
            {...(reduceMotion ? {} : { whileHover: { scale: 1.015 } })}
            whileTap={{ scale: 0.98 }}
            className="mt-[18px] flex h-[46px] w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground shadow-[0_10px_24px_-8px_rgba(37,99,235,0.55)] transition-opacity disabled:opacity-70"
          >
            {status === 'sending' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Envoi en cours…</span>
              </>
            ) : (
              <>
                <span>Être contacté</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </motion.button>

          {status === 'error' && errorMsg && (
            <p className="mt-3 text-sm text-destructive-foreground">{errorMsg}</p>
          )}
        </form>
      </div>
    </motion.div>
  );
}
