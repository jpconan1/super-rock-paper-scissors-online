import { describe, expect, test } from 'vitest';
import { QUIT_CONFIRMATION_COPY } from '../src/app/universalMenu';

describe('universal menu', () => {
  test('confirms quitting to the title screen', () => {
    expect(QUIT_CONFIRMATION_COPY).toBe('Are you sure you want to quit to the title screen?');
  });
});
