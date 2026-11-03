import { describe, expect, test } from 'vitest';
import { assetUrl } from '../src/assets/assetUrl';

describe('static asset URLs', () => {
  test('versions known media with a stable content hash', () => {
    const url = assetUrl('/lobby/whiteboard.webp');
    expect(url).toMatch(/^\/lobby\/whiteboard\.webp\?v=[0-9a-f]{12}$/);
    expect(assetUrl('/lobby/whiteboard.webp')).toBe(url);
    expect(assetUrl('/lobby/class-cards/stunner-card-sheet.webp')).not.toBe(url);
  });

  test('leaves dynamic and external URLs alone', () => {
    expect(assetUrl('/custom-emblems/player/artwork.webp')).toBe('/custom-emblems/player/artwork.webp');
    expect(assetUrl('https://example.com/art.webp')).toBe('https://example.com/art.webp');
  });
});
