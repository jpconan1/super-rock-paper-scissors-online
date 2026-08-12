import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const virtualAssetBundles = 'virtual:asset-bundles';
const resolvedVirtualAssetBundles = `\0${virtualAssetBundles}`;
const imageExtensions = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

function listAssetPaths(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? listAssetPaths(resolve(directory, entry.name), relative)
      : [relative];
  });
}

function classifyAssetUrls(paths) {
  const bundles = { shared: [] };
  const normalizedPaths = [...new Set(paths)].map((path) => path.replaceAll('\\', '/').replace(/^\/+/, '')).sort();
  const variantIds = new Set(normalizedPaths.flatMap((path) => path.match(/^variants\/([^/]+)\//)?.[1] ?? []));
  for (const normalized of normalizedPaths) {
    if (!imageExtensions.test(normalized) || normalized.startsWith('loading/')) continue;
    const candidate = normalized.match(/^(?:variants|interactive-elements)\/([^/]+)\//)?.[1];
    const variant = candidate && variantIds.has(candidate) ? candidate : undefined;
    const id = variant ? `variant:${variant}` : 'shared';
    (bundles[id] ??= []).push(`/${normalized}`);
  }
  return bundles;
}

export default defineConfig({
  publicDir: 'assets',
  plugins: [{
    name: 'asset-bundle-manifest',
    resolveId(id) {
      if (id === virtualAssetBundles) return resolvedVirtualAssetBundles;
    },
    load(id) {
      if (id !== resolvedVirtualAssetBundles) return;
      const bundles = classifyAssetUrls(listAssetPaths(resolve(import.meta.dirname, 'assets')));
      return `export default ${JSON.stringify(bundles)};`;
    },
  }],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
