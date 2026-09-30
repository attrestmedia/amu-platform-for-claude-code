import fetchClient from "libs/api/fetchClient";
import type { PersonaImageLibraryAssetType, PersonaImageLibrarySourceType } from "types/ai";

const BASE = "/persona/image-library";

export async function listPersonaImageLibraryAssets(params?: {
  universeId?: string;
  personaId?: string;
  linkedProfileImageUrl?: string;
  referenceKind?: NonNullable<PersonaImageLibraryAssetType["reference"]>["kind"];
  source?: PersonaImageLibrarySourceType | "all";
  status?: "active" | "archived" | "deleted" | "all";
  limit?: number;
}) {
  const response = await fetchClient.get<{
    success: boolean;
    data?: { assets?: PersonaImageLibraryAssetType[] };
    error?: string;
  }>(BASE, { params, responseType: "auto" });

  if (!response.data?.success) {
    throw new Error(response.data?.error || "persona_image_library_list_failed");
  }

  return Array.isArray(response.data.data?.assets) ? response.data.data.assets : [];
}

export async function uploadPersonaImageLibraryAsset(args: {
  file: File;
  universeId?: string;
  personaId?: string;
  source?: PersonaImageLibrarySourceType;
  tags?: string[];
  generation?: PersonaImageLibraryAssetType["generation"];
  reference?: PersonaImageLibraryAssetType["reference"];
}) {
  const formData = new FormData();
  formData.append("file", args.file);
  formData.append("source", args.source || "uploaded_reference");
  if (args.universeId) formData.append("universeId", args.universeId);
  if (args.personaId) formData.append("personaId", args.personaId);
  if (args.tags?.length) formData.append("tags", args.tags.join(","));
  if (args.generation) formData.append("generation", JSON.stringify(args.generation));
  if (args.reference) formData.append("reference", JSON.stringify(args.reference));

  const response = await fetchClient.post<{
    success: boolean;
    data?: { asset?: PersonaImageLibraryAssetType };
    error?: string;
  }>(BASE, formData, { responseType: "auto" });

  if (!response.data?.success || !response.data.data?.asset) {
    throw new Error(response.data?.error || "persona_image_library_upload_failed");
  }

  return response.data.data.asset;
}

export async function linkPersonaImageLibraryAsset(args: {
  assetId: string;
  personaId?: string;
  linkedProfileImageUrl: string;
}) {
  const response = await fetchClient.patch<{
    success: boolean;
    data?: { asset?: PersonaImageLibraryAssetType };
    error?: string;
  }>(
    BASE,
    {
      assetId: args.assetId,
      action: "link",
      personaId: args.personaId,
      reference: {
        linkedPersonaPid: args.personaId,
        linkedProfileImageUrl: args.linkedProfileImageUrl,
      },
    },
    { responseType: "auto" },
  );

  if (!response.data?.success || !response.data.data?.asset) {
    throw new Error(response.data?.error || "persona_image_library_link_failed");
  }

  return response.data.data.asset;
}

export async function archivePersonaImageLibraryAsset(assetId: string) {
  const response = await fetchClient.patch<{
    success: boolean;
    data?: { asset?: PersonaImageLibraryAssetType };
    error?: string;
  }>(BASE, { assetId, action: "archive" }, { responseType: "auto" });

  if (!response.data?.success || !response.data.data?.asset) {
    throw new Error(response.data?.error || "persona_image_library_archive_failed");
  }

  return response.data.data.asset;
}
