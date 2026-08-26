import { describe, expect, test } from 'vitest';
import { classifyAssetUrls } from '../src/assets/assetBundleTypes';

describe('asset bundle manifest', () => {
  test('separates shared and variant images while excluding loading and non-images', () => {
    expect(classifyAssetUrls([
      'title/logo.webp',
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
        '/interactive-elements/generic-buttons/button.webp',
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
});
