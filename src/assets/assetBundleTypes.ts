export type AssetBundleId = 'shared' | `variant:${string}`;

export type AssetBundleRegistry = Readonly<Record<AssetBundleId, readonly string[]>>;

const IMAGE_EXTENSIONS = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

export function classifyAssetUrls(paths: readonly string[]): AssetBundleRegistry {
  const bundles: Record<string, string[]> = { shared: [] };
  const normalizedPaths = [...new Set(paths)].map((path) => path.replaceAll('\\', '/').replace(/^\/+/, '')).sort();
  const variantIds = new Set(normalizedPaths.flatMap((path) => path.match(/^variants\/([^/]+)\//)?.[1] ?? []));

  for (const normalized of normalizedPaths) {
    if (!IMAGE_EXTENSIONS.test(normalized) || normalized.startsWith('loading/')) continue;

    const candidate = normalized.match(/^(?:variants|interactive-elements)\/([^/]+)\//)?.[1];
    const variant = candidate && variantIds.has(candidate) ? candidate : undefined;
    const id: AssetBundleId = variant ? `variant:${variant}` : 'shared';
    (bundles[id] ??= []).push(`/${normalized}`);
  }

  return bundles as unknown as AssetBundleRegistry;
}
