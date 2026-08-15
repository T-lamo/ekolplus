import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolvePrintBaseUrl } from './print-base-url';

describe('resolvePrintBaseUrl (headless-Chromium self-fetch origin)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers a valid APP_URL and strips a trailing slash', () => {
    vi.stubEnv('APP_URL', 'https://ekol.example.com/');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'ekol.vercel.app');
    expect(resolvePrintBaseUrl()).toBe('https://ekol.example.com');
  });

  it('ignores the .env.production.local placeholder and falls back to Vercel', () => {
    vi.stubEnv('APP_URL', 'REPLACE_ME_PROD_DOMAIN');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'ekol.vercel.app');
    expect(resolvePrintBaseUrl()).toBe('https://ekol.vercel.app');
  });

  it('ignores a localhost APP_URL when running on Vercel', () => {
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'ekol-test.vercel.app');
    expect(resolvePrintBaseUrl()).toBe('https://ekol-test.vercel.app');
  });

  it('falls back to the per-deployment VERCEL_URL when no production URL exists', () => {
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    vi.stubEnv('VERCEL_URL', 'ekol-git-abc123.vercel.app');
    expect(resolvePrintBaseUrl()).toBe('https://ekol-git-abc123.vercel.app');
  });

  it('keeps localhost APP_URL for local dev (not on Vercel)', () => {
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    vi.stubEnv('VERCEL_URL', '');
    expect(resolvePrintBaseUrl()).toBe('http://localhost:3000');
  });

  it('defaults to localhost:3000 when nothing is configured', () => {
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    vi.stubEnv('VERCEL_URL', '');
    expect(resolvePrintBaseUrl()).toBe('http://localhost:3000');
  });
});
