import { describe, expect, test } from 'vitest';
import { consumeSlidingWindow, messageFitsUtf8Limit, readJsonBody, RequestBodyError } from '../src/protocol/abuseProtection';

describe('request abuse protection', () => {
  test('parses a bounded JSON request', async () => {
    await expect(readJsonBody<{ ok: boolean }>(new Request('https://example.test', {
      method: 'POST', body: '{"ok":true}', headers: { 'content-type': 'application/json' },
    }))).resolves.toEqual({ ok: true });
  });

  test('rejects declared and actual oversized bodies', async () => {
    const declared = new Request('https://example.test', { method: 'POST', body: '{}', headers: { 'content-length': '2001' } });
    await expect(readJsonBody(declared)).rejects.toMatchObject({ status: 413 } satisfies Partial<RequestBodyError>);
    const actual = new Request('https://example.test', { method: 'POST', body: JSON.stringify({ value: 'x'.repeat(2_000) }) });
    await expect(readJsonBody(actual)).rejects.toMatchObject({ status: 413 } satisfies Partial<RequestBodyError>);
  });

  test('rejects malformed JSON as a client error', async () => {
    await expect(readJsonBody(new Request('https://example.test', { method: 'POST', body: '{' })))
      .rejects.toMatchObject({ status: 400 } satisfies Partial<RequestBodyError>);
  });

  test('sliding message allowance recovers after its window', () => {
    let times: number[] = [];
    for (let now = 0; now < 3; now++) ({ times } = consumeSlidingWindow(times, now, 3, 10_000));
    expect(consumeSlidingWindow(times, 3, 3, 10_000).allowed).toBe(false);
    expect(consumeSlidingWindow(times, 10_002, 3, 10_000).allowed).toBe(true);
  });

  test('message size uses UTF-8 bytes and rejects binary match commands', () => {
    expect(messageFitsUtf8Limit('x'.repeat(256_000), 256_000)).toBe(true);
    expect(messageFitsUtf8Limit('x'.repeat(256_001), 256_000)).toBe(false);
    expect(messageFitsUtf8Limit('🪨'.repeat(64_000), 256_000)).toBe(true);
    expect(messageFitsUtf8Limit('🪨'.repeat(64_001), 256_000)).toBe(false);
    expect(messageFitsUtf8Limit(new ArrayBuffer(1), 256_000)).toBe(false);
  });
});
