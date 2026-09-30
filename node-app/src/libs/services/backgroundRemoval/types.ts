import type { ImageToolProviderType } from "types/ai";

export type BackgroundRemovalOptions = Partial<{
  format: "png" | "jpg" | "webp";
  channels: "rgba" | "alpha";
  bg_color: string;
  size: "preview" | "medium" | "hd" | "full";
  crop: "true" | "false";
}>;

export type BackgroundRemovalProviderType = ImageToolProviderType;

export type BackgroundRemovalProviderResult = {
  buffer: ArrayBuffer;
  contentType: string;
  uncertaintyScore?: string | null;
  providerCredits?: string | null;
  calculatedProviderCredits?: string | null;
};

export type BackgroundRemovalResult = BackgroundRemovalProviderResult & {
  provider: BackgroundRemovalProviderType;
  attemptedProviders: BackgroundRemovalProviderType[];
  fallbackUsed: boolean;
};
