import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getSystemPricingSummary } from "libs/server-utils/api/systemPricingControl";
import { previewAIUsagePricing } from "libs/services/aiUsageBilling";
import type { UnknownRecord } from "utils/common";
import type { AiProviderType, AiModalityType } from "types/ai";
import type { IFixedUsage, ITokenUsageBreakdown } from "types/payment";

export const runtime = "nodejs";

function validatePreviewBody(data: UnknownRecord) {
  if (!data || typeof data !== "object") return { valid: false, error: "요청 본문이 필요합니다." };
  if (typeof data.provider !== "string" || typeof data.modelName !== "string" || typeof data.modality !== "string") {
    return { valid: false, error: "provider, modelName, modality가 필요합니다." };
  }
  return { valid: true };
}

/**
 * @docHint
 * @purpose API 라우트(admin / system-controls / pricing) 기능 요청 처리
 * @process 인증/권한 검증  pricing catalog 요약 조회  dry-run 견적 계산  JSON 응답 반환
 * @domain system-control
 * @scope admin-api
 */
async function getHandler() {
  const summary = await getSystemPricingSummary();
  return NextResponse.json({ ok: true, summary });
}

async function postHandler(data: UnknownRecord) {
  const preview = await previewAIUsagePricing({
    provider: String(data.provider || "").trim().toLowerCase() as AiProviderType,
    modelName: String(data.modelName || "").trim(),
    modality: String(data.modality || "").trim().toLowerCase() as AiModalityType,
    variant: String(data.variant || "").trim() || undefined,
    usage: data.usage && typeof data.usage === "object" ? (data.usage as ITokenUsageBreakdown) : undefined,
    fixed: data.fixed && typeof data.fixed === "object" ? (data.fixed as IFixedUsage) : undefined,
  });
  return NextResponse.json({ ok: true, preview });
}

export const GET = withAuth(getHandler, undefined, "admin/system-controls/pricing:get", { requireAdmin: true });
export const POST = withAuth(postHandler, validatePreviewBody, "admin/system-controls/pricing:post", { requireAdmin: true });
