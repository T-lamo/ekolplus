// Pre-launch audit of the Stripe account behind STRIPE_SECRET_KEY — prints
// ✓ / ✗ / ! for everything the SaaS billing needs and exits 1 on a blocker,
// so a mis-configured account is caught before the first school pays:
//   · key mode (test / live) + account (charges_enabled, statement descriptor)
//   · STRIPE_PRICE_ID_PRO / _ANNUAL exist, active, recurring month/year,
//     licensed, USD, unit_amount = src/lib/billing-plans.ts (never drift)
//   · Customer Portal default configuration: payment-method update + invoice
//     history + cancel enabled, subscription plan switching DISABLED (the app
//     is the only plan UX)
//   · a webhook endpoint pointing at <APP_URL>/api/webhooks/stripe, enabled,
//     subscribed to the 8 STRIPE_HANDLED_EVENTS, and STRIPE_WEBHOOK_SECRET set
//     (live mode: the endpoint is required; test mode: `stripe listen` is fine)
//
// Usage: pnpm stripe:doctor                 (reads .env / .env.local)
//        pnpm stripe:doctor -- --live       (loads .env.production.local as well)
//        pnpm stripe:doctor -- --json       (machine-readable)
// Read-only: the script never creates or changes anything on Stripe.

import Stripe from 'stripe';
import { PRO_ANNUAL_RATE_CENTS, PRO_RATE_CENTS } from '../src/lib/billing-plans';
import { STRIPE_HANDLED_EVENTS } from '../src/lib/stripe-events';

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2026-07-29.dahlia';

export type CheckLevel = 'ok' | 'warn' | 'fail' | 'info';
export interface Check {
  level: CheckLevel;
  label: string;
  detail?: string;
}

/** The subset of the Stripe client the doctor calls — injectable for tests. */
export interface DoctorStripe {
  accounts: { retrieve: () => Promise<Stripe.Account> };
  prices: { retrieve: (id: string) => Promise<Stripe.Price> };
  billingPortal: {
    configurations: {
      list: (params: { limit: number }) => Promise<{ data: Stripe.BillingPortal.Configuration[] }>;
    };
  };
  webhookEndpoints: {
    list: (params: { limit: number }) => Promise<{ data: Stripe.WebhookEndpoint[] }>;
  };
}

export interface DoctorEnv {
  STRIPE_SECRET_KEY?: string | undefined;
  STRIPE_WEBHOOK_SECRET?: string | undefined;
  STRIPE_PRICE_ID_PRO?: string | undefined;
  STRIPE_PRICE_ID_PRO_ANNUAL?: string | undefined;
  APP_URL?: string | undefined;
  NEXT_PUBLIC_SALES_EMAIL?: string | undefined;
  NEXT_PUBLIC_TERMS_URL?: string | undefined;
}

export interface DoctorReport {
  mode: 'test' | 'live' | 'unknown';
  checks: Check[];
  blockers: number;
  warnings: number;
}

function keyMode(key: string | undefined): DoctorReport['mode'] {
  if (!key) return 'unknown';
  if (/^(sk|rk)_live_/.test(key)) return 'live';
  if (/^(sk|rk)_test_/.test(key)) return 'test';
  return 'unknown';
}

