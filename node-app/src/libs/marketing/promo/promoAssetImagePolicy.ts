import "server-only";

import { optimizeImageForStorage } from "libs/server-utils/file/imageOptimization";

export const PROMO_ASSET_IMAGE_POLICY = Object.freeze({
  format: "webp" as const,
  quality: 82,
  maxWidth: 1_920,
  maxHeight: 1_920,
  optimizeAboveBytes: 512 * 1_024,
  maxAnimatedGifBytes: 512 * 1_024,
  targetMaxBytes: 1_500 * 1_024,
});

export async function optimizePromoAssetImage(input: Buffer) {
  const optimized = await optimizeImageForStorage(input, {
    format: PROMO_ASSET_IMAGE_POLICY.format,
    targetMaxBytes: PROMO_ASSET_IMAGE_POLICY.targetMaxBytes,
    attempts: [
      {
        quality: PROMO_ASSET_IMAGE_POLICY.quality,
        maxWidth: PROMO_ASSET_IMAGE_POLICY.maxWidth,
        maxHeight: PROMO_ASSET_IMAGE_POLICY.maxHeight,
      },
      { quality: 72, maxWidth: 1_600, maxHeight: 1_600 },
    ],
  });
  return {
    ...optimized,
    force: input.length > PROMO_ASSET_IMAGE_POLICY.optimizeAboveBytes,
  };
}
