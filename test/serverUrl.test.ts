import { describe, expect, test } from 'vitest';
import { resolveServerUrl } from '../src/app/serverUrl';

describe('game server URL', () => {
  test('uses the page origin when no build-time server is configured', () => {
    expect(resolveServerUrl(undefined, 'https://abm.jpconan.ca')).toBe('https://abm.jpconan.ca');
    expect(resolveServerUrl('  ', 'http://localhost:5173')).toBe('http://localhost:5173');
  });

  test('uses and normalizes a trusted build-time server origin', () => {
    expect(resolveServerUrl('https://api.abm.jpconan.ca/', 'https://abm.jpconan.ca'))
      .toBe('https://api.abm.jpconan.ca');
  });

  test.each([
    'api.abm.jpconan.ca',
    'ws://api.abm.jpconan.ca',
    'javascript:alert(1)',
    'https://user:secret@api.abm.jpconan.ca',
    'https://api.abm.jpconan.ca/path',
    'https://api.abm.jpconan.ca?server=evil.example',
    'https://api.abm.jpconan.ca#evil',
  ])('rejects invalid configured server %s', (configuredUrl) => {
    expect(() => resolveServerUrl(configuredUrl, 'https://abm.jpconan.ca')).toThrow();
  });

  test('does not accept a page query as server configuration', () => {
    const page = new URL('https://abm.jpconan.ca/?server=https://evil.example');
    expect(resolveServerUrl(undefined, page.origin)).toBe('https://abm.jpconan.ca');
  });
});
