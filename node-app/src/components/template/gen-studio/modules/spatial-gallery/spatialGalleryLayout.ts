import type { SpatialGalleryAtlasItem, SpatialGalleryQuality } from "./types";

export const SPATIAL_GALLERY_LIMITS: Record<SpatialGalleryQuality, number> = {
  low: 18,
  medium: 30,
  high: 42,
};

export const SPATIAL_GALLERY_ATLAS: Record<
  SpatialGalleryQuality,
  { size: number; cell: number; columns: number }
> = {
  low: { size: 1024, cell: 192, columns: 5 },
  medium: { size: 2048, cell: 224, columns: 9 },
  high: { size: 2048, cell: 256, columns: 8 },
};

export type SpatialGalleryTransform = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function createSpatialGalleryTransforms(items: SpatialGalleryAtlasItem[]): SpatialGalleryTransform[] {
  const count = Math.max(items.length, 1);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  return items.map((item, index) => {
    const progress = (index + 0.5) / count;
    const y = 1 - progress * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const jitter = (hashString(item.meta?.assetId || item.src) - 0.5) * 0.34;
    const theta = index * goldenAngle + jitter;
    const depthBias = 0.84 + hashString(`${item.src}:depth`) * 0.3;
    const x = Math.cos(theta) * radius * 5.2 * depthBias;
    const z = Math.sin(theta) * radius * 3.8 * depthBias;
    const vertical = y * 3.55;
    const width = Math.min(1.48, Math.max(0.82, item.aspectRatio)) * 1.02;
    const height = width / Math.min(1.65, Math.max(0.62, item.aspectRatio));
    const pitch = (hashString(`${item.src}:pitch`) - 0.5) * 0.38;
    const yaw = (hashString(`${item.src}:yaw`) - 0.5) * 0.82;
    const roll = (hashString(`${item.src}:roll`) - 0.5) * 0.22;

    return {
      position: [x, vertical, z],
      rotation: [pitch, yaw, roll],
      scale: [width, height, 1],
    };
  });
}

export function resolveSpatialGalleryQuality(): SpatialGalleryQuality {
  if (typeof window === "undefined") return "medium";

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  const narrow = window.innerWidth < 640;
  const constrainedMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
  const constrainedCpu = typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4;
  const constrainedNetwork = Boolean(
    nav.connection?.saveData || ["slow-2g", "2g"].includes(nav.connection?.effectiveType || ""),
  );

  if (narrow || constrainedMemory || constrainedCpu || constrainedNetwork) return "low";
  if (window.innerWidth < 1180 || (typeof nav.deviceMemory === "number" && nav.deviceMemory < 8)) return "medium";
  return "high";
}
