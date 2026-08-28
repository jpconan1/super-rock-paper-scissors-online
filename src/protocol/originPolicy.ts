export function isAllowedRequestOrigin(origin: string | null, serverOrigin: string, configuredOrigins?: string): boolean {
  if (origin === null) return true;
  if (origin === serverOrigin) return true;
  return configuredOrigins?.split(',').map((value) => value.trim()).filter(Boolean).includes(origin) ?? false;
}

export function corsHeadersForOrigin(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin',
  };
}
