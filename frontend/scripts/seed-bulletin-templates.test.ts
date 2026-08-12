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
  it('creates all 3 global templates when none exist', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([]);
    prismaMock.bulletinTemplate.create.mockResolvedValue({} as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.bulletinTemplate.findMany).toHaveBeenCalledWith({
      where: { schoolId: null },
      select: { name: true },
    });
    expect(prismaMock.bulletinTemplate.create).toHaveBeenCalledTimes(3);
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
    ] as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.bulletinTemplate.create).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
