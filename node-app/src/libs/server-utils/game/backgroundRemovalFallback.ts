import "server-only";
import crypto from "crypto";
import {
  getBackgroundRemovalProviderOrder,
  removeBackground,
  type BackgroundRemovalProviderType,
} from "libs/services/backgroundRemoval/removeBackground";
import { billAIUsageOrThrow, refundAIUsageOrThrow } from "libs/services/aiUsageBilling";
import { SPRITE_ALPHA_QUALITY_POLICY } from "libs/server-utils/game/chromaKeyQualityService";
import { logger } from "utils/log";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose AI 배경 제거 fallback + 코인 과금 서비스 — spriteSheetPostProcess에서 CK-200 분할, CK-204 멱등 보강
 * @domain game.asset-pipeline.chroma-key
 * @scope server-only
 */

// ---------------------------------------------------------------------------
// CK-204: 결정적 fallback request ID → 동일 source/options 과금 1회 보장
// ---------------------------------------------------------------------------

/** source SHA + uid + engineVersion → 결정적 fallback operation ID */
export function buildFallbackOperationId(params: {
  uid: string;
  sourceSha256: string;
  engineVersion?: string;
}): string {
  const { uid, sourceSha256, engineVersion = "v2.0.0" } = params;
  const payload = `${uid}|${sourceSha256}|${engineVersion}|fallback`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export type RemoveBackgroundBilledInputType = {
  uid: string;
  buffer: Buffer;
  mimeType: string;
  /** CK-204: 결정적 fallback operation ID (buildFallbackOperationId) */
  operationId?: string;
  /** CK-204: source SHA-256 (추적용) */
  sourceSha256?: string;
};

export async function removeBackgroundBilled(
  args: RemoveBackgroundBilledInputType,
): Promise<{ buffer: Buffer; coins: number; provider: BackgroundRemovalProviderType }> {
  const { uid, buffer, mimeType, sourceSha256 } = args;
  const operationId = args.operationId || buildFallbackOperationId({
    uid,
    sourceSha256: sourceSha256 || crypto.createHash("sha256").update(buffer).digest("hex"),
  });
  const providerOrder = getBackgroundRemovalProviderOrder();
  const billingProvider = providerOrder[0];

  // 선차감 (라우트와 동일 계약: ai_lab_remove_bg fixed 과금, 실패 시 환불)
  // CK-204: operationId는 결정적 — 동일 source/uid/engineVersion이면 동일 requestId
  const billRes = await billAIUsageOrThrow({
    uid,
    app: "ai_lab_remove_bg",
    provider: billingProvider,
    modelName: "remove-bg",
    modality: "image",
    fixed: { images: 1 },
    meta: {
      kind: "charge",
      requestId: operationId,
      endpoint: "game/assets/pipeline:step3-removebg",
      route: "game/assets/pipeline:step3-removebg",
      images: 1,
      providerOrder,
      ...(sourceSha256 ? { sourceSha256 } : {}),
    },
  });
  const coins = Number(toUnknownRecord(billRes).coins || 0) || 0;

  try {
    const file = new File([new Uint8Array(buffer)], `sprite-sheet-${operationId.slice(0, 12)}.png`, { type: mimeType || "image/png" });
    const out = await removeBackground({
      file,
      options: { format: "png" },
      timeoutMs: SPRITE_ALPHA_QUALITY_POLICY.removeBgTimeoutMs,
    });
    return { buffer: Buffer.from(out.buffer), coins, provider: out.provider };
  } catch (error) {
    if (coins > 0) {
      await refundAIUsageOrThrow({
        uid,
        app: "ai_lab_remove_bg",
        provider: billingProvider,
        modelName: "remove-bg",
        modality: "image",
        fixed: { images: 1 },
        coins,
        meta: { kind: "refund", requestId: operationId, endpoint: "game/assets/pipeline:step3-removebg" },
      }).catch((refundErr: unknown) => logger.error("[SpritePipeline][step3] refund failed:", refundErr));
    }
    throw error;
  }
}
