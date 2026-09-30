import "server-only";
import { NextResponse } from "next/server";
import { logger } from "utils/log";
import { toErrorLike } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process withApiTimeout 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain api-runtime
 * @scope global
 */

// API 핸들러를 타임아웃으로 래핑
// - timeout 발생 시 JSON 503을 반환(HTML 에러 페이지 방지) / handler는 NextResponse를 반환
function normalizeApiError(err: unknown) {
  const e = toErrorLike(err);
  const rawStatus = typeof e.status === "number" ? e.status : 0;
  const status = rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;
  const errorCode = String(e.errorCode || e.code || (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR"));
  const message = String(e.message || "서버 오류가 발생했습니다.");

  return { status, errorCode, message };
}

export async function withApiTimeout(handler: () => Promise<NextResponse>, timeoutMs = 20000): Promise<NextResponse> {
  let settled = false; // 이미 응답이 확정됐는지 여부
  let timer: ReturnType<typeof setTimeout> | null = null;

  // 타임아웃 프로미스
  const timeoutPromise = new Promise<NextResponse>((resolve) => {
    timer = setTimeout(() => {
      // 이미 다른 쪽으로 응답이 확정됐다면 아무 것도 하지 않음
      if (settled) return;

      settled = true; // 이 지점에서 응답을 확정
      logger.error(`[API TIMEOUT] ${timeoutMs}ms 경과, 503으로 응답`);
      resolve(
        NextResponse.json(
          { success: false, errorCode: "TIMEOUT", message: "서버 응답이 지연되었습니다. 잠시 후 다시 시도해주세요." },
          { status: 503 },
        ),
      );
    }, timeoutMs);
  });

  try {
    // handler가 먼저 끝나면 타이머 해제
    const handlerPromise = (async () => {
      const res = await handler();
      if (!settled) {
        settled = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      }
      return res;
    })().catch((err: unknown) => {
      // 이미 타임아웃으로 응답이 확정(settled=true)됐을 수 있으므로, 가드 처리
      if (!settled) {
        settled = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        logger.error("[API ERROR] handlerPromise 실패:", err);
        const normalized = normalizeApiError(err);
        // race에 참여하는 이상, 실패도 NextResponse로 환원
        return NextResponse.json(
          { success: false, errorCode: normalized.errorCode, message: normalized.message },
          { status: normalized.status },
        );
      }

      // 이미 응답 확정된 뒤의 늦은 reject라면, 조용히 흡수
      logger.debug?.("[API NOTE] 응답 확정 후 handler의 늦은 reject를 무시했습니다.");
      // 아무 것도 반환하지 않으면 race 쪽에 영향 없음
      return undefined as unknown as NextResponse;
    });

    const res = await Promise.race([handlerPromise, timeoutPromise]);

    // 레이스가 끝났다면 혹시 남아 있을 타이머 정리
    if (!settled) {
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    return res;
  } catch (err: unknown) {
    // 예외 시에도 타이머 정리
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    settled = true;

    logger.error("[API ERROR] withApiTimeout에서 예외 포착:", err);
    const normalized = normalizeApiError(err);
    return NextResponse.json(
      { success: false, errorCode: normalized.errorCode, message: normalized.message },
      { status: normalized.status },
    );
  }
}
