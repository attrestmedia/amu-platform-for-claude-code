import { NextRequest, NextResponse } from "next/server";
import { getUniverses, upsertUniverse } from "libs/database/universe";
import type { UniverseWriteData } from "libs/database/universe";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { logger } from "utils/log";
import { redisCache } from "libs/cache/redisCacheService";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import { toErrorLike, toUnknownRecord } from "utils/common";
import { resolveUniverseResponseViewer, sanitizeUniverseForViewer } from "libs/server-utils/universe/universeResponsePolicy";

type UniverseListItem = Awaited<ReturnType<typeof getUniverses>>[number];

/**
 * @docHint
 * @purpose API 라우트(universe) 기능 요청 처리
 * @process GET 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain universe
 * @scope global
 */

// 유니버스 목록 조회
export async function GET(request: NextRequest) {
  return withApiTimeout(async () => {
    try {
      const { searchParams } = new URL(request.url);
      const enabledOnly = searchParams.get("enabled") === "true";
      const sortByOrder = searchParams.get("sort") !== "false";
      const forHome = searchParams.get("for") === "home";

      logger.log("[유니버스 API] 요청 파라미터:", { enabledOnly, sortByOrder, forHome });

      const cacheKey = CacheKeyManager.universe.listKey({ enabledOnly, sortByOrder, forHome });
      const cached = await redisCache.get<UniverseListItem[]>(cacheKey);
      const universes = cached || (await getUniverses({ enabledOnly, sortByOrder }));
      const result = forHome ? universes.filter((u) => !toUnknownRecord(u).hideDisplay) : universes;
      if (!cached) await redisCache.setWithTags(cacheKey, result, 60 * 2, [CacheKeyManager.universe.tagList()]);
      const viewer = await resolveUniverseResponseViewer(request);
      const responseData = result.map((universe) => sanitizeUniverseForViewer(universe, viewer));

      return NextResponse.json({
        success: true,
        data: responseData,
        totalCount: responseData.length,
      });
    } catch (error) {
      logger.error("유니버스 목록 조회 오류:", error);
      return NextResponse.json(
        {
          success: false,
          message: "유니버스 목록을 가져오는 중 오류가 발생했습니다.",
        },
        { status: 500 },
      );
    }
  }, 15000);
}

// 유니버스 생성/업데이트 (관리자 전용)
function validateUniverseDescription(description: unknown): boolean {
  const record = toUnknownRecord(description);
  return (
    typeof record.ko === "string" &&
    typeof record.en === "string" &&
    record.ko.trim() !== "" &&
    record.en.trim() !== ""
  );
}

