// scripts/backfill-bulletin-template-pages
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { main } from './backfill-bulletin-template-pages';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe('scripts/backfill-bulletin-template-pages', () => {
  it('converts a legacy flat-blocks row into a pages-shaped config', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([
      {
        id: 'tpl1',
        config: {
          primaryColor: '#6c2bd9',
          pageFormat: 'LETTER',
          orientation: 'LANDSCAPE',
          blocks: [{ id: 'header', visible: true }],
          columns: {},
          signatures: {},
          typography: {},
          content: { title: 'BULLETIN', footerMessage: null },
          layout: {},
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
        config: expect.objectContaining({
          pages: [
            {
              id: 'page-1',
              layout: 'full',
              showPageNumber: false,
              blocks: [{ id: 'header', type: 'header', visible: true }],
            },
          ],
        }),
      },
    });
    logSpy.mockRestore();
  });

  it('is idempotent — skips rows that already have pages', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([
      {
        id: 'tpl2',
        config: { pages: [{ id: 'page-1', layout: 'full', showPageNumber: false, blocks: [] }] },
      },
    ] as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.bulletinTemplate.update).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
