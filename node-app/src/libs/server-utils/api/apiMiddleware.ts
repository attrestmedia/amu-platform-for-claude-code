import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, checkRateLimit, getAuthUser } from "../auth/authUtils";
import { getUserFromDB, getUserRole, canEditUniverse } from "../auth/userRoleUtils";
import { USER_ROLES } from "consts/auth";
import { getUniverseById } from "libs/database/universe";
import { ensureUniverseWalletLifecycle } from "libs/server-utils/payment/universeWalletPolicyService";
import { resolveUniverseWalletPolicyState } from "utils/payment";
import { logger } from "utils/log";
import { toUnknownRecord, type UnknownRecord } from "utils/common";
import { getAccountPolicyConsentStatus } from "../auth/policyConsentService";
import { ACCOUNT_POLICY_EFFECTIVE_DATE } from "consts/legal/accountPolicy";
import type { ApiHandler, RequestValidator, NextRouteContext, AuthenticatedUserType } from "./_helpers";
import {
  resolveNextContext,
  isSameGuestId,
  applyAiRequestGuards,
  parseRequestData,
  jsonWithRateLimit,
  nextWithRateLimit,
  rateLimitExceededResponse,
  resolvePermissionId,
  mergeAuthAndDbUser,
  buildErrorResponse,
  type RateLimitResultLike,
  type ParsedRequestData,
} from "./_helpers";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process withAuth 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain api-middleware
 * @scope global
 */

type RespondFn = (body: unknown, init: ResponseInit | undefined) => NextResponse;

// Mongoose document처럼 .toObject()를 가진 객체를 안전하게 평탄화
function flattenMongooseDoc(value: unknown) {
  const obj = toUnknownRecord(value);
  if (typeof obj.toObject === "function") {
    try {
      return (obj.toObject as () => unknown)();
    } catch {
      return value;
    }
  }
  return value;
}

// 권한 검증
// 제네릭 기본은 핸들러 시그니처와 호환을 위해 any를 유지 (handler가 자체 타입을 선언)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withAuth<T = any, R = any>(
  handler: ApiHandler<T, R>,
  validator?: RequestValidator<T>,
  endpoint: string = "default",
  options?: {
    requireAdmin?: boolean;
    checkUniversePermission?: {
      universeIdParam: string;
      requireEdit?: boolean;
    };
    bodyParser?: "auto" | "json" | "none";
    allowStalePolicyConsent?: boolean;
  },
) {
  return async function (request: NextRequest, context: NextRouteContext): Promise<NextResponse> {
    const ctx = await resolveNextContext(context);
    let rateLimitResult: RateLimitResultLike | null = null;

    try {
      // 1) 토큰 유효성 재검증
      const auth = await getAuthUser(request);
      if (!auth.verified) {
        return NextResponse.json({ error: auth.error }, { status: 401 });
      }
      const userId = auth.user.ID;

      // 2) MongoDB에서 계정 정보 병합
      const userFromDB = await getUserFromDB(userId);
      const dbObj = flattenMongooseDoc(userFromDB);

      const mergedUserData = mergeAuthAndDbUser(auth.user, dbObj || null);
      if (["deletion_pending", "deleted"].includes(String(toUnknownRecord(mergedUserData).accountStatus || ""))) {
        return NextResponse.json(
          { error: "탈퇴 처리 중이거나 탈퇴가 완료된 계정입니다.", errorCode: "ACCOUNT_DELETION_PENDING" },
          { status: 403 },
        );
      }

      if (!options?.allowStalePolicyConsent && Date.now() >= new Date(ACCOUNT_POLICY_EFFECTIVE_DATE).getTime()) {
        const mergedRecord = toUnknownRecord(mergedUserData);
        const consentStatus = await getAccountPolicyConsentStatus({
          uid: String(mergedRecord.uid || mergedRecord.ID || userId),
          email: String(mergedRecord.userEmail || mergedRecord.user_email || ""),
          knownConsents: Array.isArray(mergedRecord.policyConsents)
            ? (mergedRecord.policyConsents as never[])
            : undefined,
        });
        if (consentStatus.required && consentStatus.enforcementActive) {
          return NextResponse.json(
            {
              error: "개정 약관과 개인정보처리방침에 동의한 뒤 회원 기능을 이용할 수 있습니다.",
              errorCode: "POLICY_RECONSENT_REQUIRED",
              policy: consentStatus,
            },
            { status: 428 },
          );
        }
      }

      // 3) 요청 속도 제한 확인
      rateLimitResult = await checkRateLimit(userId, endpoint, mergedUserData);
      if (!rateLimitResult.allowed) {
        return rateLimitExceededResponse(rateLimitResult);
      }

      // (여기부터는 rateLimit 통과 -> 모든 응답에 헤더 부착)
      const respond: RespondFn = (body, init) => jsonWithRateLimit(body, init, rateLimitResult);
      const respondNext = (res: NextResponse) => nextWithRateLimit(res, rateLimitResult);

      // 4) 어드민 권한 체크 (옵션)
      if (options?.requireAdmin) {
        const userRoles = getUserRole(mergedUserData);
        const isAdmin = userRoles.includes(USER_ROLES.ADMINISTRATOR);

        if (!isAdmin) {
          logger.warn("어드민 API 접근 시도 - 권한 부족", {
            userId,
            userRoles,
            endpoint,
            ip: request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown",
          });

          return respond({ error: "관리자 권한이 필요합니다" }, { status: 403 });
        }
      }

      // 5) 요청 데이터 파싱
      const bodyParser = options?.bodyParser ?? "auto";
      const data = await parseRequestData(request, bodyParser);

      // 6) 유니버스별 권한 체크 (requireEdit)
      if (options?.checkUniversePermission?.requireEdit) {
        const permissionKey = options.checkUniversePermission.universeIdParam;
        const resolved = resolvePermissionId(request, ctx, permissionKey, data);

        if (resolved.mismatch) {
          return respond(
            { error: `${permissionKey}가 서로 다릅니다.`, errorCode: "ROUTE_UNIVERSE_MISMATCH" },
            { status: 400 },
          );
        }

        const permissionUniverseId = resolved.id;
        if (!permissionUniverseId) {
          return respond(
            { error: `${permissionKey}가 필요합니다.`, errorCode: "UNIVERSE_ID_REQUIRED" },
            { status: 400 },
          );
        }

        const universe = await getUniverseById(permissionUniverseId);
        if (!universe) return respond({ error: "유니버스를 찾을 수 없습니다." }, { status: 404 });

        if (!canEditUniverse(mergedUserData, universe)) {
          return respond({ error: "해당 유니버스에 대한 편집 권한이 없습니다." }, { status: 403 });
        }
      }

      // 7) 커스텀 요청 검증
      if (validator) {
        const validationResult = validator(data as T);
        if (!validationResult.valid) {
          return respond({ error: validationResult.error || "유효하지 않은 요청 형식입니다." }, { status: 400 });
        }
      }

      // 8) AI/Tutors 토큰/모델 방어
      const guardRes = await applyAiRequestGuards({
        endpoint,
        data: toUnknownRecord(data),
        respond,
        actorUser: mergedUserData,
      });
      if (guardRes) return guardRes;

      // 9) 실제 API 핸들러 실행
      const result = await handler(data as T, mergedUserData, request, ctx);

      // 10) 결과 반환
      if (result instanceof NextResponse) return respondNext(result);
      return respond(result, undefined);
    } catch (error: unknown) {
      return buildErrorResponse({ endpoint, error, rateLimitResult });
    }
  };
}

