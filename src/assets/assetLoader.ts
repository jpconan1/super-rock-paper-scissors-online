import { getAssetBundle } from './assetBundleRegistry';
import type { AssetBundleId } from './assetBundleTypes';

export interface AssetLease {
  readonly ready: Promise<void>;
  release(): void;
}

type LoadImage = (url: string) => Promise<HTMLImageElement>;

interface ImageRecord {
  image?: HTMLImageElement;
  loading?: Promise<HTMLImageElement>;
  references: number;
}

const RETRY_DELAYS_MS = [0, 150, 500] as const;

export class AssetLoader {
  private readonly records = new Map<string, ImageRecord>();
  private readonly retainedBundles = new Map<AssetBundleId, AssetLease>();

  constructor(private readonly loadImage: LoadImage = loadDecodedImage) {}

  preloadBundle(id: AssetBundleId): AssetLease {
    return this.retainUrls(getAssetBundle(id));
  }

  retainBundle(id: AssetBundleId): Promise<void> {
    const existing = this.retainedBundles.get(id);
    if (existing) return existing.ready;
    const lease = this.preloadBundle(id);
    this.retainedBundles.set(id, lease);
    return lease.ready.catch((error) => {
      if (this.retainedBundles.get(id) === lease) this.retainedBundles.delete(id);
      lease.release();
      throw error;
    });
  }

  releaseBundle(id: AssetBundleId): void {
    const lease = this.retainedBundles.get(id);
    if (!lease) return;
    this.retainedBundles.delete(id);
    lease.release();
  }

  retainUrls(urls: readonly string[]): AssetLease {
    const uniqueUrls = [...new Set(urls)];
    let released = false;
    for (const url of uniqueUrls) this.getRecord(url).references++;

    const ready = Promise.all(uniqueUrls.map((url) => this.ensureLoaded(url))).then(() => undefined);
    return {
      ready,
      release: () => {
        if (released) return;
        released = true;
        for (const url of uniqueUrls) {
          const record = this.records.get(url);
          if (!record) continue;
          record.references--;
          if (record.references <= 0 && !record.loading) this.records.delete(url);
        }
      },
    };
  }

  private getRecord(url: string): ImageRecord {
    let record = this.records.get(url);
    if (!record) {
      record = { references: 0 };
      this.records.set(url, record);
    }
    return record;
  }

  private ensureLoaded(url: string): Promise<HTMLImageElement> {
    const record = this.getRecord(url);
    if (record.image) return Promise.resolve(record.image);
    if (record.loading) return record.loading;

    record.loading = this.loadWithRetry(url).then((image) => {
      record.image = image;
      return image;
    }).finally(() => {
      record.loading = undefined;
      if (record.references <= 0) this.records.delete(url);
    });
    return record.loading;
  }

  private async loadWithRetry(url: string): Promise<HTMLImageElement> {
    let lastError: unknown;
    for (const delay of RETRY_DELAYS_MS) {
      if (delay) await wait(delay);
      try {
        return await this.loadImage(url);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}

export async function loadDecodedImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error(`Could not load image: ${url}`)), { once: true });
    image.src = url;
    if (image.complete) image.naturalWidth ? resolve() : reject(new Error(`Could not load image: ${url}`));
  });
  if (image.decode) await image.decode();
  return image;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export const assetLoader = new AssetLoader();
