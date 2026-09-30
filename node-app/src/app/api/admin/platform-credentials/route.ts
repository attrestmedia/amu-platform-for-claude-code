import { NextResponse } from "next/server";
import {
  getPlatformCredentialDefinition,
  PLATFORM_CREDENTIAL_DEFINITIONS,
  type PlatformCredentialKey,
} from "consts/secure/platformCredentials";
import {
  activatePlatformCredential,
  auditUnavailablePlatformCredentialVerification,
  createPendingPlatformCredential,
  disableActivePlatformCredential,
  getDecryptedPlatformCredentialVersion,
  listPlatformCredentialStatuses,
  migratePendingQwenCredentialToModelStudio,
  setPlatformCredentialVerification,
} from "libs/database/secure/platformCredentials";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { invalidatePlatformCredentialCache } from "libs/server-utils/secure/platformCredentialResolver";
import { verifyPlatformCredential } from "libs/server-utils/secure/platformCredentialVerifier";
import { toUnknownRecord } from "utils/common/typeUtils";
import { QWEN_MODEL_STUDIO_MIGRATION_REASON } from "types/secure/platformCredentials";

/**
 * @docHint
 * @purpose 플랫폼 전역 자격증명 관리자 API
 * @process 관리자 인증 → 입력 검증 → pending 저장/검증/활성화/비활성화 → redacted 응답
 * @domain security
 * @scope admin-api
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function requestContext(user: Record<string, unknown>, request: Request) {
  return {
    actor: String(user.userEmail || user.email || user.uid || user.ID || "").trim(),
    actorIp: String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim(),
    requestId: String(request.headers.get("x-request-id") || "").trim(),
  };
}

function parseCredentialKey(value: unknown): PlatformCredentialKey | null {
  const key = String(value || "").trim();
  return getPlatformCredentialDefinition(key) ? (key as PlatformCredentialKey) : null;
}

function parseVersion(value: unknown) {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : null;
}

export const GET = withAuth(
  async () => {
    const statuses = await listPlatformCredentialStatuses();
    return NextResponse.json({
      success: true,
      data: {
        definitions: PLATFORM_CREDENTIAL_DEFINITIONS,
        statuses,
      },
    });
  },
  undefined,
  "admin_platform_credentials_list",
  { requireAdmin: true, bodyParser: "none" },
);

export const POST = withAuth(
  async (data, user, request) => {
    const body = toUnknownRecord(data);
    const action = String(body.action || "").trim();
    const credentialKey = parseCredentialKey(body.credentialKey);
    if (!credentialKey) {
      return NextResponse.json(
        { success: false, error: "지원하지 않는 credentialKey입니다.", errorCode: "CREDENTIAL_KEY_UNSUPPORTED" },
        { status: 400 },
      );
    }
    const context = requestContext(user, request);

    if (action === "save") {
      const result = await createPendingPlatformCredential({
        ...context,
        credentialKey,
        payload: body.payload,
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (action === "migrate") {
      if (credentialKey !== "ai.qwen.default") {
        return NextResponse.json(
          { success: false, error: "Qwen 자격증명만 이관할 수 있습니다.", errorCode: "CREDENTIAL_MIGRATION_UNSUPPORTED" },
          { status: 400 },
        );
      }
      const sourceVersion = parseVersion(body.sourceVersion);
      if (!sourceVersion || body.reasonCode !== QWEN_MODEL_STUDIO_MIGRATION_REASON) {
        return NextResponse.json(
          { success: false, error: "원본 버전과 이관 사유가 필요합니다.", errorCode: "CREDENTIAL_MIGRATION_INPUT_REQUIRED" },
          { status: 400 },
        );
      }
      const result = await migratePendingQwenCredentialToModelStudio({
        ...context,
        sourceVersion,
        reasonCode: QWEN_MODEL_STUDIO_MIGRATION_REASON,
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (action === "verify") {
      const version = parseVersion(body.version);
      if (!version) {
        return NextResponse.json(
          { success: false, error: "유효한 version이 필요합니다.", errorCode: "CREDENTIAL_VERSION_REQUIRED" },
          { status: 400 },
        );
      }
      const { payload } = await getDecryptedPlatformCredentialVersion(credentialKey, version);
      const verification = await verifyPlatformCredential(credentialKey, payload);
      if (verification.unavailable) {
        await auditUnavailablePlatformCredentialVerification({
          ...context,
          credentialKey,
          version,
          code: verification.code,
        });
        return NextResponse.json(
          {
            success: false,
            error: "이 자격증명은 조회 전용 검증을 지원하지 않습니다. 저장 상태를 unverified로 유지했습니다.",
            errorCode: verification.code,
            data: {
              credentialKey,
              version,
              verificationStatus: "unverified",
              code: verification.code,
              ...(verification.hintCode ? { hintCode: verification.hintCode } : {}),
            },
          },
          { status: 409 },
        );
      }
      await setPlatformCredentialVerification({
        ...context,
        credentialKey,
        version,
        status: verification.valid ? "valid" : "invalid",
        code: verification.code,
      });
      const verificationError =
        credentialKey === "integration.wordpress.rest"
          ? "WordPress REST 인증에 실패했습니다. 검증 대상 주소와 사용자명/Application Password를 확인해주세요."
          : "공급자 자격증명 검증에 실패했습니다. 입력값과 공급자 상태를 확인해주세요.";
      return NextResponse.json(
        {
          success: verification.valid,
          ...(!verification.valid
            ? { error: verificationError, errorCode: "CREDENTIAL_VERIFICATION_FAILED" }
            : {}),
          data: { credentialKey, version, ...verification },
        },
        { status: verification.valid ? 200 : 422 },
      );
    }

    if (action === "activate") {
      if (credentialKey === "ai.qwen.default") {
        return NextResponse.json(
          {
            success: false,
            error: "Qwen 사용자 호출 출시 게이트가 닫혀 있어 자격증명을 활성화할 수 없습니다.",
            errorCode: "QWEN_RUNTIME_NOT_READY",
          },
          { status: 409 },
        );
      }
      const version = parseVersion(body.version);
      if (!version) {
        return NextResponse.json(
          { success: false, error: "유효한 version이 필요합니다.", errorCode: "CREDENTIAL_VERSION_REQUIRED" },
          { status: 400 },
        );
      }
      const result = await activatePlatformCredential({ ...context, credentialKey, version });
      invalidatePlatformCredentialCache(credentialKey);
      return NextResponse.json({ success: true, data: { credentialKey, ...result } });
    }

    if (action === "disable") {
      const result = await disableActivePlatformCredential({ ...context, credentialKey });
      invalidatePlatformCredentialCache(credentialKey);
      return NextResponse.json({ success: true, data: { credentialKey, ...result } });
    }

    return NextResponse.json(
      { success: false, error: "지원하지 않는 action입니다.", errorCode: "CREDENTIAL_ACTION_UNSUPPORTED" },
      { status: 400 },
    );
  },
  undefined,
  "admin_platform_credentials_mutation",
  { requireAdmin: true, bodyParser: "json" },
);