// 요청 데이터 검증
export const validateApiRequest = (data: UnknownRecord) => {
  if (!data.message || typeof data.message !== "string") {
    return { valid: false, error: "유효하지 않은 메시지 형식입니다." };
  }
  return { valid: true };
};

// 게스트 또는 로그인 허용
// 제네릭 기본은 핸들러 시그니처와 호환을 위해 any를 유지 (handler가 자체 타입을 선언)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withGuestOrAuth<T = any, R = any>(
  handler: ApiHandler<T, R>,
  validator?: RequestValidator<T>,
  endpoint: string = "commerce/default",
  options?: {
    bodyParser?: "auto" | "json" | "none";
    allowGuest?: boolean;
  },
) {
  return async function (request: NextRequest, context: NextRouteContext): Promise<NextResponse> {
    const ctx = await resolveNextContext(context);

    let rateLimitResult: RateLimitResultLike | null = null;
    let guestId: string | null = null;

    const attachGuestHeader = (res: NextResponse) => {
      if (guestId) res.headers.set("x-guest-id", guestId);
      return res;
    };

    try {
      // 1) 우선 로그인 토큰 검증 시도
      const allowGuest = options?.allowGuest !== false;
      const authResult = await verifyAuthToken(request);
      let mergedUserData: AuthenticatedUserType | null = null;

      if (authResult.verified) {
        const userFromDB = await getUserFromDB(authResult.user.ID);
        const dbObj = flattenMongooseDoc(userFromDB);

        mergedUserData = mergeAuthAndDbUser(authResult.user, dbObj || null);
        if (["deletion_pending", "deleted"].includes(String(toUnknownRecord(mergedUserData).accountStatus || ""))) {
          return NextResponse.json(
            { error: "탈퇴 처리 중이거나 탈퇴가 완료된 계정입니다.", errorCode: "ACCOUNT_DELETION_PENDING" },
            { status: 403 },
          );
        }
      } else {
        if (!allowGuest) {
          return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
        }

        // 2) 게스트 허용: x-guest-id 확인
        const raw = (request.headers.get("x-guest-id") || "").trim();
        if (!raw) {
          return NextResponse.json({ error: "guestId가 필요합니다." }, { status: 401 });
        }

        // 서버에서는 guestId 생성/저장 로직 불필요, 헤더 값 검증만 수행
        const normalized = raw;
        const okLen = normalized.length >= 6 && normalized.length <= 128;
        const okChars = /^[a-z0-9_-]+$/i.test(normalized);
        if (!okLen || !okChars) {
          return NextResponse.json({ error: "guestId가 없거나 형식이 올바르지 않습니다." }, { status: 401 });
        }

        guestId = normalized;

        mergedUserData = {
          ID: `guest:${guestId}`,
          uid: `guest:${guestId}`,
          userEmail: "",
          userEmailLower: "",
          roles: ["subscriber"],
          accountType: "free",
          userInfo: { language: "ko" },
        } as AuthenticatedUserType;
      }

      // 3) 속도 제한
      const userKey = String(mergedUserData?.ID || guestId!);
      rateLimitResult = await checkRateLimit(userKey, endpoint, mergedUserData);
      if (!rateLimitResult.allowed) {
        return attachGuestHeader(rateLimitExceededResponse(rateLimitResult));
      }

      const respond: RespondFn = (body, init) =>
        attachGuestHeader(jsonWithRateLimit(body, init, rateLimitResult));
      const respondNext = (res: NextResponse) => attachGuestHeader(nextWithRateLimit(res, rateLimitResult));

      // 4) 데이터 파싱
      const isBodyMethod = request.method !== "GET" && request.method !== "HEAD";
      const bodyParser = options?.bodyParser ?? "auto";
      let data: ParsedRequestData = {};

      if (isBodyMethod) {
        if (request.method === "DELETE") data = {};
        else data = await parseRequestData(request, bodyParser);
      }

      // 게스트 모드면 body.guestId 위조/불일치 차단 + 서버 권위로 정정
      if (!authResult.verified && guestId) {
        const dataRecord = Array.isArray(data) ? (data as unknown as UnknownRecord) : data;
        const bodyGuestId = typeof dataRecord.guestId === "string" ? dataRecord.guestId.trim() : "";
        if (bodyGuestId && !isSameGuestId(bodyGuestId, guestId)) {
          return respond({ error: "guestId가 서로 다릅니다.", errorCode: "GUEST_ID_MISMATCH" }, { status: 400 });
        }
        dataRecord.guestId = guestId;
      }

      // 5) 커스텀 요청 검증
      if (validator) {
        const validationResult = validator(data as T);
        if (!validationResult.valid) {
          return respond({ error: validationResult.error || "유효하지 않은 요청 형식입니다." }, { status: 400 });
        }
      }

      // 6) commerce 엔드포인트 universeId 검증 + commerce 타입 강제
      const isCommerceEndpoint = endpoint.startsWith("commerce/");
      if (isCommerceEndpoint) {
        const resolved = resolvePermissionId(request, ctx, "universeId", data);

        if (resolved.mismatch) {
          return respond(
            { error: "universeId가 서로 다릅니다.", errorCode: "ROUTE_UNIVERSE_MISMATCH" },
            { status: 400 },
          );
        }

        const uid = resolved.id;
        if (!uid) {
          return respond({ error: "universeId가 필요합니다.", errorCode: "UNIVERSE_ID_REQUIRED" }, { status: 400 });
        }

        // 비용/DoS 방지: guard 먼저
        const guardRes = await applyAiRequestGuards({
          endpoint,
          data: toUnknownRecord(data),
          respond,
          actorUser: mergedUserData,
        });
        if (guardRes) return guardRes;

        // 그 다음 DB 검증
        const uni = await getUniverseById(uid);
        if (!uni)
          return respond({ error: "유니버스를 찾을 수 없습니다.", errorCode: "UNIVERSE_NOT_FOUND" }, { status: 404 });

        const uniRecord = toUnknownRecord(uni);
        if (uniRecord.type !== "commerce") {
          return respond({ error: "커머스 유니버스가 아닙니다.", errorCode: "NOT_COMMERCE_UNIVERSE" }, { status: 400 });
        }

        const lifecycleUniverse = await ensureUniverseWalletLifecycle(uid);
        const walletPolicy = resolveUniverseWalletPolicyState(lifecycleUniverse?.wallet);
        if (!walletPolicy.publicAllowed) {
          return respond(
            {
              error: walletPolicy.message,
              errorCode: "UNIVERSE_WALLET_SUSPENDED",
              accessState: walletPolicy.accessState,
            },
            { status: 423 },
          );
        }

        // 재조회 중복 회피용 힌트
        mergedUserData.__resolvedUniverseId = uid;
        mergedUserData.__resolvedUniverseType = String(uniRecord.type || "")
          .trim()
          .toLowerCase();
      } else {
        // commerce가 아니어도 ai/tutors에서 withGuestOrAuth를 쓸 수 있으므로 guard는 호출
        const guardRes = await applyAiRequestGuards({
          endpoint,
          data: toUnknownRecord(data),
          respond,
          actorUser: mergedUserData,
        });
        if (guardRes) return guardRes;
      }

      // 7) 실제 핸들러 실행
      const result = await handler(data as T, mergedUserData, request, ctx);

      if (result instanceof NextResponse) return respondNext(result);
      return respond(result, undefined);
    } catch (error: unknown) {
      return buildErrorResponse({ endpoint, error, rateLimitResult, guestId });
    }
  };
}
