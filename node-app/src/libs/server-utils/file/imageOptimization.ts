import "server-only";

import {
  transformImageBufferByBridge,
  type ImageBridgeFormatType,
} from "./imageTransformBridge";

export type ImageOptimizationAttempt = {
  format?: ImageBridgeFormatType;
  quality: number;
  maxWidth: number;
  maxHeight: number;
};

export type ImageOptimizationPolicy = {
  format: ImageBridgeFormatType;
  targetMaxBytes: number;
  attempts: readonly ImageOptimizationAttempt[];
};

export async function optimizeImageForStorage(input: Buffer, policy: ImageOptimizationPolicy) {
  if (!input.length || !policy.attempts.length) throw new Error("image_optimization_input_invalid");

  let smallest: Awaited<ReturnType<typeof transformImageBufferByBridge>> | null = null;
  for (const attempt of policy.attempts) {
    const transformed = await transformImageBufferByBridge({
      input,
      format: attempt.format || policy.format,
      quality: attempt.quality,
      maxWidth: attempt.maxWidth,
      maxHeight: attempt.maxHeight,
    });
    if (!smallest || transformed.bytes < smallest.bytes) smallest = transformed;
    if (transformed.bytes <= policy.targetMaxBytes) return transformed;
  }

  if (!smallest) throw new Error("image_optimization_failed");
  return smallest;
}
