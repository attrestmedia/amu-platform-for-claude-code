import { create } from "zustand";

/**
 * @docHint
 * @purpose 전역 요청 로딩 상태 관리
 * @process 요청 ID 등록/해제  동시 요청 집계  전역 Preloader 구독 제공
 * @domain global-loading
 * @scope client-safe
 */

type GlobalLoadingState = {
  pendingRequestIds: ReadonlySet<string>;
  startLoading: (requestId: string) => void;
  endLoading: (requestId: string) => void;
};

const normalizeRequestId = (requestId: string) => String(requestId || "").trim();

export const useGlobalLoadingStore = create<GlobalLoadingState>((set) => ({
  pendingRequestIds: new Set<string>(),

  startLoading: (requestId) => {
    const normalizedId = normalizeRequestId(requestId);
    if (!normalizedId) return;

    set((state) => {
      if (state.pendingRequestIds.has(normalizedId)) return state;

      const nextIds = new Set(state.pendingRequestIds);
      nextIds.add(normalizedId);
      return { pendingRequestIds: nextIds };
    });
  },

  endLoading: (requestId) => {
    const normalizedId = normalizeRequestId(requestId);
    if (!normalizedId) return;

    set((state) => {
      if (!state.pendingRequestIds.has(normalizedId)) return state;

      const nextIds = new Set(state.pendingRequestIds);
      nextIds.delete(normalizedId);
      return { pendingRequestIds: nextIds };
    });
  },
}));

/**
 * fetchClient 같은 공용 모듈에서 사용할 수 있는 요청 관리자다.
 * 서버 렌더링/서버 API 라우트에서는 브라우저 상태를 만들지 않는다.
 */
export const globalLoadingManager = {
  start: (requestId: string) => {
    if (typeof window === "undefined") return;
    useGlobalLoadingStore.getState().startLoading(requestId);
  },
  end: (requestId: string) => {
    if (typeof window === "undefined") return;
    useGlobalLoadingStore.getState().endLoading(requestId);
  },
};

