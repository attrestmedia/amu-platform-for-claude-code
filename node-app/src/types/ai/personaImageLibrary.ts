export type PersonaImageLibrarySourceType = "uploaded_reference" | "generated" | "imported";
export type PersonaImageLibraryStatusType = "active" | "archived" | "deleted";

export type PersonaImageLibraryAssetType = {
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
    thumbnailStorage?: {
      driver: "r2";
      access: "public";
      bucket: string;
      key: string;
      url: string;
      mimeType: string;
      bytes: number;
      sha256: string;
      width: number;
      height: number;
    };
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
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
};
