import fetchClient from "libs/api/fetchClient";
import type { GameAssetStorageType } from "types/game";

export async function uploadGameAssetImage(params: {
  gameAssetId: string;
  universeId: string;
  file: File;
  preferredFileName?: string;
}) {
  const form = new FormData();
  form.append("gameAssetId", params.gameAssetId);
  form.append("universeId", params.universeId);
  form.append("file", params.file);
  if (params.preferredFileName) form.append("preferredFileName", params.preferredFileName);

  const response = await fetchClient.post<{ ok: boolean; data?: GameAssetStorageType; error?: string }>(
    "/game/assets/upload",
    form,
    { loading: "global" },
  );
  if (!response.data.ok || !response.data.data) {
    throw new Error(response.data.error || "game_asset_upload_failed");
  }
  return response.data.data;
}
