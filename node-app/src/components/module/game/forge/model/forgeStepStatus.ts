import type { ForgeLocalizedText } from "./forgeGlossary";

/** 단계 상태. 서버 stepStatus(locked/todo/in_progress/done)와 같은 축을 쓴다. */
export type ForgeStepStatus = "locked" | "todo" | "in_progress" | "done";

/**
 * 서버 stepStatus 문자열 → UI 상태 정규화.
 * S2에서 /api/game/forge/summary와 연결한다. 연결 전까지는 기본값 'todo'를 반환한다.
 */
export function resolveForgeStepStatus(raw: string | null | undefined): ForgeStepStatus {
  if (raw === "locked" || raw === "todo" || raw === "in_progress" || raw === "done") return raw;
  return "todo";
}

export const FORGE_STEP_STATUS_LABEL: Record<ForgeStepStatus, ForgeLocalizedText> = {
  locked: { ko: "잠김", en: "Locked" },
  todo: { ko: "시작 전", en: "To do" },
  in_progress: { ko: "진행 중", en: "In progress" },
  done: { ko: "완료", en: "Done" },
};

/** 잠긴 단계에 진입했을 때 안내할 사유 문구. */
export const FORGE_STEP_LOCK_REASON: ForgeLocalizedText = {
  ko: "이전 단계를 먼저 완료해 주세요.",
  en: "Complete the previous step first.",
};

/**
 * 서버 summary.stepStatus({ step1..step5 })를 사이드바 항목 id(FORGE_STEP_ITEM_IDS 순서)에 매핑한다.
 * stepStatus가 없으면 전부 'todo'로 폴백한다.
 */
export function mapSummaryStepStatus(
  stepStatus: Record<string, string | undefined> | undefined,
  itemIds: readonly string[],
): Record<string, ForgeStepStatus> {
  const result: Record<string, ForgeStepStatus> = {};
  itemIds.forEach((itemId, index) => {
    result[itemId] = resolveForgeStepStatus(stepStatus?.[`step${index + 1}`]);
  });
  return result;
}
