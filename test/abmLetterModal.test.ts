import { describe, expect, test, vi } from 'vitest';
import letterSource from '../abm-letter.txt?raw';
import { ABM_LETTER_SEEN_KEY, hasSeenAbmLetter, markAbmLetterSeen, parseAbmLetter } from '../src/app/abmLetterModal';

describe('ABM community letter', () => {
  test('preserves copy while mapping finished and unfinished visual markers', () => {
    const blocks = parseAbmLetter(letterSource);
    expect(blocks[0]).toEqual({ type: 'paragraph', text: 'Tuesday, September 1, 2026', placeholder: false });
    expect(blocks).toContainEqual({ type: 'heading', level: 1, text: 'Dear ABM Community,' });
    expect(blocks).toContainEqual(expect.objectContaining({ type: 'image', marker: '(s-rps-o logo)', src: '/community-letter/s-rps-o-logo.webp', boils: true }));
    expect(blocks).toContainEqual(expect.objectContaining({ type: 'image', marker: '(meme)', src: '/community-letter/meme-sheet.webp', boils: true }));
    expect(blocks).toContainEqual({ type: 'link', text: 'https://discord.gg/eVrYpqffej', href: 'https://discord.gg/eVrYpqffej' });
    expect(blocks).toContainEqual(expect.objectContaining({ type: 'image', marker: '(pic of variant grid)', src: '/community-letter/variant-select-mockup.png', boils: false }));
    expect(blocks).toContainEqual({ type: 'paragraph', text: 'I want to give you proper credit and get your blessing.', placeholder: false });
    expect(blocks).toContainEqual({
      type: 'paragraph',
      text: 'You can play a prototype right now at [https://rps.jpconan.ca/](https://rps.jpconan.ca/)',
      placeholder: false,
    });
    expect(blocks).toContainEqual({ type: 'paragraph', text: 'jeanpaulconan (at) gmail.com', placeholder: false });
    expect(blocks).toContainEqual({ type: 'link', text: 'https://jpconan.ca/', href: 'https://jpconan.ca/' });
  });

  test('records and reads the versioned browser flag', () => {
    const setItem = vi.fn();
    markAbmLetterSeen({ setItem });
    expect(setItem).toHaveBeenCalledWith(ABM_LETTER_SEEN_KEY, 'true');
    expect(hasSeenAbmLetter({ getItem: (key) => key === ABM_LETTER_SEEN_KEY ? 'true' : null })).toBe(true);
    expect(hasSeenAbmLetter({ getItem: () => null })).toBe(false);
  });

  test('fails open when browser storage is unavailable', () => {
    expect(hasSeenAbmLetter({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
    expect(() => markAbmLetterSeen({ setItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });
});
