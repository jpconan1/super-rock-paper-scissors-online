import { describe, expect, test } from 'vitest';
import { classifyAssetUrls } from '../src/assets/assetBundleTypes';

describe('asset bundle manifest', () => {
  test('loads shell images at startup and keeps variant images separate', () => {
    expect(classifyAssetUrls([
      'title/logo.webp',
      'lobby/whiteboard.webp',
      'account/portrait.webp',
      'rewards/card.webp',
      'visual-elements/you-tag-p1-sheet.webp',
      'visual-elements/you-tag-p2-sheet.webp',
      'variants/fireball-war/scene.webp',
      'interactive-elements/fireball-war/button.webp',
      'interactive-elements/generic-buttons/button.webp',
      'loading/loadingooo-sheet.webp',
      'audio/theme.mp3',
      'title/logo.webp',
    ])).toEqual({
      shared: [
        '/account/portrait.webp',
        '/interactive-elements/generic-buttons/button.webp',
        '/lobby/whiteboard.webp',
        '/rewards/card.webp',
        '/title/logo.webp',
        '/visual-elements/you-tag-p1-sheet.webp',
        '/visual-elements/you-tag-p2-sheet.webp',
      ],
      'variant:fireball-war': [
        '/interactive-elements/fireball-war/button.webp',
        '/variants/fireball-war/scene.webp',
      ],
    });
  });

  test('startup includes later shell screens but excludes variant art', () => {
    const bundles = classifyAssetUrls([
      'title/logo.webp', 'lobby/whiteboard.webp', 'account/portrait.webp', 'rewards/card.webp',
      'tutorial/slide.webp', 'variants/abm/scene.webp', 'interactive-elements/generic-buttons/button.webp',
      'wipes/curtains/curtains-open-sheet.webp',
    ]);
    expect(bundles.shared).toContain('/lobby/whiteboard.webp');
    expect(bundles.shared).toContain('/rewards/card.webp');
    expect(bundles.shared).toContain('/tutorial/slide.webp');
    expect(bundles.shared).not.toContain('/variants/abm/scene.webp');
  });
});
