import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { normalizeString } from "libs/server-utils/api/apiSafetyHelper";
import {
  abandonUserGameCharacterAtomic,
  attachUserGameCharacterPipelineAtomic,
  clearUserGameCharacterFailedAnchorHistory,
  confirmUserGameCharacterResultAtomic,
  getGameAssetById,
  getGameAssetPipelineById,
  getPipelineStepState,
  getUserGameCharacterById,
  recordUserGameCharacterFailedAnchorAtomic,
  resetFailedDirectionRegensAtomic,
  resetPipelineStepAtomic,
  syncUserGameCharacterPipelineStatus,
} from "libs/database/game";
import { getImageAssetByAssetId } from "libs/database/lab";
import {
  confirmSpritePipelineBible,
  createSpritePipeline,
  runSpritePipelineStep,
} from "libs/server-utils/game/spritePipelineOrchestrator";
import { getSpriteDirectionPricingQuote } from "libs/server-utils/game/spriteDirectionGenerationService";
import { presentSpritePipelineForClient } from "libs/server-utils/game/spritePipelinePresenter";
import {
  canAccessImageAsset,
  getAuthenticatedUid,
} from "libs/server-utils/lab/imageAssetAccess";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import {
  resolveDirectionRegenPlan,
  resolveNextPipelineStep,
  SPRITE_PIPELINE_STEP_RUNNING_STATUS,
} from "utils/game/assetPipeline";
import { SPRITE_DIRECTIONS, SPRITE_PIPELINE_STEP_KEYS, type SpriteDirectionType } from "types/game/asset-pipeline";
import {
  CHARACTER_BIBLE_SYMMETRIES,
  type CharacterBibleCandidateType,
  type CharacterBibleSymmetryType,
} from "types/game/asset-pipeline";
import { logger } from "utils/log";
import { toErrorLike, toUnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 사용자 소유 캐릭터를 경계로 P2 파이프라인 준비·다음 단계 실행·최종 확정을 안전하게 제공
 * @process owner 캐릭터 조회  파이프라인 owner 결속  서버 next-step 판정  결과 시트 확정
 * @domain game.user-character
 * @scope user-api
 */

type RouteParams = { characterId: string };
type PipelineAction =
  | "prepare"
  | "advance"
  | "regenerate-direction"
  | "mirror-direction"
  | "confirm-bible"
  | "confirm"
  | "restart";

function getUid(user: AuthenticatedUserType) {
  return getAuthenticatedUid(user);
}

async function getOwnedCharacter(user: AuthenticatedUserType, characterId: string) {
  const uid = getUid(user);
  if (!uid) return null;
  return getUserGameCharacterById({ uid, characterId });
}

async function getOwnedPipeline(uid: string, pipelineId: string) {
  const pipeline = await getGameAssetPipelineById(pipelineId);
  if (!pipeline || String(pipeline.createdBy || "") !== uid) return null;
  return pipeline;
}

async function toClientState(user: AuthenticatedUserType, characterId: string) {
  const uid = getUid(user);
  const character = await getOwnedCharacter(user, characterId);
  if (!character) return null;

  const pipelineId = String(character.pipelineId || "").trim();
  const pipeline = pipelineId ? await getOwnedPipeline(uid, pipelineId) : null;
  const anchorAssetId = String(
    pipeline?.anchor?.imageAssetId || character.sourceImageAssetId || "",
  ).trim();
  const anchorAsset = anchorAssetId ? await getImageAssetByAssetId(anchorAssetId) : null;
  const anchorDisplay = anchorAsset
    ? await resolveImageAssetDisplayUrl(anchorAsset, { delivery: "signed" })
    : null;
  const spriteAssetId = String(pipeline?.result?.gameAssetId || character.spriteAssetId || "").trim();
  const spriteAsset = spriteAssetId ? await getGameAssetById(spriteAssetId) : null;
  const nextStep = pipeline ? resolveNextPipelineStep(pipeline) : null;
  const bibleStep = pipeline?.steps?.["step1-bible"];
  const bibleCandidate = toUnknownRecord(bibleStep?.meta).candidate as CharacterBibleCandidateType | undefined;
  const bibleAssetId = String(pipeline?.anchor?.bible?.assetId || bibleCandidate?.assetId || "").trim();
  const bibleAsset = bibleAssetId ? await getImageAssetByAssetId(bibleAssetId) : null;
  const bibleDisplay = bibleAsset
    ? await resolveImageAssetDisplayUrl(bibleAsset, { delivery: "signed" })
    : null;
  const needsDirectionQuote = Boolean(
    pipeline?.status === "verify_failed" && resolveDirectionRegenPlan(pipeline).length > 0,
  );
  const directionQuote = needsDirectionQuote
    ? await getSpriteDirectionPricingQuote(pipeline as NonNullable<typeof pipeline>).catch((error) => {
        logger.warn("[UserGameCharacterPipeline] direction quote unavailable:", error);
        return null;
      })
    : null;
  const clientPipeline = pipeline ? await presentSpritePipelineForClient(pipeline) : null;

  return {
    character,
    pipeline: clientPipeline,
    nextStep,
    nextStepMayCharge:
      nextStep === "step1-bible" ||
      nextStep === "step2-base" ||
      nextStep === "step2-diagonal" ||
      nextStep === "step2-dir" ||
      nextStep === "step3-removebg",
    directionQuote,
    anchorUrl: String(anchorDisplay?.url || pipeline?.anchor?.sourceUrl || ""),
    bibleRequired: Boolean(pipeline && Object.prototype.hasOwnProperty.call(pipeline.steps || {}, "step1-bible")),
    bibleCandidate: bibleCandidate || null,
    bibleUrl: String(bibleDisplay?.url || ""),
    bibleConfirmed: Boolean(pipeline?.anchor?.bible?.confirmedAt),
    canConfirmBible: Boolean(bibleCandidate?.allPassed && !pipeline?.anchor?.bible?.confirmedAt),
    sheetUrl: String(spriteAsset?.storage?.url || ""),
    canConfirm: pipeline?.status === "composed" && Boolean(spriteAssetId),
  };
}

async function preparePipeline(user: AuthenticatedUserType, characterId: string) {
  const uid = getUid(user);
  const character = await getOwnedCharacter(user, characterId);
  if (!character) {
    return NextResponse.json(
      { ok: false, error: "character_not_found", errorCode: "CHARACTER_NOT_FOUND" },
      { status: 404 },
    );
  }
  if (character.status === "disabled") {
    return NextResponse.json(
      { ok: false, error: "character_disabled", errorCode: "CHARACTER_DISABLED" },
      { status: 409 },
    );
  }

  const currentPipelineId = String(character.pipelineId || "").trim();
  if (currentPipelineId) {
    const currentPipeline = await getOwnedPipeline(uid, currentPipelineId);
    if (!currentPipeline) {
      return NextResponse.json(
        { ok: false, error: "pipeline_owner_mismatch", errorCode: "PIPELINE_OWNER_MISMATCH" },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: true, data: await toClientState(user, characterId) });
  }

  const asset = await getImageAssetByAssetId(character.sourceImageAssetId);
  if (
    !asset ||
    String(asset.state || "") !== "active" ||
    asset.hardDeletedAt ||
    !(await canAccessImageAsset(user, asset))
  ) {
    return NextResponse.json(
      { ok: false, error: "source_image_unavailable", errorCode: "SOURCE_IMAGE_UNAVAILABLE" },
      { status: 403 },
    );
  }

  const { pipeline } = await createSpritePipeline({
    uid,
    anchorImageAssetId: character.sourceImageAssetId,
    name: character.name,
    includeBible: true,
  });
  if (String(pipeline.createdBy || "") !== uid) {
    return NextResponse.json(
      { ok: false, error: "pipeline_owner_mismatch", errorCode: "PIPELINE_OWNER_MISMATCH" },
      { status: 403 },
    );
  }

  const attached = await attachUserGameCharacterPipelineAtomic({
    uid,
    characterId,
    pipelineId: pipeline.pipelineId,
  });
  if (!attached) {
    const raced = await getOwnedCharacter(user, characterId);
    if (String(raced?.pipelineId || "") !== pipeline.pipelineId) {
      return NextResponse.json(
        { ok: false, error: "character_pipeline_attach_conflict", errorCode: "CHARACTER_PIPELINE_ATTACH_CONFLICT" },
        { status: 409 },
      );
    }
  }

  return NextResponse.json({ ok: true, data: await toClientState(user, characterId) });
}

async function confirmBible(user: AuthenticatedUserType, characterId: string, symmetry: string) {
  const resolvedSymmetry = symmetry || "asymmetric";
  const uid = getUid(user);
  const character = await getOwnedCharacter(user, characterId);
  const pipelineId = String(character?.pipelineId || "").trim();
  if (!character || !pipelineId) {
    return NextResponse.json(
      { ok: false, error: "pipeline_not_prepared", errorCode: "PIPELINE_NOT_PREPARED" },
      { status: 409 },
    );
  }
  if (!(CHARACTER_BIBLE_SYMMETRIES as readonly string[]).includes(resolvedSymmetry)) {
    return NextResponse.json(
      { ok: false, error: "character_bible_symmetry_invalid", errorCode: "CHARACTER_BIBLE_SYMMETRY_INVALID" },
      { status: 400 },
    );
  }

  await confirmSpritePipelineBible({
    uid,
    pipelineId,
    symmetry: resolvedSymmetry as CharacterBibleSymmetryType,
  });
  return NextResponse.json({ ok: true, data: await toClientState(user, characterId) });
}

async function advancePipeline(user: AuthenticatedUserType, characterId: string) {
  const uid = getUid(user);
  const character = await getOwnedCharacter(user, characterId);
  const pipelineId = String(character?.pipelineId || "").trim();
  if (!character || !pipelineId) {
    return NextResponse.json(
      { ok: false, error: "pipeline_not_prepared", errorCode: "PIPELINE_NOT_PREPARED" },
      { status: 409 },
    );
  }

  const pipeline = await getOwnedPipeline(uid, pipelineId);
  if (!pipeline) {
    return NextResponse.json(
      { ok: false, error: "pipeline_owner_mismatch", errorCode: "PIPELINE_OWNER_MISMATCH" },
      { status: 403 },
    );
  }
  const nextStep = resolveNextPipelineStep(pipeline);
  if (!nextStep) {
    return NextResponse.json(
      { ok: false, error: "pipeline_has_no_next_step", errorCode: "PIPELINE_HAS_NO_NEXT_STEP" },
      { status: 409 },
    );
  }

  const result = await runSpritePipelineStep({
    uid,
    pipelineId,
    stepKey: nextStep,
    ...(nextStep === "step2-dir" ? { direction: resolveDirectionRegenPlan(pipeline)[0] } : {}),
  });
  const resultPipeline = result.pipeline || (await getOwnedPipeline(uid, pipelineId));
  await syncUserGameCharacterPipelineStatus({
    uid,
    characterId,
    pipelineId,
    status:
      resultPipeline?.status === "verify_failed" || resultPipeline?.status === "failed"
        ? "verify_failed"
        : "generating",
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        errorCode: result.errorCode || "PIPELINE_STEP_FAILED",
        data: await toClientState(user, characterId),
      },
      { status: Number(result.status || 500) },
    );
  }

  return NextResponse.json(
    { ok: true, data: await toClientState(user, characterId) },
    { status: result.deduped ? 202 : 200 },
  );
}

