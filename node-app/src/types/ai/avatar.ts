import type { BaseImageType } from "types/app";
import type { SupportedAspectRatio } from "consts/ai";
import type { IPersona } from "./persona";

export type AvatarInputMode = "text" | "reference";

export interface TutorProfileImageGenerateRequest {
  brief?: string;
  templateKey?: string;
  variables?: Record<string, string>;
  modelName?: string;
  aspectRatio?: SupportedAspectRatio;
  size?: string;
  baseImages?: BaseImageType[];
  referenceImageUrl?: string;
  referenceTemplateKey?: string;
  clientRequestId?: string;
  persona?: Partial<IPersona>;
}

export interface TutorProfileImageGenerateResponse {
  data: {
    imageUrl: string;
    templateKey: string;
    libraryAsset?: import("./personaImageLibrary").PersonaImageLibraryAssetType;
    referenceAsset?: import("./personaImageLibrary").PersonaImageLibraryAssetType;
  };
  billing: {
    coins: number;
  };
}
