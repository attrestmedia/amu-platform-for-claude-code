/**
 * @docHint
 * @purpose 카탈로그 선언만으로 확인 가능한 실행 경로를 분류한다
 * @process 모델을 찾고 비어 있지 않은 route 목록은 unknown으로 보수적으로 나타낸다
 * @domain ai
 * @scope server
 */

import { AI_MODEL_CATALOG } from "consts/ai/generated/modelCatalog.generated";
import type { AiCostMonitorExecutionRoute } from "types/ai";

export function resolveMonitorExecutionRoute(provider: string, model: string): AiCostMonitorExecutionRoute {
  const entry = AI_MODEL_CATALOG.models.find((candidate) => candidate.provider === provider && candidate.modelName === model);
  if (!entry) return "unknown";
  return entry.executionRoutes.some((route) => String(route.route) !== "direct") ? "unknown" : "direct";
}
