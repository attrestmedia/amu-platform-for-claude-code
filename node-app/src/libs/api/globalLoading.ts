import { globalLoadingManager } from "store/global/globalLoadingStore";

/**
 * @docHint
 * @purpose 비네트워크 비동기 작업의 전역 로딩 등록
 * @process request ID 생성  작업 실행  성공/실패/취소 후 상태 해제
 * @domain global-loading
 * @scope client-safe
 */

export type WithGlobalLoadingOptions = {
  /** 여러 작업을 하나의 논리 단위로 묶지 않는 한 생략해 고유 ID를 사용한다. */
  requestId?: string;
};

let taskSequence = 0;

const createTaskRequestId = () => {
  taskSequence += 1;
  const randomId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : null;
  return `global-task:${Date.now()}:${taskSequence}${randomId ? `:${randomId}` : ""}`;
};

/**
 * 명시적으로 전달한 비네트워크 Promise만 전역 로딩으로 등록한다.
 * 호출부의 local loading은 제거하지 않으며, 작업 종료 방식과 관계없이 finally에서 해제한다.
 */
export async function withGlobalLoading<T>(
  task: () => T | PromiseLike<T>,
  options?: WithGlobalLoadingOptions,
): Promise<T> {
  const requestId = String(options?.requestId || "").trim() || createTaskRequestId();
  globalLoadingManager.start(requestId);

  try {
    return await task();
  } finally {
    globalLoadingManager.end(requestId);
  }
}