async function checkPrice(
  stripe: DoctorStripe,
  checks: Check[],
  id: string | undefined,
  what: 'mensuel' | 'annuel',
  interval: 'month' | 'year',
  expectedCents: number,
  required: boolean,
): Promise<void> {
  const envName = what === 'mensuel' ? 'STRIPE_PRICE_ID_PRO' : 'STRIPE_PRICE_ID_PRO_ANNUAL';
  if (!id) {
    checks.push({
      level: required ? 'fail' : 'warn',
      label: `Price ${what} (${envName})`,
      detail: required
        ? 'absent — `pnpm stripe:setup-prices` puis copier l’id'
        : 'absent — le toggle Mensuel/Annuel restera masqué (`stripe:setup-prices -- --annual-only`)',
    });
    return;
  }
  let price: Stripe.Price;
  try {
    price = await stripe.prices.retrieve(id);
  } catch (err) {
    checks.push({
      level: 'fail',
      label: `Price ${what} (${id})`,
      detail: `introuvable avec cette clé (${err instanceof Error ? err.message : String(err)}) — les Prices sont partitionnés test/live`,
    });
    return;
  }
  const problems: string[] = [];
  if (!price.active) problems.push('inactif');
  if (!price.recurring) problems.push('non récurrent');
  else {
    if (price.recurring.interval !== interval || price.recurring.interval_count !== 1)
      problems.push(
        `intervalle ${price.recurring.interval_count} ${price.recurring.interval} (attendu 1 ${interval})`,
      );
    if (price.recurring.usage_type !== 'licensed')
      problems.push(
        `usage_type ${price.recurring.usage_type} (attendu licensed — quantité = sièges)`,
      );
  }
  if (price.currency !== 'usd') problems.push(`devise ${price.currency} (attendu usd)`);
  if (price.unit_amount !== expectedCents)
    problems.push(`montant ${price.unit_amount} ¢ (attendu ${expectedCents} ¢ = billing-plans.ts)`);
  if (price.billing_scheme !== 'per_unit') problems.push(`billing_scheme ${price.billing_scheme}`);
  checks.push(
    problems.length === 0
      ? {
          level: 'ok',
          label: `Price ${what} ${id}`,
          detail: `${(expectedCents / 100).toFixed(2)} $ / élève / ${interval === 'month' ? 'mois' : 'an'}, licensed, actif`,
        }
      : { level: 'fail', label: `Price ${what} ${id}`, detail: problems.join(' · ') },
  );
}

