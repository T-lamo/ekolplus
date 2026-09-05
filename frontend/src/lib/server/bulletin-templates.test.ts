import { describe, it, expect } from 'vitest';
import {
  bulletinTemplateConfigSchema,
  normalizeConfig,
  DEFAULT_BULLETIN_CONFIG,
  DEFAULT_PAGE_NUMBER_FORMAT,
} from './bulletin-templates';

function validConfig() {
  return structuredClone(DEFAULT_BULLETIN_CONFIG);
}

describe('bulletinTemplateConfigSchema', () => {
  it('accepts the default config', () => {
    expect(bulletinTemplateConfigSchema.safeParse(validConfig()).success).toBe(true);
  });

  it('rejects duplicate page ids', () => {
    const cfg = validConfig();
    cfg.pages.push(structuredClone(cfg.pages[0]!));
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it('rejects duplicate block ids across different pages', () => {
    const cfg = validConfig();
    const secondPage = structuredClone(cfg.pages[0]!);
    secondPage.id = 'page-2';
    cfg.pages.push(secondPage);
    // Both pages now carry a block with id 'header' — unique-within-page
    // but not unique across the whole config.
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it('rejects a legacy block type appearing twice on the same page', () => {
    const cfg = validConfig();
    cfg.pages[0]!.blocks.push({ id: 'stats-2', type: 'stats', visible: true });
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it('allows a non-legacy block type to repeat on the same page', () => {
    const cfg = validConfig();
    cfg.pages[0]!.blocks.push(
      {
        id: 'text-1',
        type: 'text',
        visible: true,
        text: 'a',
        align: 'left',
        fontSize: 10,
        bold: false,
        italic: false,
      },
      {
        id: 'text-2',
        type: 'text',
        visible: true,
        text: 'b',
        align: 'left',
        fontSize: 10,
        bold: false,
        italic: false,
      },
    );
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(true);
  });

  it('rejects breakBefore on a full-layout page', () => {
    const cfg = validConfig();
    cfg.pages[0]!.blocks[0]!.breakBefore = 'column';
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it('accepts breakBefore on a halves-layout page', () => {
    const cfg = validConfig();
    cfg.pages[0]!.layout = 'halves';
    cfg.pages[0]!.blocks[0]!.breakBefore = 'column';
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(true);
  });

  it('rejects more than 6 pages', () => {
    const cfg = validConfig();
    for (let i = 0; i < 6; i++) {
      const p = structuredClone(cfg.pages[0]!);
      p.id = `extra-${i}`;
      p.blocks = [
        {
          id: `extra-block-${i}`,
          type: 'text',
          visible: true,
          text: 'x',
          align: 'left',
          fontSize: 10,
          bold: false,
          italic: false,
        },
      ];
      cfg.pages.push(p);
    }
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it('rejects a page with zero blocks', () => {
    const cfg = validConfig();
    cfg.pages[0]!.blocks = [];
    expect(bulletinTemplateConfigSchema.safeParse(cfg).success).toBe(false);
  });
});

describe('normalizeConfig', () => {
  it('converts a legacy flat-blocks config into a single full page, defaulting pageNumberFormat', () => {
    const legacy = {
      primaryColor: '#6c2bd9',
      pageFormat: 'LETTER',
      orientation: 'LANDSCAPE',
      blocks: [
        { id: 'header', visible: true },
        { id: 'stats', visible: false },
      ],
      columns: DEFAULT_BULLETIN_CONFIG.columns,
      signatures: DEFAULT_BULLETIN_CONFIG.signatures,
      typography: DEFAULT_BULLETIN_CONFIG.typography,
      content: { title: 'BULLETIN', footerMessage: null },
      layout: DEFAULT_BULLETIN_CONFIG.layout,
    };

    const result = normalizeConfig(legacy);

    expect(result.pages).toEqual([
      {
        id: 'page-1',
        layout: 'full',
        showPageNumber: false,
        blocks: [
          { id: 'header', type: 'header', visible: true },
          { id: 'stats', type: 'stats', visible: false },
        ],
      },
    ]);
    expect(result.content.pageNumberFormat).toBe(DEFAULT_PAGE_NUMBER_FORMAT);
    expect(result.content.title).toBe('BULLETIN');
  });

  it('returns an already-migrated config unchanged', () => {
    const migrated = validConfig();
    expect(normalizeConfig(migrated)).toEqual(migrated);
  });

  it('the parsed result of a normalized legacy config validates against the full schema', () => {
    const legacy = {
      primaryColor: '#6c2bd9',
      pageFormat: 'LETTER',
      orientation: 'LANDSCAPE',
      blocks: [{ id: 'header', visible: true }],
      columns: DEFAULT_BULLETIN_CONFIG.columns,
      signatures: DEFAULT_BULLETIN_CONFIG.signatures,
      typography: DEFAULT_BULLETIN_CONFIG.typography,
      content: { title: 'BULLETIN', footerMessage: null },
      layout: DEFAULT_BULLETIN_CONFIG.layout,
    };
    expect(bulletinTemplateConfigSchema.safeParse(normalizeConfig(legacy)).success).toBe(true);
  });
});
