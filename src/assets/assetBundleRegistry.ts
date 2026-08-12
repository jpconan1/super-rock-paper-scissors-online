import generatedBundles from 'virtual:asset-bundles';
import type { AssetBundleId, AssetBundleRegistry } from './assetBundleTypes';

export const assetBundles: AssetBundleRegistry = generatedBundles;

export function getAssetBundle(id: AssetBundleId): readonly string[] {
  const bundle = assetBundles[id];
  if (!bundle) throw new Error(`Unknown asset bundle: ${id}`);
  return bundle;
}
