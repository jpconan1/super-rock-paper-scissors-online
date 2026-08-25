import { readdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const virtualAssetBundles = 'virtual:asset-bundles';
const resolvedVirtualAssetBundles = `\0${virtualAssetBundles}`;
const imageExtensions = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const layoutFiles = {
  title: 'src/layout/documents/title.json', lobby: 'src/layout/documents/lobby.json',
  'variant-select': 'src/layout/documents/variant-select.json', scoreboard: 'src/layout/documents/scoreboard.json',
  'game-parent': 'src/layout/documents/game-parent.json',
  'variant-fireball-war': 'src/layout/documents/variants/fireball-war.json',
  'variant-abm': 'src/layout/documents/variants/abm.json',
  'variant-rps': 'src/layout/documents/variants/rps.json',
  'variant-dragon-spear': 'src/layout/documents/variants/dragon-spear.json',
  'variant-pick-two': 'src/layout/documents/variants/pick-two.json',
  'variant-gun-knife-fist': 'src/layout/documents/variants/gun-knife-fist.json',
  'variant-kitchen-sink': 'src/layout/documents/variants/kitchen-sink.json',
  'variant-rps-rpg': 'src/layout/documents/variants/rps-rpg.json',
  'variant-rps-poker': 'src/layout/documents/variants/rps-poker.json',
  'variant-tap-tap-shoot': 'src/layout/documents/variants/tap-tap-shoot.json',
  'variant-detail-rps': 'src/layout/documents/variant-details/rps.json',
  'variant-detail-dragon-spear': 'src/layout/documents/variant-details/dragon-spear.json',
  'variant-detail-pick-two': 'src/layout/documents/variant-details/pick-two.json',
  'variant-detail-gun-knife-fist': 'src/layout/documents/variant-details/gun-knife-fist.json',
  'variant-detail-kitchen-sink': 'src/layout/documents/variant-details/kitchen-sink.json',
  'variant-detail-fireball-war': 'src/layout/documents/variant-details/fireball-war.json',
  'variant-detail-rps-rpg': 'src/layout/documents/variant-details/rps-rpg.json',
  'variant-detail-rps-poker': 'src/layout/documents/variant-details/rps-poker.json',
  'variant-detail-tap-tap-shoot': 'src/layout/documents/variant-details/tap-tap-shoot.json',
};

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
  }, {
    name: 'layout-editor-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__layout-editor/assets', (_request, response) => {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(listAssetPaths(resolve(import.meta.dirname, 'assets')).map((path) => `/${path.replaceAll('\\', '/')}`).sort()));
      });
      server.middlewares.use('/__layout-editor/save', (request, response) => {
        if (request.method !== 'POST') { response.statusCode = 405; response.end('POST required.'); return; }
        let body = '';
        request.on('data', (chunk) => { body += chunk; if (body.length > 2_000_000) request.destroy(); });
        request.on('end', () => {
          try {
            const document = JSON.parse(body);
            const relative = layoutFiles[document?.id];
            if (!relative) throw new Error('Document id is not writable.');
            validateSavedLayout(document);
            const target = resolve(import.meta.dirname, relative);
            const temporary = `${target}.tmp`;
            writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
            renameSync(temporary, target);
            response.setHeader('content-type', 'application/json'); response.end('{"ok":true}');
          } catch (error) { response.statusCode = 400; response.end(error instanceof Error ? error.message : String(error)); }
        });
      });
    },
  }],
  test: {
    include: ['test/**/*.test.ts'],
  },
});

function validateSavedLayout(document) {
  if (!document || document.schemaVersion !== 1 || typeof document.id !== 'string') throw new Error('Invalid layout document.');
  if (!document.canvases?.landscape || !document.canvases?.portrait || !Array.isArray(document.elements)) throw new Error('Missing canvases or elements.');
  const ids = new Set();
  for (const element of document.elements) {
    if (!/^[a-z0-9][a-z0-9:-]*$/.test(element.id) || ids.has(element.id)) throw new Error(`Invalid or duplicate element id ${element.id}.`);
    ids.add(element.id);
    for (const orientation of ['landscape', 'portrait']) {
      const geometry = element.layouts?.[orientation];
      if (!geometry || ![geometry.x, geometry.y, geometry.width, geometry.height].every(Number.isFinite)) throw new Error(`Invalid ${orientation} geometry for ${element.id}.`);
    }
    for (const asset of Object.values(element.assets ?? {})) if (asset !== undefined && !/^\/[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(asset)) throw new Error(`Invalid asset path for ${element.id}.`);
  }
  for (const element of document.elements) if (element.parent && !ids.has(element.parent)) throw new Error(`Unknown parent ${element.parent}.`);
}
