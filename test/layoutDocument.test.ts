import { describe, expect, it } from 'vitest';
import { layoutDocuments, variantDetailLayoutDocuments, variantLayoutDocuments } from '../src/layout/layoutDocuments';
import { validateLayoutDocument } from '../src/layout/layoutDocument';

const base = () => structuredClone(layoutDocuments.get('title')!);

describe('layout documents', () => {
  it('validates every shipped document', () => {
    for (const document of layoutDocuments.values()) expect(validateLayoutDocument(document)).toBe(document);
  });

  it('ships every requested shared document and nine variants', () => {
    expect([...layoutDocuments.keys()]).toEqual(expect.arrayContaining(['title', 'lobby', 'account', 'variant-select', 'scoreboard', 'game-parent', 'class-reward']));
    expect(variantLayoutDocuments).toHaveLength(9);
    for (const variant of variantLayoutDocuments) {
      expect(variant.rules?.lead).toBeTruthy();
      expect(variant.copy?.buttonAssetKey).toBeTruthy();
    }
  });

  it('keeps account settings out of the lobby layout', () => {
    expect(layoutDocuments.get('lobby')!.elements.some((element) => element.id === 'account')).toBe(false);
  });

  it('defines separate reward states with one card-flip box', () => {
    const reward = layoutDocuments.get('class-reward')!;
    const unlocked = reward.elements.filter((element) => element.stateVisibility?.unlocked !== false);
    const next = reward.elements.filter((element) => element.stateVisibility?.next !== false);
    expect(unlocked.map(({ id }) => id)).toEqual(['unlocked-header', 'class-art', 'unlocked-copy', 'unlocked-button']);
    expect(next.map(({ id }) => id)).toEqual(['next-header', 'card-flip', 'next-progress', 'next-progress-count', 'next-button']);
    expect(reward.elements.filter(({ id }) => id === 'card-flip')).toHaveLength(1);
    expect(reward.elements.find(({ id }) => id === 'card-flip')?.assets?.src).toBe('/rewards/card-back.webp');
  });

  it('ships the title Discord button with all three animation sheets', () => {
    const discord = layoutDocuments.get('title')!.elements.find((element) => element.id === 'discord');
    expect(discord?.behavior).toBe('discord');
    expect(discord?.assets).toEqual({
      up: '/title/discord/discord-button-up-sheet.webp',
      between: '/title/discord/discord-button-between-sheet.webp',
      depressed: '/title/discord/discord-button-depressed-sheet.webp',
    });
  });

  it('ships one closed-curtain composition for every variant', () => {
    expect(variantDetailLayoutDocuments).toHaveLength(9);
    for (const detail of variantDetailLayoutDocuments) {
      expect(layoutDocuments.get(detail.copy!.variantDocumentId!)?.kind).toBe('variant');
      expect(detail.elements.some((element) => element.binding === 'selected-variant-button')).toBe(true);
      expect(detail.elements.some((element) => element.binding === 'variant-rules')).toBe(true);
    }
  });

  it('makes the variant-select document authoritative for every button sheet', () => {
    const document = layoutDocuments.get('variant-select')!;
    expect(document.elements.some((element) => element.id === 'grid')).toBe(false);
    for (const id of ['slot-1','slot-2','slot-3','slot-4','slot-5','slot-6','slot-7','slot-8','slot-9','back']) {
      const element = document.elements.find((candidate) => candidate.id === id);
      const assets = element?.assets;
      if (id.startsWith('slot-')) expect(element?.parent, id).toBeUndefined();
      expect(assets?.up, id).toBeTruthy();
      expect(assets?.between, id).toBeTruthy();
      expect(assets?.depressed, id).toBeTruthy();
    }
  });

  it('rejects duplicate ids', () => {
    const document = base(); document.elements.push(structuredClone(document.elements[0]!));
    expect(() => validateLayoutDocument(document)).toThrow(/duplicate/i);
  });

  it('rejects missing orientation geometry', () => {
    const document = base(); delete (document.elements[0]!.layouts as Partial<typeof document.elements[0]['layouts']>).portrait;
    expect(() => validateLayoutDocument(document)).toThrow(/portrait geometry/i);
  });

  it('rejects unsafe assets and unknown bindings', () => {
    const document = base(); document.elements[0]!.assets = { src: '../secret' };
    expect(() => validateLayoutDocument(document)).toThrow(/asset path/i);
    const second = base(); second.elements[0]!.binding = 'made-up';
    expect(() => validateLayoutDocument(second)).toThrow(/unknown binding/i);
  });

  it('allows explicitly overflow-enabled children outside their parent', () => {
    const document = structuredClone(layoutDocuments.get('variant-abm')!);
    const tag = document.elements.find(({ id }) => id === 'p1-proc-tag-1')!;
    tag.layouts.landscape.x = -110;
    delete tag.properties?.allowParentOverflow;
    expect(() => validateLayoutDocument(document)).toThrow(/exceeds parent/i);
    tag.properties = { ...(tag.properties ?? {}), allowParentOverflow: true };
    expect(validateLayoutDocument(document)).toBe(document);
  });
});
