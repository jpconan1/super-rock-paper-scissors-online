export function isAllowedRequestOrigin(origin: string | null, serverOrigin: string, configuredOrigins?: string): boolean {
  if (origin === null) return true;
  if (origin === serverOrigin) return true;
  if (isLoopbackOrigin(origin) && isLoopbackOrigin(serverOrigin)) return true;
  return configuredOrigins?.split(',').map((value) => value.trim()).filter(Boolean).includes(origin) ?? false;
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch { return false; }
}

export function corsHeadersForOrigin(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin',
  };
}
