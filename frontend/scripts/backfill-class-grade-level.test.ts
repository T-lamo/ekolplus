// scripts/backfill-class-grade-level
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { main } from './backfill-class-grade-level';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe('scripts/backfill-class-grade-level', () => {
  it('links a class whose level matches an existing grade level by name', async () => {
    prismaMock.class.findMany.mockResolvedValue([
      { id: 'c1', schoolId: 'school_1', level: '6ème' },
    ] as never);
    prismaMock.gradeLevel.findFirst.mockResolvedValue({ id: 'gl1' } as never);
    prismaMock.class.update.mockResolvedValue({} as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.gradeLevel.findFirst).toHaveBeenCalledWith({
      where: { schoolId: 'school_1', name: '6ème' },
      select: { id: true },
    });
    expect(prismaMock.class.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { gradeLevelId: 'gl1' },
    });
    logSpy.mockRestore();
  });

  it("leaves gradeLevelId null when no grade level matches the class's level", async () => {
    prismaMock.class.findMany.mockResolvedValue([
      { id: 'c2', schoolId: 'school_1', level: 'Niveau introuvable' },
    ] as never);
    prismaMock.gradeLevel.findFirst.mockResolvedValue(null);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.class.update).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('is idempotent — never re-queries a class that already has a gradeLevelId', async () => {
    prismaMock.class.findMany.mockResolvedValue([]);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.class.findMany).toHaveBeenCalledWith({
      where: { gradeLevelId: null },
      select: { id: true, schoolId: true, level: true },
    });
    expect(prismaMock.gradeLevel.findFirst).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
