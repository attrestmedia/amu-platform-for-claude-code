import type { ImagePromptMetaType } from "types/app";

export type SpatialGalleryItem = {
  src: string;
  meta?: ImagePromptMetaType;
  templateKey: string;
  templateTitle: string;
};

export type SpatialGalleryQuality = "low" | "medium" | "high";

export type SpatialGalleryUvRect = [number, number, number, number];

export type SpatialGalleryAtlasItem = SpatialGalleryItem & {
  aspectRatio: number;
  uvRect: SpatialGalleryUvRect;
};
