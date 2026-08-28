export function resolveServerUrl(configuredUrl: string | undefined, pageOrigin: string): string {
  const candidate = configuredUrl?.trim() || pageOrigin;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Game server URL must be an absolute URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Game server URL must use HTTP or HTTPS.');
  }
  if (url.username || url.password) throw new Error('Game server URL cannot contain credentials.');
  if (url.search || url.hash) throw new Error('Game server URL cannot contain a query or fragment.');
  if (url.pathname !== '/') throw new Error('Game server URL must be an origin without a path.');
  return url.origin;
}
