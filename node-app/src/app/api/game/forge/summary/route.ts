import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { listUserGameCharacters, listGameAssets, getStageModel } from "libs/database/game";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app/universe";
import { logger } from "utils/log";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose Play·Forge 대시보드 1회 조회용 집계 — 캐릭터·에셋·맵 합계와 최근 작업, 5단계 stepStatus
 * @process 인증  캐릭터/에셋/맵 병렬 조회  stepStatus 서버 판정  집계 응답
 * @domain game.forge
 * @scope user-api
 */

const MAX_RECENT_WORK = 9;

function iso(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

type StepStatusValue = "locked" | "todo" | "in_progress" | "done";

/**
 * stepStatus는 클라이언트 추론 없이 서버 한 곳에서 판정한다.
 * - step1(캐릭터 등록): 캐릭터 1건 이상이면 done
 * - step2(방향 시트): sprite가 있으면 done(bible은 sprite의 선행), pipeline이 있으면 in_progress, 캐릭터 없으면 locked
 * - step3(스프라이트): spriteAssetId 있으면 done, 캐릭터 없으면 locked
 * - step4(월드 에셋): 에셋 1건 이상이면 done
 * - step5(맵): 맵 1건 이상이면 done
 */
function computeStepStatus(params: {
  hasCharacter: boolean;
  pipelineStarted: boolean;
  spriteDone: boolean;
  assetsTotal: number;
  mapsTotal: number;
}): Record<string, StepStatusValue> {
  return {
    step1: params.hasCharacter ? "done" : "todo",
    step2: !params.hasCharacter
      ? "locked"
      : params.spriteDone
        ? "done"
        : params.pipelineStarted
          ? "in_progress"
          : "todo",
    step3: !params.hasCharacter ? "locked" : params.spriteDone ? "done" : "todo",
    step4: params.assetsTotal > 0 ? "done" : "todo",
    step5: params.mapsTotal > 0 ? "done" : "todo",
  };
}

export const GET = withAuth(
  async (_body, user, request) => {
    try {
      const uid = getAuthenticatedUid(user as AuthenticatedUserType);
      const { searchParams } = new URL(request.url);
      const universeId = String(searchParams.get("universeId") || DEFAULT_PLAY_UNIVERSE).trim();

      if (!uid) {
        return NextResponse.json({ ok: false, error: "unauthorized", errorCode: "UNAUTHORIZED" }, { status: 401 });
      }

      const [characters, assetResult, stageModel] = await Promise.all([
        listUserGameCharacters({ uid, universeId, limit: 50 }),
        listGameAssets({ createdBy: uid, status: "all", pageSize: 100 }),
        getStageModel(),
      ]);

      const stages = await stageModel
        .find({ $or: [{ ownerType: "user", ownerId: uid }, { createdBy: uid }] })
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean();

      const latestCharacter = characters[0];
      const latestStage = stages[0];

      const byCategory: Record<string, number> = {};
      for (const asset of assetResult.items) {
        const category = String(asset.categories?.[0] || asset.assetType || "other").trim();
        if (category) byCategory[category] = (byCategory[category] || 0) + 1;
      }

      // 최근 작업: 캐릭터·에셋·맵을 updatedAt 내림차순으로 병합(신규 엔티티 없음, Q4).
      const recentWork = [
        ...characters.slice(0, 3).map((character) => ({
          kind: "character" as const,
          id: character.characterId,
          name: character.name,
          imageUrl: character.sourceImageRef || undefined,
          updatedAt: iso(character.updatedAt),
        })),
        ...assetResult.items.slice(0, 3).map((asset) => ({
          kind: "asset" as const,
          id: asset.gameAssetId,
          name: asset.name,
          imageUrl: asset.storage?.url || undefined,
          updatedAt: iso(asset.updatedAt),
        })),
        ...stages.slice(0, 3).map((stage) => ({
          kind: "map" as const,
          id: String(stage.stageId || ""),
          name: String(stage.stageName || stage.stageId || ""),
          updatedAt: iso(stage.updatedAt),
        })),
      ]
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
        .slice(0, MAX_RECENT_WORK);

      return NextResponse.json({
        ok: true,
        data: {
          characters: {
            total: characters.length,
            active: characters.filter((character) => character.status === "active").length,
            latest: latestCharacter
              ? {
                  characterId: latestCharacter.characterId,
                  name: latestCharacter.name,
                  status: latestCharacter.status,
                  imageUrl: latestCharacter.sourceImageRef || "",
                  updatedAt: iso(latestCharacter.updatedAt),
                }
              : null,
          },
          assets: {
            total: assetResult.pagination.total,
            byCategory,
          },
          maps: {
            total: stages.length,
            latest: latestStage
              ? {
                  stageId: String(latestStage.stageId || ""),
                  stageName: String(latestStage.stageName || latestStage.stageId || ""),
                  updatedAt: iso(latestStage.updatedAt),
                }
              : null,
          },
          recentWork,
          stepStatus: computeStepStatus({
            hasCharacter: characters.length > 0,
            pipelineStarted: Boolean(latestCharacter?.pipelineId),
            spriteDone: Boolean(latestCharacter?.spriteAssetId),
            assetsTotal: assetResult.pagination.total,
            mapsTotal: stages.length,
          }),
        },
      });
    } catch (error) {
      logger.error("[ForgeSummary][GET] failed:", error);
      return NextResponse.json(
        { ok: false, error: "forge_summary_failed", errorCode: "FORGE_SUMMARY_FAILED" },
        { status: 500 },
      );
    }
  },
  undefined,
  "game/forge:summary",
  { bodyParser: "none" },
);
