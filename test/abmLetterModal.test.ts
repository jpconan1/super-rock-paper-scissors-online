import { describe, expect, test, vi } from 'vitest';
import letterSource from '../abm-letter.txt?raw';
import alphaPatchNotesSource from '../alpha-patch-notes.md?raw';
import { ABM_NEWSLETTER_POSTS, ABM_NEWSLETTER_SEEN_KEY, hasSeenAbmNewsletter, markAbmNewsletterSeen, parseAbmLetter } from '../src/app/abmLetterModal';

describe('ABM community letter', () => {
  test('preserves copy while mapping finished and unfinished visual markers', () => {
    const blocks = parseAbmLetter(letterSource, ABM_NEWSLETTER_POSTS[1]!.visuals);
    expect(blocks[0]).toEqual({ type: 'paragraph', text: 'Tuesday, September 1, 2026', placeholder: false });
    expect(blocks).toContainEqual({ type: 'heading', level: 1, text: 'Dear ABM Community,' });
    expect(blocks).toContainEqual(expect.objectContaining({ type: 'image', marker: '(s-rps-o logo)', src: '/community-letter/s-rps-o-logo.webp', boils: true }));
    expect(blocks).toContainEqual(expect.objectContaining({ type: 'image', marker: '(meme)', src: '/community-letter/meme-sheet.webp', boils: true }));
    expect(blocks).toContainEqual({ type: 'link', text: 'https://discord.gg/eVrYpqffej', href: 'https://discord.gg/eVrYpqffej' });
    expect(blocks).toContainEqual(expect.objectContaining({ type: 'image', marker: '(pic of variant grid)', src: '/community-letter/variant-select-mockup.webp', boils: false }));
    expect(blocks).toContainEqual({ type: 'paragraph', text: 'I want to give you proper credit and get your blessing.', placeholder: false });
    expect(blocks).toContainEqual({
      type: 'paragraph',
      text: 'You can play a prototype right now at [https://rps.jpconan.ca/](https://rps.jpconan.ca/)',
      placeholder: false,
    });
    expect(blocks).toContainEqual({ type: 'paragraph', text: 'jeanpaulconan (at) gmail.com', placeholder: false });
    expect(blocks).toContainEqual({ type: 'link', text: 'https://jpconan.ca/', href: 'https://jpconan.ca/' });
  });

  test('orders the alpha patch first and parses its Markdown and RIP logo', () => {
    expect(ABM_NEWSLETTER_POSTS.map(({ id }) => id)).toEqual(['super-abm-alpha', 'community-letter-2026-09-01']);
    const blocks = parseAbmLetter(alphaPatchNotesSource, ABM_NEWSLETTER_POSTS[0]!.visuals);
    expect(blocks.slice(0, 4)).toEqual([
      { type: 'paragraph', text: 'Saturday, September 12, 2026', placeholder: false },
      { type: 'heading', level: 1, text: 'Super ABM Alpha!' },
      { type: 'heading', level: 2, text: 'Patch Notes' },
      { type: 'list', ordered: false, items: [
        'Added all 21 classes',
        'Renamed Tax Collector to Taxman',
        'Buffed Joe: increased the infinite mana chance from one in a million to 1/1000.',
      ] },
    ]);
    expect(blocks).toContainEqual({ type: 'list', ordered: true, items: [
      "Bad name. I wanted just 'Super RPS' but there’s an existing game on Steam with that name. Super Rock Paper Scissors Online was an awkward attempt at differentiation.",
      'No progression. Players had no reason to keep playing and coming back.',
    ] });
    expect(blocks).toContainEqual(expect.objectContaining({
      type: 'image', marker: '[rip logo]', src: '/community-letter/rip-s-rps-o-sheet.webp', boils: true,
    }));
    expect(blocks).toContainEqual({ type: 'heading', level: 3, text: '-JP' });
  });

  test('records and reads the versioned browser flag', () => {
    const setItem = vi.fn();
    markAbmNewsletterSeen({ setItem });
    expect(setItem).toHaveBeenCalledWith(ABM_NEWSLETTER_SEEN_KEY, 'true');
    expect(hasSeenAbmNewsletter({ getItem: (key) => key === ABM_NEWSLETTER_SEEN_KEY ? 'true' : null })).toBe(true);
    expect(hasSeenAbmNewsletter({ getItem: () => null })).toBe(false);
  });

  test('fails open when browser storage is unavailable', () => {
    expect(hasSeenAbmNewsletter({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
    expect(() => markAbmNewsletterSeen({ setItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });
});
