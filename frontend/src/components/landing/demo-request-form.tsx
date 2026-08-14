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
 * Light theme, self-contained (doesn't touch the app's dark sidebar tokens).
 */
export function DemoRequestForm() {
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
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-white p-6 text-center text-slate-800 shadow-md md:p-10">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" aria-hidden="true" />
        <h3 className="text-lg font-bold">Merci ! Demande envoyée.</h3>
        <p className="text-sm text-slate-500">
          Un expert Schoolgesti vous recontactera sous 24h pour votre démonstration personnalisée.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-6 text-slate-800 shadow-md md:p-10">
      <form className="space-y-6" onSubmit={handleSubmit} suppressHydrationWarning>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Prénom & Nom"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jean Dupont"
          />
          <PhoneInput label="Téléphone" value={phone} onChange={setPhone} />
        </div>

        <Field
          label="Email professionnel"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="j.dupont@ecole.com"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Nom de l'établissement"
            required
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder="Lycée d'Excellence"
          />
          <Select label="Nombre d'élèves" value={size} onValueChange={setSize}>
            <SelectItem value="small">Moins de 200</SelectItem>
            <SelectItem value="medium">200 - 500</SelectItem>
            <SelectItem value="large">500 - 1000</SelectItem>
            <SelectItem value="xlarge">Plus de 1000</SelectItem>
          </Select>
        </div>

        <Select label="Plan souhaité" value={plan} onValueChange={setPlan}>
          <SelectItem value="starter">Starter (gratuit)</SelectItem>
          <SelectItem value="pro">Établissement Pro</SelectItem>
          <SelectItem value="enterprise">Enterprise (sur mesure)</SelectItem>
        </Select>

        {plan === 'pro' && (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
            <span className="text-sm font-bold text-slate-500">Estimation plan Pro</span>
            {estimate === null ? (
              <span className="text-sm font-semibold text-violet-600">
                Tarif entreprise — sur devis
              </span>
            ) : (
              <span className="text-xl font-bold text-violet-600">
                ~{estimate} $ <span className="text-sm font-normal text-slate-500">/mois</span>
              </span>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'sending'}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-6 py-3 text-sm font-bold text-white shadow transition-colors hover:bg-violet-700 disabled:opacity-60"
        >
          <span>{status === 'sending' ? 'Envoi…' : 'Réserver ma démo'}</span>
          {status !== 'sending' && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </button>

        {status === 'error' && errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
      </form>
    </div>
  );
}