export async function runDoctor(
  env: DoctorEnv,
  deps: { stripe?: DoctorStripe } = {},
): Promise<DoctorReport> {
  const checks: Check[] = [];
  const mode = keyMode(env.STRIPE_SECRET_KEY);

  if (!env.STRIPE_SECRET_KEY && !deps.stripe) {
    checks.push({
      level: 'fail',
      label: 'STRIPE_SECRET_KEY',
      detail: 'absente — rien à auditer (facturation en ligne inerte : 503 STRIPE_NOT_CONFIGURED)',
    });
    return { mode, checks, blockers: 1, warnings: 0 };
  }
  const stripe: DoctorStripe =
    deps.stripe ?? new Stripe(env.STRIPE_SECRET_KEY!, { apiVersion: STRIPE_API_VERSION });

  checks.push({
    level: mode === 'unknown' ? 'warn' : 'info',
    label: `Mode ${mode === 'live' ? 'LIVE' : mode === 'test' ? 'TEST' : 'inconnu'}`,
    detail:
      mode === 'live'
        ? env.STRIPE_SECRET_KEY?.startsWith('rk_')
          ? 'clé restreinte (recommandé)'
          : 'clé secrète complète — préférer une clé RESTREINTE (rk_…) en production'
        : mode === 'test'
          ? 'les paiements ne sont pas réels'
          : 'préfixe de clé non reconnu',
  });

  // ── Account ────────────────────────────────────────────────────────────
  try {
    const acct = await stripe.accounts.retrieve();
    checks.push({
      level: 'info',
      label: `Compte ${acct.id}`,
      detail: [acct.business_profile?.name, acct.country, acct.default_currency?.toUpperCase()]
        .filter(Boolean)
        .join(' · '),
    });
    if (mode === 'live') {
      checks.push(
        acct.charges_enabled
          ? { level: 'ok', label: 'Encaissements activés (charges_enabled)' }
          : {
              level: 'fail',
              label: 'Encaissements NON activés',
              detail: 'terminez l’activation du compte dans le Dashboard avant le lancement',
            },
      );
      checks.push(
        acct.payouts_enabled
          ? { level: 'ok', label: 'Virements activés (payouts_enabled)' }
          : {
              level: 'warn',
              label: 'Virements non activés',
              detail: 'IBAN / vérification en attente',
            },
      );
    }
    const descriptor = acct.settings?.payments?.statement_descriptor;
    checks.push(
      descriptor
        ? { level: 'ok', label: `Descripteur de relevé « ${descriptor} »` }
        : {
            level: mode === 'live' ? 'warn' : 'info',
            label: 'Descripteur de relevé absent',
            detail: 'Dashboard → Paramètres → Informations publiques (ex. « SCHOOLGESTI »)',
          },
    );
  } catch (err) {
    checks.push({
      level: 'fail',
      label: 'Compte Stripe injoignable',
      detail: err instanceof Error ? err.message : String(err),
    });
    return summarize(mode, checks);
  }

  // ── Prices ─────────────────────────────────────────────────────────────
  await checkPrice(
    stripe,
    checks,
    env.STRIPE_PRICE_ID_PRO,
    'mensuel',
    'month',
    PRO_RATE_CENTS,
    true,
  );
  await checkPrice(
    stripe,
    checks,
    env.STRIPE_PRICE_ID_PRO_ANNUAL,
    'annuel',
    'year',
    PRO_ANNUAL_RATE_CENTS,
    false,
  );

  // ── Customer Portal ────────────────────────────────────────────────────
  try {
    const { data } = await stripe.billingPortal.configurations.list({ limit: 10 });
    const cfg = data.find((c) => c.is_default && c.active) ?? data.find((c) => c.active);
    if (!cfg) {
      checks.push({
        level: 'fail',
        label: 'Portail client non configuré',
        detail:
          'Dashboard → Paramètres → Portail client : activer « moyen de paiement », « factures », « résiliation » ; désactiver « changer de plan »',
      });
    } else {
      const f = cfg.features;
      const problems: string[] = [];
      if (!f.payment_method_update?.enabled)
        problems.push('mise à jour du moyen de paiement désactivée');
      if (!f.invoice_history?.enabled) problems.push('historique des factures désactivé');
      if (!f.subscription_cancel?.enabled)
        problems.push('résiliation désactivée (l’app propose aussi la sienne — optionnel)');
      if (f.subscription_update?.enabled)
        problems.push(
          'changement de plan ACTIVÉ dans le portail — à désactiver (l’app est la seule UX de plan)',
        );
      const hard = problems.filter((p) => !p.includes('optionnel'));
      checks.push(
        problems.length === 0
          ? {
              level: 'ok',
              label: `Portail client ${cfg.id}`,
              detail: 'moyen de paiement · factures · résiliation · pas de changement de plan',
            }
          : {
              level: hard.length > 0 ? 'fail' : 'warn',
              label: `Portail client ${cfg.id}`,
              detail: problems.join(' · '),
            },
      );
    }
  } catch (err) {
    checks.push({
      level: 'warn',
      label: 'Portail client non vérifiable',
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Webhook endpoint ───────────────────────────────────────────────────
  const appUrl = (env.APP_URL ?? '').replace(/\/$/, '');
  const expectedUrl = appUrl ? `${appUrl}/api/webhooks/stripe` : null;
  try {
    const { data } = await stripe.webhookEndpoints.list({ limit: 20 });
    const matches = data.filter((w) => w.url.endsWith('/api/webhooks/stripe'));
    const exact = expectedUrl ? matches.find((w) => w.url === expectedUrl) : undefined;
    const ep = exact ?? matches[0];
    if (!ep) {
      checks.push({
        level: mode === 'live' ? 'fail' : 'warn',
        label: 'Aucun endpoint webhook …/api/webhooks/stripe',
        detail:
          mode === 'live'
            ? `créer ${expectedUrl ?? '<APP_URL>/api/webhooks/stripe'} (Dashboard → Développeurs → Webhooks) avec les ${STRIPE_HANDLED_EVENTS.length} événements, puis copier le whsec_ dans STRIPE_WEBHOOK_SECRET`
            : 'en test, `stripe listen --api-key … --forward-to localhost:3000/api/webhooks/stripe` suffit',
      });
    } else {
      const problems: string[] = [];
      if (ep.status !== 'enabled') problems.push(`statut ${ep.status}`);
      if (expectedUrl && ep.url !== expectedUrl) problems.push(`URL ${ep.url} ≠ ${expectedUrl}`);
      const enabled = new Set(ep.enabled_events);
      const missing = enabled.has('*') ? [] : STRIPE_HANDLED_EVENTS.filter((e) => !enabled.has(e));
      if (missing.length > 0) problems.push(`événements manquants : ${missing.join(', ')}`);
      const extra = enabled.has('*')
        ? []
        : [...enabled].filter((e) => !(STRIPE_HANDLED_EVENTS as readonly string[]).includes(e));
      if (extra.length > 0)
        problems.push(`événements superflus (ignorés, bruit) : ${extra.join(', ')}`);
      const hard = problems.filter((p) => !p.startsWith('événements superflus'));
      checks.push(
        problems.length === 0
          ? {
              level: 'ok',
              label: `Webhook ${ep.url}`,
              detail: `${STRIPE_HANDLED_EVENTS.length} événements, activé`,
            }
          : {
              level: hard.length > 0 ? 'fail' : 'warn',
              label: `Webhook ${ep.url}`,
              detail: problems.join(' · '),
            },
      );
    }
  } catch (err) {
    checks.push({
      level: 'warn',
      label: 'Endpoints webhook non vérifiables',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
  checks.push(
    env.STRIPE_WEBHOOK_SECRET
      ? { level: 'ok', label: 'STRIPE_WEBHOOK_SECRET renseigné' }
      : {
          level: mode === 'live' ? 'fail' : 'warn',
          label: 'STRIPE_WEBHOOK_SECRET absent',
          detail: 'sans lui chaque webhook répond 401 — le plan ne s’activera jamais',
        },
  );

  // ── App-side settings ──────────────────────────────────────────────────
  checks.push(
    env.NEXT_PUBLIC_SALES_EMAIL
      ? { level: 'ok', label: `Contact commercial ${env.NEXT_PUBLIC_SALES_EMAIL}` }
      : {
          level: 'info',
          label: 'NEXT_PUBLIC_SALES_EMAIL absent',
          detail: 'défaut contact@schoolgesti.com',
        },
  );
  checks.push(
    env.NEXT_PUBLIC_TERMS_URL
      ? { level: 'ok', label: `CGU ${env.NEXT_PUBLIC_TERMS_URL}` }
      : {
          level: 'warn',
          label: 'NEXT_PUBLIC_TERMS_URL absent',
          detail: 'le récap pointe sur /cgu — créer la page ou renseigner l’URL',
        },
  );

  return summarize(mode, checks);
}

function summarize(mode: DoctorReport['mode'], checks: Check[]): DoctorReport {
  return {
    mode,
    checks,
    blockers: checks.filter((c) => c.level === 'fail').length,
    warnings: checks.filter((c) => c.level === 'warn').length,
  };
}

const ICON: Record<CheckLevel, string> = { ok: '✓', warn: '!', fail: '✗', info: '·' };

export function formatReport(r: DoctorReport): string {
  const lines = r.checks.map(
    (c) => `${ICON[c.level]} ${c.label}${c.detail ? ` — ${c.detail}` : ''}`,
  );
  lines.push('');
  lines.push(
    r.blockers === 0
      ? `Prêt (${r.mode}) — ${r.warnings} avertissement${r.warnings > 1 ? 's' : ''}.`
      : `${r.blockers} bloqueur${r.blockers > 1 ? 's' : ''}, ${r.warnings} avertissement${r.warnings > 1 ? 's' : ''} — corriger avant le lancement.`,
  );
  return lines.join('\n');
}

export async function main(
  args: string[] = [],
  deps: { stripe?: DoctorStripe } = {},
): Promise<number> {
  const report = await runDoctor(process.env as DoctorEnv, deps);
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.log(formatReport(report));
  return report.blockers > 0 ? 1 : 0;
}

// CLI entrypoint guard — mirrors stripe-setup-prices.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
