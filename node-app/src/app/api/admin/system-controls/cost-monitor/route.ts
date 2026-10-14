import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { buildAiCostMonitorReport } from "libs/server-utils/ai/costMonitor/buildAiCostMonitorReport";
import { AI_COST_MONITOR_WINDOWS, type AiCostMonitorWindowPreset } from "types/ai";
import { logger } from "utils/log";

export const runtime = "nodejs";

type CostMonitorQuery = { window?: unknown };

function isWindowPreset(value: unknown): value is AiCostMonitorWindowPreset {
  return typeof value === "string" && (AI_COST_MONITOR_WINDOWS as readonly string[]).includes(value);
}

function validateQuery(data: CostMonitorQuery) {
  if (data?.window === undefined || isWindowPreset(data.window)) return { valid: true };
  return { valid: false, error: "window은 24h, 7d, 30d 중 하나여야 합니다." };
}

function getErrorCode(error: unknown) {
  if (
    error !== null
    && typeof error === "object"
    && "errorCode" in error
    && error.errorCode === "AI_COST_MONITOR_WINDOW_TOO_LARGE"
  ) {
    return "AI_COST_MONITOR_WINDOW_TOO_LARGE" as const;
  }
  return "AI_COST_MONITOR_UNAVAILABLE" as const;
}

/**
 * @docHint
 * @purpose API 라우트(admin / system-controls / cost-monitor) 기능 요청 처리
 * @process 관리자 인증  AI 비용 모니터 집계 조회  JSON 응답 반환
 * @domain ai
 * @scope admin-api
 */
async function getHandler(data: CostMonitorQuery) {
  const window = data?.window === undefined ? "24h" : data.window;

  try {
    const report = await buildAiCostMonitorReport(window);
    return NextResponse.json({ ok: true, report });
  } catch (error: unknown) {
    const errorCode = getErrorCode(error);
    logger.error("[ai-cost-monitor] report failed", { errorCode, error });
    return NextResponse.json({ ok: false, errorCode }, { status: 503 });
  }
}

export const GET = withAuth(
  getHandler,
  validateQuery,
  "admin/system-controls/cost-monitor:get",
  { requireAdmin: true },
);