async function runDirectionAction(
  user: AuthenticatedUserType,
  characterId: string,
  directionInput: string,
  mirrorConfirmed: boolean,
) {
  const uid = getUid(user);
  const character = await getOwnedCharacter(user, characterId);
  const pipelineId = String(character?.pipelineId || "").trim();
  const direction = directionInput as SpriteDirectionType;
  if (!character || !pipelineId) {
    return NextResponse.json(
      { ok: false, error: "pipeline_not_prepared", errorCode: "PIPELINE_NOT_PREPARED" },
      { status: 409 },
    );
  }
  if (!(SPRITE_DIRECTIONS as readonly string[]).includes(direction)) {
    return NextResponse.json(
      { ok: false, error: "invalid_sprite_direction", errorCode: "INVALID_SPRITE_DIRECTION" },
      { status: 400 },
    );
  }
  const pipeline = await getOwnedPipeline(uid, pipelineId);
  if (!pipeline) {
    return NextResponse.json(
      { ok: false, error: "pipeline_owner_mismatch", errorCode: "PIPELINE_OWNER_MISMATCH" },
      { status: 403 },
    );
  }
  const result = await runSpritePipelineStep({
    uid,
    pipelineId,
    stepKey: "step2-dir",
    direction,
    mirrorConfirmed,
  });
  const resultPipeline = result.pipeline || (await getOwnedPipeline(uid, pipelineId));
  await syncUserGameCharacterPipelineStatus({
    uid,
    characterId,
    pipelineId,
    status: resultPipeline?.status === "failed" ? "verify_failed" : "generating",
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        errorCode: result.errorCode || "DIRECTION_REGENERATION_FAILED",
        data: await toClientState(user, characterId),
      },
      { status: Number(result.status || 500) },
    );
  }
  return NextResponse.json(
    { ok: true, data: await toClientState(user, characterId) },
    { status: result.deduped ? 202 : 200 },
  );
}

