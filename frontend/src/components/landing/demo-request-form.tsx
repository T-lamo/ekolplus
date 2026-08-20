'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
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

/**
 * Landing demo-request form → POST /api/demo-requests (public, pre-session —
 * same CSRF carve-out as /api/auth/signup, no cookie exists yet to verify).
 * Anti-spam: hidden honeypot (`company`) + per-email rate limit server-side.
 *
 * Visual shell is Banani's "clipboard" (`.landing-clipboard` in globals.css
 * re-scopes the shared Field/PhoneInput/Select tokens to the cream paper
 * palette) — state machine and submit logic are unchanged from before the
 * redesign.
 */
export function DemoRequestForm() {
  // Callback ref (not useRef): Select/PhoneInput's Radix portals need the
  // real DOM node to render into (see portalContainer doc below) — a plain
  // ref wouldn't trigger the re-render needed to hand it to them once the
  // clipboard card mounts.
  const [clipboardEl, setClipboardEl] = useState<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [school, setSchool] = useState('');
  const [size, setSize] = useState('small');
  const [plan, setPlan] = useState('pro');
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
        body: { fullName, phone, email, school, size, plan, company },
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
      <div className="landing-clipboard relative rounded-[26px_30px_32px_22px] bg-[linear-gradient(180deg,rgba(250,246,239,0.98),rgba(237,230,220,0.95))] p-8 text-center text-foreground shadow-[0_30px_74px_rgba(0,0,0,0.20)] sm:p-10">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
        <h3 className="mt-3 text-lg font-extrabold">Merci ! Demande envoyée.</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Un expert SchoolGesti vous recontactera sous 24h pour votre démonstration personnalisée.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={setClipboardEl}
      className="landing-clipboard relative rounded-[26px_30px_32px_22px] bg-[linear-gradient(180deg,rgba(250,246,239,0.98),rgba(237,230,220,0.95))] p-6 text-foreground shadow-[0_30px_74px_rgba(0,0,0,0.20)] sm:p-[30px_26px_26px]"
    >
      {/* Clipboard clip + pencil + chain — purely decorative, hidden on the
          narrowest screens where there isn't room for the overhang. */}
      <div
        aria-hidden="true"
        className="absolute -top-5 left-1/2 hidden h-[38px] w-[126px] -translate-x-1/2 rounded-[14px] bg-[linear-gradient(180deg,#786a5c,#53483d)] shadow-[inset_0_2px_0_rgba(255,255,255,0.18)] sm:block"
      />
      <div
        aria-hidden="true"
        className="absolute top-[34px] right-3 hidden h-[76px] w-px border-l-2 border-dashed border-[rgba(65,50,36,0.36)] lg:block"
      />
      <div
        aria-hidden="true"
        className="absolute top-[86px] -right-[18px] hidden h-40 w-[22px] rotate-[14deg] rounded-[18px] bg-[linear-gradient(180deg,#b59c7e,#8f7557)] shadow-[0_8px_20px_rgba(0,0,0,0.16)] lg:block"
      />

      <form className="space-y-0" onSubmit={handleSubmit} suppressHydrationWarning>
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

        <h3 className="text-lg font-extrabold">Réserver une démo</h3>

        <div className="mt-[18px] grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Prénom & nom"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jean Dupont"
          />
          <PhoneInput
            label="Téléphone"
            value={phone}
            onChange={setPhone}
            portalContainer={clipboardEl}
          />

          <div className="sm:col-span-2">
            <Field
              label="Email professionnel"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jean@ecole.edu"
            />
          </div>

          <Field
            label="Établissement"
            required
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder="Institution Nouvelle Vision"
          />
          <Select
            label="Nombre d'élèves"
            value={size}
            onValueChange={setSize}
            portalContainer={clipboardEl}
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
              portalContainer={clipboardEl}
            >
              <SelectItem value="starter">Starter (gratuit)</SelectItem>
              <SelectItem value="pro">Établissement Pro</SelectItem>
              <SelectItem value="enterprise">Enterprise (sur mesure)</SelectItem>
            </Select>
          </div>
        </div>

        {plan === 'pro' && (
          <div className="mt-3 flex items-center justify-between rounded-[14px] border border-border bg-white/40 px-3.5 py-3">
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

        <button
          type="submit"
          disabled={status === 'sending'}
          className="mt-[18px] flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-accent px-[18px] py-3.5 text-sm font-bold text-primary-foreground transition-opacity disabled:opacity-60"
        >
          <span>{status === 'sending' ? 'Envoi…' : 'Réserver ma démo'}</span>
          {status !== 'sending' && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </button>

        {status === 'error' && errorMsg && (
          <p className="mt-3 text-sm text-destructive-foreground">{errorMsg}</p>
        )}
      </form>
    </div>
  );
}
