import { describe, expect, test } from 'vitest';
import { corsHeadersForOrigin, isAllowedRequestOrigin } from '../src/protocol/originPolicy';

describe('request origin policy', () => {
  test('allows same-origin browsers and non-browser clients', () => {
    expect(isAllowedRequestOrigin('https://abm.jpconan.ca', 'https://abm.jpconan.ca')).toBe(true);
    expect(isAllowedRequestOrigin(null, 'https://abm.jpconan.ca')).toBe(true);
  });

  test('allows different ports between local development servers only', () => {
    expect(isAllowedRequestOrigin('http://localhost:5173', 'http://localhost:8787')).toBe(true);
    expect(isAllowedRequestOrigin('http://127.0.0.1:5173', 'http://localhost:8787')).toBe(true);
    expect(isAllowedRequestOrigin('http://localhost:5173', 'https://abm.jpconan.ca')).toBe(false);
    expect(isAllowedRequestOrigin('https://evil.example', 'http://localhost:8787')).toBe(false);
  });

  test('rejects arbitrary websites', () => {
    expect(isAllowedRequestOrigin('https://evil.example', 'https://abm.jpconan.ca')).toBe(false);
  });

  test('allows only exact configured origins', () => {
    const configured = 'https://html-classic.itch.zone, https://game.example';
    expect(isAllowedRequestOrigin('https://html-classic.itch.zone', 'https://abm.jpconan.ca', configured)).toBe(true);
    expect(isAllowedRequestOrigin('https://itch.zone.evil.example', 'https://abm.jpconan.ca', configured)).toBe(false);
  });

  test('cors response names the approved origin instead of using a wildcard', () => {
    const headers = corsHeadersForOrigin('https://game.example');
    expect(headers['access-control-allow-origin']).toBe('https://game.example');
    expect(headers.vary).toBe('Origin');
  });
});
