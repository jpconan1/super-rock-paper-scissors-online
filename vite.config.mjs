import { readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';

const virtualAssetBundles = 'virtual:asset-bundles';
const resolvedVirtualAssetBundles = `\0${virtualAssetBundles}`;
const imageExtensions = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const writableLayoutFiles = {
  title: 'src/layout/documents/title.json',
  lobby: 'src/layout/documents/lobby.json',
  'variant-abm': 'src/layout/documents/variants/abm.json',
  'class-reward': 'src/layout/documents/class-reward.json',
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
    configureServer(server) {
      const assetsDirectory = resolve(import.meta.dirname, 'assets');
      const refreshManifest = (file) => {
        const absolute = resolve(file);
        if (absolute !== assetsDirectory && !absolute.startsWith(`${assetsDirectory}/`)) return;
        const module = server.moduleGraph.getModuleById(resolvedVirtualAssetBundles);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', refreshManifest);
      server.watcher.on('unlink', refreshManifest);
    },
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
      server.middlewares.use('/__layout-editor/save', (request, response) => {
        if (request.method !== 'POST') { response.statusCode = 405; response.end('POST required.'); return; }
        let body = '';
        request.on('data', (chunk) => { body += chunk; if (body.length > 2_000_000) request.destroy(); });
        request.on('end', () => {
          try {
            const document = JSON.parse(body);
            const layoutFile = writableLayoutFiles[document?.id];
            if (!layoutFile) throw new Error('This layout is not writable.');
            validateSavedLayout(document);
            const target = resolve(import.meta.dirname, layoutFile);
            const temporary = `${target}.tmp`;
            writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
            renameSync(temporary, target);
            execFileSync(process.execPath, [resolve(import.meta.dirname, 'node_modules/vite/bin/vite.js'), 'build'], {
              cwd: import.meta.dirname,
              stdio: 'pipe',
            });
            response.setHeader('content-type', 'application/json'); response.end('{"ok":true}');
          } catch (error) { response.statusCode = 400; response.end(error instanceof Error ? error.message : String(error)); }
        });
      });
    },
  }, {
    name: 'matchup-lab-api',
    apply: 'serve',
    configureServer(server) {
      const target = resolve(import.meta.dirname, 'matchup-lab-data.json');
      server.middlewares.use('/__matchup-lab/reviews', (request, response) => {
        response.setHeader('content-type', 'application/json');
        if (request.method === 'GET') { response.end(readFileSync(target, 'utf8')); return; }
        if (request.method !== 'POST') { response.statusCode = 405; response.end('POST required.'); return; }
        let body = '';
        request.on('data', (chunk) => { body += chunk; if (body.length > 2_000_000) request.destroy(); });
        request.on('end', () => {
          try {
            const data = JSON.parse(body);
            validateMatchupLabData(data);
            const temporary = `${target}.tmp`;
            writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
            renameSync(temporary, target);
            response.end('{"ok":true}');
          } catch (error) { response.statusCode = 400; response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); }
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
    for (const [mode, layouts] of Object.entries(element.alternateLayouts ?? {})) {
      for (const orientation of ['landscape', 'portrait']) {
        const geometry = layouts?.[orientation];
        if (!geometry || ![geometry.x, geometry.y, geometry.width, geometry.height].every(Number.isFinite)) throw new Error(`Invalid ${mode} ${orientation} geometry for ${element.id}.`);
      }
    }
    for (const asset of Object.values(element.assets ?? {})) if (asset !== undefined && !/^\/[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(asset)) throw new Error(`Invalid asset path for ${element.id}.`);
  }
  for (const element of document.elements) if (element.parent && !ids.has(element.parent)) throw new Error(`Unknown parent ${element.parent}.`);
}

const abmClassIds = new Set([
  'lucky', 'advantaged', 'thief', 'juggernaut', 'stunner', 'duplicator', 'sumo',
  'cheater', 'investor', 'gambler', 'taxman', 'copywriter', 'conjurer', 'fireborne',
  'retired', 'parrymaster', 'cupid', 'defender', 'last-ditch', 'null', 'joe',
]);

function validateMatchupLabData(data) {
  if (!data || data.schemaVersion !== 1 || !data.records || typeof data.records !== 'object' || Array.isArray(data.records)) throw new Error('Invalid matchup lab data.');
  for (const [key, review] of Object.entries(data.records)) {
    const parts = key.split(':');
    if (parts.length !== 2 || !parts.every((id) => abmClassIds.has(id))) throw new Error(`Unknown matchup ${key}.`);
    if (!review || typeof review !== 'object' || typeof review.tested !== 'boolean'
      || !review.interactions || typeof review.interactions !== 'object' || Array.isArray(review.interactions)
      || Object.values(review.interactions).some((checked) => typeof checked !== 'boolean')) throw new Error(`Invalid review ${key}.`);
    const allowed = parts[0] === parts[1] ? new Set(['baseline', `class:${parts[0]}`])
      : new Set(['baseline', `yours:${parts[0]}`, `opponent:${parts[1]}`]);
    if (Object.keys(review.interactions).some((id) => !allowed.has(id))) throw new Error(`Unknown interaction in ${key}.`);
  }
}
