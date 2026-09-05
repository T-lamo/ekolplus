// scripts/seed-bulletin-templates — global BulletinTemplate bootstrap.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { main } from './seed-bulletin-templates';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe('scripts/seed-bulletin-templates', () => {
  it('creates all 4 global templates when none exist', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([]);
    prismaMock.bulletinTemplate.create.mockResolvedValue({} as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.bulletinTemplate.findMany).toHaveBeenCalledWith({
      where: { schoolId: null },
      select: { name: true },
    });
    expect(prismaMock.bulletinTemplate.create).toHaveBeenCalledTimes(4);
    for (const call of prismaMock.bulletinTemplate.create.mock.calls) {
      expect(call[0]?.data).toMatchObject({ schoolId: null });
    }
    logSpy.mockRestore();
  });

  it('is idempotent — skips templates that already exist by name', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([
      { name: 'Académique Vert' },
      { name: 'Officiel Rouge' },
      { name: 'Moderne Orange' },
      { name: 'Livret préscolaire' },
    ] as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.bulletinTemplate.create).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('the Livret préscolaire config validates against the real bulletin-templates schema', async () => {
    const { bulletinTemplateConfigSchema } = await import('../src/lib/server/bulletin-templates');
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([
      { name: 'Académique Vert' },
      { name: 'Officiel Rouge' },
      { name: 'Moderne Orange' },
    ] as never);
    let capturedConfig: unknown;
    prismaMock.bulletinTemplate.create.mockImplementation((args) => {
      if ((args as { data: { name: string } }).data.name === 'Livret préscolaire') {
        capturedConfig = (args as { data: { config: unknown } }).data.config;
      }
      return Promise.resolve({} as never);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await main([], { prisma: prismaMock });

    expect(bulletinTemplateConfigSchema.safeParse(capturedConfig).success).toBe(true);
    logSpy.mockRestore();
  });
});
