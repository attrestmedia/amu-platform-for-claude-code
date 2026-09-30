import crypto from "node:crypto";
import type { ImagePromptBodyType } from "types/app";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { handleUniverseImagePrompt } from "libs/server-utils/api/imagePromptHandler";
import { validateTemplateKey } from "libs/server-utils/api/routeValidators";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { stableSerialize } from "utils/common/stableSerialize";

/**
 * @docHint
 * @purpose 커머스 유니버스 템플릿 이미지 생성 및 유니버스 코인 과금
 * @process templateKey 조회/치환  유니버스 권한 확인  이미지 생성/저장  코인 차감  결과 반환
 * @domain commerce
 * @scope universe
 */

export const runtime = "nodejs";

const validate = validateTemplateKey;

function safeOperationSegment(value: unknown, fallback: string) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 80);
  return normalized || fallback;
}

function buildProviderClientRequestId(args: {
  universeId: string;
  supplied?: unknown;
  fingerprint: unknown;
}) {
  const supplied = String(args.supplied ?? "").trim();
  const digest = crypto
    .createHash("sha256")
    .update(supplied || stableSerialize(args.fingerprint), "utf8")
    .digest("hex")
    .slice(0, 32);
  return `commerce:template-image:${safeOperationSegment(args.universeId, "universe")}:provider:${digest}`;
}

async function handler(data: ImagePromptBodyType, user: AuthenticatedUserType) {
  const request = data as ImagePromptBodyType & { clientRequestId?: string };
  const { clientRequestId, ...fingerprint } = request;
  const providerClientRequestId = buildProviderClientRequestId({
    universeId: String(data?.universeId || ""),
    supplied: clientRequestId,
    fingerprint,
  });
  return await handleUniverseImagePrompt(data, user, { clientRequestId: providerClientRequestId });
}

export const POST = withAuth<ImagePromptBodyType>(handler, validate, "commerce/generate/template-image", {
  checkUniversePermission: { universeIdParam: "universeId", requireEdit: true },
});