async function confirmResult(user: AuthenticatedUserType, characterId: string) {
  const uid = getUid(user);
  const character = await getOwnedCharacter(user, characterId);
  const pipelineId = String(character?.pipelineId || "").trim();
  const pipeline = pipelineId ? await getOwnedPipeline(uid, pipelineId) : null;
  const spriteAssetId = String(pipeline?.result?.gameAssetId || "").trim();

  if (!character || !pipeline || pipeline.status !== "composed" || !spriteAssetId) {
    return NextResponse.json(
      { ok: false, error: "character_result_not_ready", errorCode: "CHARACTER_RESULT_NOT_READY" },
      { status: 409 },
    );
  }
  const spriteAsset = await getGameAssetById(spriteAssetId);
  if (!spriteAsset || String(spriteAsset.createdBy || "") !== uid) {
    return NextResponse.json(
      { ok: false, error: "character_result_forbidden", errorCode: "CHARACTER_RESULT_FORBIDDEN" },
      { status: 403 },
    );
  }

  const confirmed = await confirmUserGameCharacterResultAtomic({
    uid,
    characterId,
    pipelineId,
    spriteAssetId,
  });
  if (!confirmed) {
    return NextResponse.json(
      { ok: false, error: "character_confirm_conflict", errorCode: "CHARACTER_CONFIRM_CONFLICT" },
      { status: 409 },
    );
  }
  const confirmedAnchorAssetId = String(pipeline.anchor?.imageAssetId || character.sourceImageAssetId || "").trim();
  if (confirmedAnchorAssetId) {
    await clearUserGameCharacterFailedAnchorHistory({
      uid,
      universeId: character.universeId,
      assetId: confirmedAnchorAssetId,
    }).catch((error) => {
      logger.warn("[UserGameCharacterPipeline] failed anchor history cleanup missed:", error);
    });
  }
  return NextResponse.json({ ok: true, data: await toClientState(user, characterId) });
}

