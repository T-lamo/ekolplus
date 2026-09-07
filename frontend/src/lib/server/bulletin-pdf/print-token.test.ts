import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  signPrintToken,
  verifyPrintToken,
  signTemplatePreviewToken,
  verifyTemplatePreviewToken,
} from './print-token';
import { DEFAULT_BULLETIN_CONFIG } from '../bulletin-templates';

describe('print-token (bulletin PDF authorization)', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', 'a-test-secret-that-is-at-least-32-characters-long');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips a signed payload', () => {
    const token = signPrintToken({ schoolId: 's1', studentId: 'st1', termId: 't1' });
    const payload = verifyPrintToken(token);
    expect(payload).toMatchObject({ schoolId: 's1', studentId: 'st1', termId: 't1' });
  });

  it('round-trips the optional audience and leaves it undefined when omitted', () => {
    const student = verifyPrintToken(
      signPrintToken({ schoolId: 's1', studentId: 'st1', termId: 't1', audience: 'student' }),
    );
    expect(student?.audience).toBe('student');
    const staff = verifyPrintToken(
      signPrintToken({ schoolId: 's1', studentId: 'st1', termId: 't1' }),
    );
    expect(staff?.audience).toBeUndefined();
  });

  it('rejects a payload tampered after signing', () => {
    const token = signPrintToken({ schoolId: 's1', studentId: 'st1', termId: 't1' });
    const [, sig] = token.split('.');
    const tamperedBody = Buffer.from(
      JSON.stringify({
        schoolId: 's1',
        studentId: 'ATTACKER-CONTROLLED',
        termId: 't1',
        exp: Date.now() + 60_000,
      }),
    ).toString('base64url');
    expect(verifyPrintToken(`${tamperedBody}.${sig}`)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signPrintToken({ schoolId: 's1', studentId: 'st1', termId: 't1' });
    vi.stubEnv('JWT_SECRET', 'a-different-test-secret-that-is-also-32-chars');
    expect(verifyPrintToken(token)).toBeNull();
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    const token = signPrintToken({ schoolId: 's1', studentId: 'st1', termId: 't1' });
    vi.advanceTimersByTime(61_000);
    expect(verifyPrintToken(token)).toBeNull();
    vi.useRealTimers();
  });

  it('rejects malformed tokens without throwing', () => {
    expect(verifyPrintToken('not-a-real-token')).toBeNull();
    expect(verifyPrintToken('')).toBeNull();
    expect(verifyPrintToken('only-one-part')).toBeNull();
  });
});

describe('template-preview-token (bulletin template editor "Exporter PDF")', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', 'a-test-secret-that-is-at-least-32-characters-long');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips a signed payload, config included', () => {
    const token = signTemplatePreviewToken({ schoolId: 's1', config: DEFAULT_BULLETIN_CONFIG });
    const payload = verifyTemplatePreviewToken(token);
    expect(payload).toMatchObject({ schoolId: 's1', config: DEFAULT_BULLETIN_CONFIG });
  });

  it('rejects a payload tampered after signing', () => {
    const token = signTemplatePreviewToken({ schoolId: 's1', config: DEFAULT_BULLETIN_CONFIG });
    const [, sig] = token.split('.');
    const tamperedBody = Buffer.from(
      JSON.stringify({
        schoolId: 's1',
        config: { ...DEFAULT_BULLETIN_CONFIG, primaryColor: '#000000' },
        exp: Date.now() + 60_000,
      }),
    ).toString('base64url');
    expect(verifyTemplatePreviewToken(`${tamperedBody}.${sig}`)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signTemplatePreviewToken({ schoolId: 's1', config: DEFAULT_BULLETIN_CONFIG });
    vi.stubEnv('JWT_SECRET', 'a-different-test-secret-that-is-also-32-chars');
    expect(verifyTemplatePreviewToken(token)).toBeNull();
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    const token = signTemplatePreviewToken({ schoolId: 's1', config: DEFAULT_BULLETIN_CONFIG });
    vi.advanceTimersByTime(61_000);
    expect(verifyTemplatePreviewToken(token)).toBeNull();
    vi.useRealTimers();
  });

  it('rejects malformed tokens without throwing', () => {
    expect(verifyTemplatePreviewToken('not-a-real-token')).toBeNull();
    expect(verifyTemplatePreviewToken('')).toBeNull();
    expect(verifyTemplatePreviewToken('only-one-part')).toBeNull();
  });
});
