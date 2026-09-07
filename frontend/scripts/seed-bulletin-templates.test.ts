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
  it('creates all 6 global templates when none exist', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([]);
    prismaMock.bulletinTemplate.create.mockResolvedValue({} as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.bulletinTemplate.findMany).toHaveBeenCalledWith({
      where: { schoolId: null },
      select: { name: true },
    });
    expect(prismaMock.bulletinTemplate.create).toHaveBeenCalledTimes(6);
    for (const call of prismaMock.bulletinTemplate.create.mock.calls) {
      expect(call[0]?.data).toMatchObject({ schoolId: null });
    }
    logSpy.mockRestore();
  });

  it('is idempotent — refreshes the config of templates that already exist by name instead of creating them', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([
      { name: 'Académique Vert' },
      { name: 'Officiel Rouge' },
      { name: 'Moderne Orange' },
      { name: 'Livret préscolaire' },
      { name: 'Carnet scolaire (3e cycle et secondaire)' },
      { name: 'Carnet scolaire (primaire)' },
    ] as never);
    prismaMock.bulletinTemplate.updateMany.mockResolvedValue({ count: 1 });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const code = await main([], { prisma: prismaMock });

    expect(code).toBe(0);
    expect(prismaMock.bulletinTemplate.create).not.toHaveBeenCalled();
    expect(prismaMock.bulletinTemplate.updateMany).toHaveBeenCalledTimes(6);
    for (const call of prismaMock.bulletinTemplate.updateMany.mock.calls) {
      expect(call[0]?.where).toMatchObject({ schoolId: null });
      expect(call[0]?.data).toHaveProperty('config');
    }
    logSpy.mockRestore();
  });

  it('the Livret préscolaire reproduces the docx presentation: gridded tables, ruled signatures with the homeroom first, centered verse, solid cover frame', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([]);
    let captured: {
      pages: { blocks: Record<string, unknown>[] }[];
      layout: Record<string, unknown>;
    } | null = null;
    prismaMock.bulletinTemplate.create.mockImplementation((args) => {
      const data = (args as { data: { name: string; config: typeof captured } }).data;
      if (data.name === 'Livret préscolaire') captured = data.config;
      return Promise.resolve({} as never);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await main([], { prisma: prismaMock });

    const blocks = captured!.pages.flatMap((p) => p.blocks);
    const byType = (type: string) => blocks.find((b) => b.type === type)!;
    // Left column: Comportement + Développement physique; right column
    // (forced by breakBefore) starts with Développement intellectuel so the
    // split never depends on how many criteria a school has.
    const grids = blocks.filter((b) => b.type === 'criteriaGrids');
    expect(grids).toHaveLength(2);
    expect(grids[0]).toMatchObject({
      style: 'grid',
      subjects: ['Comportement', 'Développement physique'],
    });
    expect(grids[0]).not.toHaveProperty('breakBefore');
    expect(grids[1]).toMatchObject({
      style: 'grid',
      subjects: ['Développement intellectuel'],
      breakBefore: 'column',
    });
    const order = blocks.map((b) => b.id);
    expect(order.indexOf('grilles-droite')).toBeLessThan(order.indexOf('appreciations'));
    expect(order.indexOf('appreciations')).toBeLessThan(order.indexOf('signatures'));
    expect(byType('criteriaGrids')).toMatchObject({ style: 'grid' });
    expect(byType('appreciation')).toMatchObject({
      style: 'lines',
      lines: 6,
      title: 'Appréciations',
    });
    expect(byType('signatures')).toMatchObject({ style: 'lines', homeroomFirst: true });
    expect(byType('text')).toMatchObject({ align: 'justify', verticalAlign: 'middle' });
    expect(byType('cover')).toMatchObject({ framed: true, frameStyle: 'solid' });
    expect(captured!.layout).toMatchObject({ showDecoration: false });
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

  it('seeds the two annual carnets: decisions/cover page, grid + signatures sidebar page, no school data in the config', async () => {
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([]);
    const captured = new Map<
      string,
      {
        pages: {
          id: string;
          layout: string;
          asideWidth?: number;
          blocks: Record<string, unknown>[];
        }[];
        layout: Record<string, unknown>;
        typography: Record<string, unknown>;
      }
    >();
    prismaMock.bulletinTemplate.create.mockImplementation((async (args: {
      data: { name: string; config: unknown };
    }) => {
      captured.set(args.data.name, args.data.config as never);
      return {} as never;
    }) as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await main([], { prisma: prismaMock });
    logSpy.mockRestore();

    for (const name of ['Carnet scolaire (3e cycle et secondaire)', 'Carnet scolaire (primaire)']) {
      const cfg = captured.get(name);
      expect(cfg, name).toBeDefined();
      expect(cfg!.layout.showDecoration).toBe(false);
      expect(cfg!.pages.map((p) => p.layout)).toEqual(['sidebar', 'sidebar']);
      const [p1, p2] = cfg!.pages;
      expect(p1!.asideWidth).toBe(48);
      expect(p1!.blocks.map((b) => b.type)).toEqual([
        'yearDecisions',
        'text',
        'text',
        'text',
        'cover',
      ]);
      const cover = p1!.blocks[4]!;
      expect(cover).toMatchObject({
        breakBefore: 'column',
        framed: true,
        frameStyle: 'rounded',
        uppercase: false,
        logoPosition: 'belowTitle',
        titlePattern: 'Carnet scolaire',
        fields: ['fullName', 'className', 'nisu', 'academicYear'],
        fieldLabels: { academicYear: 'Année Scolaire' },
      });
      expect(p2!.asideWidth).toBe(22);
      expect(p2!.blocks.map((b) => b.type)).toEqual(['text', 'yearGrid', 'yearSignatures']);
      expect(p2!.blocks[2]).toMatchObject({ breakBefore: 'column' });
      expect((p2!.blocks[0] as { text: string }).text).toContain('{eleve}');
      expect(JSON.stringify(cfg)).not.toMatch(/Morne Barbeau|ECEMB|\+509/);
    }
    expect(
      (
        captured.get('Carnet scolaire (3e cycle et secondaire)')!.pages[0]!.blocks[4] as {
          sectionLabel: string;
        }
      ).sectionLabel,
    ).toBe('3ème Cycle & Secondaire');
    expect(
      (captured.get('Carnet scolaire (primaire)')!.pages[0]!.blocks[4] as { sectionLabel: string })
        .sectionLabel,
    ).toBe('Section primaire');
    expect(captured.get('Carnet scolaire (primaire)')!.pages[1]!.blocks[1]).toMatchObject({
      showDomains: true,
    });
    expect(
      captured.get('Carnet scolaire (3e cycle et secondaire)')!.pages[1]!.blocks[1],
    ).not.toHaveProperty('showDomains');
    expect(captured.get('Carnet scolaire (primaire)')!.typography).toMatchObject({
      tableBody: 13,
      tableHeader: 13,
      noteValue: 13,
    });
  });

  it('the two carnet configs validate against the real bulletin-templates schema', async () => {
    const { bulletinTemplateConfigSchema } = await import('../src/lib/server/bulletin-templates');
    prismaMock.bulletinTemplate.findMany.mockResolvedValue([]);
    const configs = new Map<string, unknown>();
    prismaMock.bulletinTemplate.create.mockImplementation((args) => {
      const data = (args as { data: { name: string; config: unknown } }).data;
      configs.set(data.name, data.config);
      return Promise.resolve({} as never);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await main([], { prisma: prismaMock });

    for (const name of ['Carnet scolaire (3e cycle et secondaire)', 'Carnet scolaire (primaire)']) {
      const result = bulletinTemplateConfigSchema.safeParse(configs.get(name));
      expect(
        result.success,
        `${name}: ${result.success ? '' : JSON.stringify(result.error.issues)}`,
      ).toBe(true);
    }
    logSpy.mockRestore();
  });
});
