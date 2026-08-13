// scripts/backfill-bulletin-template-content-layout
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { main } from './backfill-bulletin-template-content-layout';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe('scripts/backfill-bulletin-template-content-layout', () => {
  it('backfills rows missing content/layout and leaves the rest of their config untouched', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([
      { id: 'tpl1', config: { primaryColor: '#1a9e5c', typography: { schoolName: 13 } } },
    ] as never);
    prismaMock.bulletinTemplate.update.mockResolvedValue({} as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.bulletinTemplate.update).toHaveBeenCalledWith({
      where: { id: 'tpl1' },
      data: {
        config: {
          primaryColor: '#1a9e5c',
          typography: { schoolName: 13 },
          content: { title: 'BULLETIN SCOLAIRE', footerMessage: null },
          layout: { pageMargin: 20, blockSpacing: 10, borderWidth: 1, borderColor: '#f0eef8' },
        },
      },
    });
    logSpy.mockRestore();
  });

  it('is idempotent — skips rows that already have both content and layout', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([
      {
        id: 'tpl2',
        config: {
          content: { title: 'Custom', footerMessage: 'x' },
          layout: { pageMargin: 30, blockSpacing: 8, borderWidth: 2, borderColor: '#000000' },
        },
      },
    ] as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.bulletinTemplate.update).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
