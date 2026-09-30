import crypto from "node:crypto";
import type { ImagePromptCustomType } from "types/app";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { handleUniverseImageBasic } from "libs/server-utils/api/imageBasicHandler";
import { validatePromptOrBaseImage } from "libs/server-utils/api/routeValidators";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { stableSerialize } from "utils/common/stableSerialize";

/**
 * @docHint
 * @purpose 커머스 유니버스 기본 이미지 생성 및 유니버스 코인 과금
 * @process universeId 검증  인증/권한 확인  AI 이미지 생성/저장  유니버스 코인 차감  결과 반환
 * @domain commerce
 * @scope universe
 */

export const runtime = "nodejs";

const validate = validatePromptOrBaseImage;

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
  return `commerce:basic-image:${safeOperationSegment(args.universeId, "universe")}:provider:${digest}`;
}

async function handler(data: ImagePromptCustomType, user: AuthenticatedUserType) {
  const request = data as ImagePromptCustomType & { clientRequestId?: string };
  const { clientRequestId, ...fingerprint } = request;
  const providerClientRequestId = buildProviderClientRequestId({
    universeId: String(data?.universeId || ""),
    supplied: clientRequestId,
    fingerprint,
  });
  return await handleUniverseImageBasic(data, user, {
    routeMeta: "commerce/image",
    clientRequestId: providerClientRequestId,
  });
}

export const POST = withAuth<ImagePromptCustomType>(handler, validate, "commerce/generate/basic-image", {
  checkUniversePermission: { universeIdParam: "universeId", requireEdit: true },
});
