import { describe, expect, test, vi } from 'vitest';
import { generateRandomName, replaceWithRandomName } from '../src/title/randomName';
import { isNonBlankText } from '../src/input/textEntry';

describe('random player names', () => {
  test('always produces a non-empty name', () => {
    for (let index = 0; index < 100; index++) expect(generateRandomName()).toMatch(/\S/u);
  });

  test('fills the numeric suffix and bracket pattern', () => {
    const values = [0, 0, 0.999, 0.1, 0.2, 0.3, 0.4, 0, 0.999, 0.999, 0];
    let index = 0;
    const name = generateRandomName(() => values[index++] ?? 0);
    expect(name).toMatch(/^xXx_.+1234_xXx$/u);
    expect(name).not.toContain('####');
  });

  test('replaces and focuses a field', () => {
    const field = { value: 'Old', focus: vi.fn() };
    replaceWithRandomName(field, () => 'New Name');
    expect(field.value).toBe('New Name');
    expect(field.focus).toHaveBeenCalledOnce();
  });
});

test('non-blank text validation', () => {
  expect(isNonBlankText('   ')).toBe(false);
  expect(isNonBlankText(' JP ')).toBe(true);
});
