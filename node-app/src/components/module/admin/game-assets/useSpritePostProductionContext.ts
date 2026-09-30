"use client";

import { useQuery } from "@tanstack/react-query";
import { getSpritePipeline } from "libs/api/game";
import { refreshStudioImageSignedUrl } from "libs/api/lab";
import { toUnknownRecord } from "utils/common/typeUtils";
import type { IGameAssetDoc } from "types/game";

export function useSpritePostProductionContext(asset: IGameAssetDoc | null, enabled: boolean) {
  const pipelineId = String(toUnknownRecord(asset?.meta).pipelineId || "").trim();
  return useQuery({
    queryKey: ["game-asset-post-production-context", pipelineId],
    enabled: enabled && Boolean(pipelineId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const pipeline = await getSpritePipeline(pipelineId);
      const bibleAssetId = String(pipeline.anchor?.bible?.assetId || "").trim();
      const bibleDirections = (pipeline.anchor?.bible?.directions || []).map((direction) => String(direction));
      if (!bibleAssetId) return { bibleSourceUrl: "", bibleDirections };
      const signed = await refreshStudioImageSignedUrl(bibleAssetId);
      return { bibleSourceUrl: String(signed?.url || ""), bibleDirections };
    },
  });
}