function normalizeShowroomDateTime(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return undefined;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export const POST = withAuth(
  async (data, user) => {
    return withApiTimeout(async () => {
      try {
        const universeData: UniverseWriteData = data;

        logger.log("서버에서 받은 데이터:", JSON.stringify(universeData, null, 2));

        // 검증
        if (!universeData.id || typeof universeData.id !== "string" || universeData.id.trim() === "") {
          return NextResponse.json({ success: false, message: "유효한 유니버스 ID가 필요합니다." }, { status: 400 });
        }

        if (!universeData.name || typeof universeData.name !== "string" || universeData.name.trim() === "") {
          return NextResponse.json({ success: false, message: "유효한 유니버스 이름이 필요합니다." }, { status: 400 });
        }

        if (!universeData.type || typeof universeData.type !== "string" || universeData.type.trim() === "") {
          return NextResponse.json({ success: false, message: "유효한 유니버스 타입이 필요합니다." }, { status: 400 });
        }

        if (!validateUniverseDescription(universeData.description)) {
          return NextResponse.json(
            {
              success: false,
              message: "유효한 유니버스 설명이 필요합니다. (한국어, 영어 모두 필수)",
            },
            { status: 400 },
          );
        }

        const writableUniverseData = universeData as Record<string, unknown>;
        if (writableUniverseData.order === "" || writableUniverseData.order === null) {
          delete writableUniverseData.order;
        } else if (writableUniverseData.order !== undefined) {
          const order = Number(writableUniverseData.order);
          if (!Number.isFinite(order) || order < 0 || !Number.isInteger(order)) {
            return NextResponse.json(
              { success: false, message: "정렬 순서는 0 이상의 정수여야 합니다." },
              { status: 400 },
            );
          }
          universeData.order = order;
        }

        // hideFromHome 타입 보정
        if ("hideDisplay" in universeData) {
          writableUniverseData.hideDisplay = Boolean(writableUniverseData.hideDisplay);
        }

        const typeSpecific = toUnknownRecord(writableUniverseData.typeSpecific);
        const rawShowroom = typeSpecific.showroom;
        if (rawShowroom !== undefined) {
          if (!rawShowroom || typeof rawShowroom !== "object" || Array.isArray(rawShowroom)) {
            return NextResponse.json(
              { success: false, message: "showroom 설정은 객체 형식이어야 합니다." },
              { status: 400 },
            );
          }

          const showroomRecord = toUnknownRecord(rawShowroom);
          const opensAt = normalizeShowroomDateTime(showroomRecord.opensAt);
          const closesAt = normalizeShowroomDateTime(showroomRecord.closesAt);

          if (showroomRecord.opensAt && !opensAt) {
            return NextResponse.json({ success: false, message: "showroom 시작 시각 형식이 올바르지 않습니다." }, { status: 400 });
          }

          if (showroomRecord.closesAt && !closesAt) {
            return NextResponse.json({ success: false, message: "showroom 종료 시각 형식이 올바르지 않습니다." }, { status: 400 });
          }

          if (opensAt && closesAt && new Date(opensAt).getTime() > new Date(closesAt).getTime()) {
            return NextResponse.json(
              { success: false, message: "showroom 종료 시각은 시작 시각보다 늦어야 합니다." },
              { status: 400 },
            );
          }

          if (universeData.type !== "commerce") {
            delete typeSpecific.showroom;
            writableUniverseData.typeSpecific = typeSpecific;
          } else {
            writableUniverseData.typeSpecific = {
              ...typeSpecific,
              showroom: {
                enabled: showroomRecord.enabled === true,
                opensAt,
                closesAt,
              },
            };
          }
        }

        // 페르소나 생성 제한 검증
        // personaLimits 검증
        if (universeData.personaLimits) {
          const { maxTotal, dailyCreateLimit } = universeData.personaLimits as { maxTotal?: unknown; dailyCreateLimit?: unknown };

          if (
            maxTotal != null &&
            (typeof maxTotal !== "number" || !Number.isFinite(maxTotal) || maxTotal < 0 || !Number.isInteger(maxTotal))
          ) {
            return NextResponse.json(
              { success: false, message: "personaLimits.maxTotal은 0 이상의 정수여야 합니다." },
              { status: 400 },
            );
          }

          if (
            dailyCreateLimit != null &&
            (typeof dailyCreateLimit !== "number" ||
              !Number.isFinite(dailyCreateLimit) ||
              dailyCreateLimit < 0 ||
              !Number.isInteger(dailyCreateLimit))
          ) {
            return NextResponse.json(
              { success: false, message: "personaLimits.dailyCreateLimit은 0 이상의 정수여야 합니다." },
              { status: 400 },
            );
          }
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (universeData.type === "commerce") {
          universeData.billingOwnerEmail = String(
            universeData.billingOwnerEmail || universeData.commerceAdmins?.[0] || "",
          ).trim().toLowerCase();
          if (!emailRegex.test(universeData.billingOwnerEmail)) {
            return NextResponse.json(
              { success: false, message: "commerce 유니버스에는 유효한 billingOwnerEmail이 필요합니다." },
              { status: 400 },
            );
          }
        } else {
          universeData.billingOwnerEmail = undefined;
        }

        // commerceAdmins 검증
        if (universeData.commerceAdmins !== undefined) {
          // 배열이 아니면 에러
          if (!Array.isArray(universeData.commerceAdmins)) {
            return NextResponse.json(
              { success: false, message: "commerceAdmins는 배열 형식이어야 합니다." },
              { status: 400 },
            );
          }

          // 빈 문자열 제거 및 트림
          universeData.commerceAdmins = universeData.commerceAdmins
            .map((email) => (typeof email === "string" ? email.trim() : ""))
            .filter((email) => email.length > 0);

          // 타입 체크: commerce가 아닌데 commerceAdmins가 있으면 경고
          if (universeData.type !== "commerce" && universeData.commerceAdmins.length > 0) {
            logger.warn(`타입 ${universeData.type}에 commerceAdmins가 설정되어 있습니다. 제거합니다.`);
            universeData.commerceAdmins = [];
          }

          // 이메일 형식 검증 (commerce 타입일 때만)
          if (universeData.type === "commerce" && universeData.commerceAdmins.length > 0) {
            const invalidEmails = universeData.commerceAdmins.filter((email) => !emailRegex.test(email));

            if (invalidEmails.length > 0) {
              return NextResponse.json(
                {
                  success: false,
                  message: `유효하지 않은 이메일 형식: ${invalidEmails.join(", ")}`,
                },
                { status: 400 },
              );
            }
            universeData.commerceAdmins = universeData.commerceAdmins.filter(
              (email) => email.toLowerCase() !== universeData.billingOwnerEmail,
            );
          }
        }

        logger.log("upsertUniverse 호출 전 데이터:", universeData);
        const universe = await upsertUniverse(universeData);

        // 캐시 무효화
        try {
          await redisCache.invalidateByTag(CacheKeyManager.universe.tagList());
          await redisCache.invalidateByTag(CacheKeyManager.universe.tag(universeData.id));
          await redisCache.invalidateByTag(CacheKeyManager.universe.tagDetails(universeData.id));
        } catch (e) {
          logger.warn("캐시 무효화 경고:", e);
        }

        logger.info("유니버스 생성/업데이트 성공", {
          userId: user.ID,
          universeId: universeData.id,
          universeName: universeData.name,
          universeType: universeData.type,
        });

        return NextResponse.json({
          success: true,
          data: universe,
        });
      } catch (error) {
        logger.error("유니버스 생성/업데이트 오류:", error);
        const errLike = toErrorLike(error);
        const errorMessage = typeof errLike.message === "string" ? errLike.message : "";
        const errorUnderscoreMessage =
          typeof (errLike as { _message?: unknown })._message === "string"
            ? String((errLike as { _message?: unknown })._message)
            : "";
        const isMongooseValidation =
          errLike.name === "ValidationError" || /Validation failed/i.test(errorUnderscoreMessage || errorMessage);
        const message = isMongooseValidation
          ? errorMessage || errorUnderscoreMessage || "유니버스 데이터 처리 중 오류가 발생했습니다."
          : "유니버스 데이터 처리 중 오류가 발생했습니다.";
        return NextResponse.json({ success: false, message }, { status: isMongooseValidation ? 400 : 500 });
      }
    }, 20000);
  },
  (data) => {
    if (!data || typeof data !== "object") {
      return { valid: false, error: "유효하지 않은 요청 데이터입니다." };
    }
    return { valid: true };
  }, // 유니버스 데이터 전용 validator
  "universe_create", // endpoint => 로깅, 모니터링, 속도 제한을 위한 식별자
  { requireAdmin: true }, // 어드민 권한 필요
);