async function restartPipeline(
  user: AuthenticatedUserType,
  characterId: string,
  options: { recordFailedAnchor: boolean; abandonCharacter: boolean },
) {
  const uid = getUid(user);
  const character = await getOwnedCharacter(user, characterId);
  const pipelineId = String(character?.pipelineId || "").trim();
  const pipeline = pipelineId ? await getOwnedPipeline(uid, pipelineId) : null;

  if (!character || !pipeline) {
    return NextResponse.json(
      { ok: false, error: "character_pipeline_not_found", errorCode: "CHARACTER_PIPELINE_NOT_FOUND" },
      { status: 404 },
    );
  }
  if (pipeline.status !== "failed") {
    return NextResponse.json(
      { ok: false, error: "pipeline_not_failed", errorCode: "PIPELINE_NOT_FAILED" },
      { status: 409 },
    );
  }

  const hasFailedDirectionRegen = Object.values(pipeline.directions || {}).some(
    (direction) => direction.regen?.status === "failed",
  );
  if (hasFailedDirectionRegen) {
    const reset = await resetFailedDirectionRegensAtomic({ pipelineId, resetBy: `user:${uid}` });
    if (!reset) {
      return NextResponse.json(
        { ok: false, error: "pipeline_step_state_changed", errorCode: "PIPELINE_STEP_STATE_CHANGED" },
        { status: 409 },
      );
    }
    await syncUserGameCharacterPipelineStatus({ uid, characterId, pipelineId, status: "generating" });
    return NextResponse.json({ ok: true, data: await toClientState(user, characterId) });
  }

  // 실패 원인이 된 step(attempt 소진)만 리셋 — 소유자 본인 + failed 상태만 허용
  const failedSteps = SPRITE_PIPELINE_STEP_KEYS.filter((stepKey) => {
    const step = getPipelineStepState(pipeline, stepKey);
    return Boolean(step && step.status === "failed" && Number(step.attempt) >= 1);
  });
  if (failedSteps.length === 0) {
    return NextResponse.json(
      { ok: false, error: "pipeline_nothing_to_restart", errorCode: "PIPELINE_NOTHING_TO_RESTART" },
      { status: 409 },
    );
  }

  let latest = pipeline;
  const restartStatus = SPRITE_PIPELINE_STEP_RUNNING_STATUS[failedSteps[0]];
  for (const stepKey of failedSteps) {
    const attempt = getPipelineStepState(latest, stepKey)?.attempt ?? 0;
    const reset = await resetPipelineStepAtomic({
      pipelineId,
      stepKey,
      expectedAttempt: Math.max(1, Number(attempt)),
      pipelineStatus: restartStatus,
      reason: "user_restart_request",
      resetBy: `user:${uid}`,
    });
    if (!reset) {
      const fresh = await getGameAssetPipelineById(pipelineId);
      return NextResponse.json(
        { ok: false, error: "pipeline_step_state_changed", errorCode: "PIPELINE_STEP_STATE_CHANGED", data: fresh },
        { status: 409 },
      );
    }
    latest = reset;
  }

  await syncUserGameCharacterPipelineStatus({
    uid,
    characterId,
    pipelineId,
    status: "generating",
  });

  // 다른 기준 이미지로 이동할 때만 실패 anchor를 기록한다. 같은 이미지 재시도는 경고 이력으로 남기지 않는다.
  const anchorAssetId = String(latest.anchor?.imageAssetId || character.sourceImageAssetId || "").trim();
  if (options.recordFailedAnchor && anchorAssetId) {
    await recordUserGameCharacterFailedAnchorAtomic({ uid, characterId, assetId: anchorAssetId });
  }
  if (options.abandonCharacter) {
    await abandonUserGameCharacterAtomic({
      uid,
      characterId,
      pipelineId,
      reason: "anchor_reselected",
    });
  }

  return NextResponse.json({ ok: true, data: await toClientState(user, characterId) });
}

