import { Schema, Document } from "mongoose";
import type { PersonaImageLibrarySourceType, PersonaImageLibraryStatusType } from "types/ai";

export interface IPersonaImageLibraryAssetDocument extends Document {
  assetId: string;
  uid: string;
  universeId?: string;
  personaId?: string;
  source: PersonaImageLibrarySourceType;
  status: PersonaImageLibraryStatusType;
  storage: {
    driver?: "r2" | "local";
    access?: "public" | "private";
    bucket?: string;
    key?: string;
    url?: string;
    sha256?: string;
    bytes?: number;
    originalUrl?: string;
    optimizedUrl: string;
    thumbnailUrl?: string;
    mimeType: string;
    width: number;
    height: number;
    sizeBytes: number;
    thumbnailStorage?: Record<string, unknown>;
    migrationState?: "r2" | "migration-required";
  };
  generation?: {
    templateKey?: string;
    modelName?: string;
    promptHash?: string;
    generationJobId?: string;
  };
  reference?: {
    usedForAssetIds?: string[];
    sourceAssetId?: string;
    kind?: "profile_reference_sketch" | "profile_reference_photo" | "profile_generated_result";
    sourceTemplateKey?: string;
    sourceTemplateTitle?: string;
    sourceReferenceRole?: "reference" | "model";
    referenceStrength?: "light" | "medium" | "preserve";
    linkedPersonaPid?: string;
    linkedProfileImageUrl?: string;
    note?: string;
  };
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
}

export const PersonaImageLibraryAssetSchema = new Schema<IPersonaImageLibraryAssetDocument>(
  {
    assetId: { type: String, required: true, unique: true, index: true },
    uid: { type: String, required: true, index: true },
    universeId: { type: String, default: "", index: true },
    personaId: { type: String, default: "", index: true },
    source: {
      type: String,
      enum: ["uploaded_reference", "generated", "imported"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "archived", "deleted"],
      required: true,
      default: "active",
      index: true,
    },
    storage: { type: Schema.Types.Mixed, required: true },
    generation: { type: Schema.Types.Mixed, default: {} },
    reference: { type: Schema.Types.Mixed, default: {} },
    tags: [{ type: String }],
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "persona_image_library_assets" },
);

PersonaImageLibraryAssetSchema.index({ uid: 1, status: 1, createdAt: -1 });
PersonaImageLibraryAssetSchema.index({ uid: 1, universeId: 1, personaId: 1, status: 1, createdAt: -1 });
PersonaImageLibraryAssetSchema.index({ uid: 1, source: 1, status: 1, createdAt: -1 });
PersonaImageLibraryAssetSchema.index({ "storage.optimizedUrl": 1 });
