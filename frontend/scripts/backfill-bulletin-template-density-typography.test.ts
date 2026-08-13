// scripts/backfill-bulletin-template-density-typography
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { main } from './backfill-bulletin-template-density-typography';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe('scripts/backfill-bulletin-template-density-typography', () => {
  it('backfills rows missing the new layout/typography keys and preserves existing ones', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([
      {
        id: 'tpl1',
        config: {
          primaryColor: '#1a9e5c',
          typography: { schoolName: 13, title: 17, tableBody: 11 },
          layout: { pageMargin: 30, blockSpacing: 8, borderWidth: 2, borderColor: '#000000' },
        },
      },
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
          typography: {
            schoolName: 13,
            title: 17,
            tableBody: 11,
            tableHeader: 10,
            noteValue: 11,
            footer: 9,
          },
          layout: {
            pageMargin: 30,
            blockSpacing: 8,
            borderWidth: 2,
            borderColor: '#000000',
            borderStyle: 'solid',
            cellPaddingX: 6,
            cellPaddingY: 6,
            tableLineHeight: 1.4,
            showTableBackgrounds: false,
          },
        },
      },
    });
    logSpy.mockRestore();
  });

  it('is idempotent — skips rows that already have every new key', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([
      {
        id: 'tpl2',
        config: {
          typography: {
            schoolName: 13,
            title: 17,
            tableBody: 11,
            tableHeader: 9,
            noteValue: 12,
            footer: 8,
          },
          layout: {
            pageMargin: 20,
            blockSpacing: 10,
            borderWidth: 1,
            borderColor: '#f0eef8',
            borderStyle: 'dashed',
            cellPaddingX: 4,
            cellPaddingY: 4,
            tableLineHeight: 1.6,
            showTableBackgrounds: true,
          },
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