export const GET = withAuth(
  async (_body, user, _request, { params }: { params: Promise<RouteParams> }) => {
    try {
      const { characterId } = await params;
      const data = await toClientState(user as AuthenticatedUserType, characterId);
      if (!data) {
        return NextResponse.json(
          { ok: false, error: "character_not_found", errorCode: "CHARACTER_NOT_FOUND" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, data });
    } catch (error) {
      logger.error("[UserGameCharacterPipeline][GET] failed:", error);
      return NextResponse.json(
        { ok: false, error: "character_pipeline_get_failed", errorCode: "CHARACTER_PIPELINE_GET_FAILED" },
        { status: 500 },
      );
    }
  },
  undefined,
  "game/characters/pipeline:get",
  { bodyParser: "none" },
);

export const POST = withAuth(
  async (body, user, _request, { params }: { params: Promise<RouteParams> }) => {
    try {
      const { characterId } = await params;
      const action = normalizeString(body?.action) as PipelineAction;
      if (action === "prepare") return await preparePipeline(user as AuthenticatedUserType, characterId);
      if (action === "advance") return await advancePipeline(user as AuthenticatedUserType, characterId);
      if (action === "regenerate-direction" || action === "mirror-direction") {
        return await runDirectionAction(
          user as AuthenticatedUserType,
          characterId,
          normalizeString(body?.direction),
          action === "mirror-direction" && body?.mirrorConfirmed === true,
        );
      }
      if (action === "confirm-bible") {
        return await confirmBible(
          user as AuthenticatedUserType,
          characterId,
          normalizeString(body?.symmetry),
        );
      }
      if (action === "confirm") return await confirmResult(user as AuthenticatedUserType, characterId);
      if (action === "restart") {
        return await restartPipeline(user as AuthenticatedUserType, characterId, {
          recordFailedAnchor: body?.recordFailedAnchor === true,
          abandonCharacter: body?.abandonCharacter === true,
        });
      }
      return NextResponse.json(
        { ok: false, error: "pipeline_action_invalid", errorCode: "PIPELINE_ACTION_INVALID" },
        { status: 400 },
      );
    } catch (error) {
      const errLike = toErrorLike(error);
      logger.error("[UserGameCharacterPipeline][POST] failed:", error);
      return NextResponse.json(
        {
          ok: false,
          error: String(errLike.message || "character_pipeline_action_failed"),
          errorCode: String(errLike.errorCode || "CHARACTER_PIPELINE_ACTION_FAILED"),
        },
        { status: Number(errLike.status || 500) },
      );
    }
  },
  undefined,
  "game/characters/pipeline:action",
);
