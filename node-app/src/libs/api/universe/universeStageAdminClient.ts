import fetchClient from "libs/api/fetchClient";
import type { IStageInfo } from "types/game";

export async function getUniverseStageRefs(universeId: string) {
  const response = await fetchClient.get<{ success: boolean; data?: IStageInfo[]; message?: string }>(
    `/universe/${encodeURIComponent(universeId)}/stages`,
  );
  if (!response.data.success) throw new Error(response.data.message || "universe_stage_refs_load_failed");
  return response.data.data || [];
}

export async function setUniverseDefaultStage(universeId: string, stage: IStageInfo) {
  const current = await getUniverseStageRefs(universeId);
  const targetKey = `${stage.stageId}:${stage.stageName}`;
  const merged = current
    .filter((item) => `${item.stageId}:${item.stageName}` !== targetKey)
    .map((item) => ({ ...item, isDefault: false }));
  merged.push({ ...stage, isDefault: true });

  const response = await fetchClient.put<{ success: boolean; data?: IStageInfo[]; message?: string }>(
    `/universe/${encodeURIComponent(universeId)}/stages`,
    { stages: merged },
  );
  if (!response.data.success) throw new Error(response.data.message || "universe_default_stage_update_failed");
  return response.data.data || [];
}
