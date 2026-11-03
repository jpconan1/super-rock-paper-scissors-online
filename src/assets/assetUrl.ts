import versions from 'virtual:asset-versions';

/** Give static media a URL that changes whenever its bytes change. */
export function assetUrl(path: string): string {
  const version = (versions as Record<string, string>)[path];
  return version ? `${path}?v=${version}` : path;
}
