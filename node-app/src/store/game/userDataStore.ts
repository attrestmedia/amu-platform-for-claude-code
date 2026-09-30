"use client";

import { create } from "zustand";
import fetchClient from "libs/api/fetchClient";
import { updateUser } from "libs/api/user";
import { getUser } from "libs/api/user";
import type { IPersonaItem, PersonaMoodType } from "types/ai";
import type { IUpdateUserData, IUserInfo } from "types/user";
import type { IExtendedNpcData } from "types/game";
import { INTIMACY_LEVEL_MAP, GAME_CONSTANTS as GC } from "consts/game";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain game
 * @scope client
 */

// universe:type:personaId
type PendingKey = `${string}:${"personas" | "userPersonas"}:${string}`;
type PersonaPatch = {
  set?: Partial<IPersonaItem>;
  inc?: Record<string, number>;
};
type PersonaPatchOptions = { silent?: boolean };

// persona별 serialize(순서 보장)
const personaPatchQueues = new Map<PendingKey, Promise<unknown>>();
const enqueuePersonaPatch = <T>(key: PendingKey, task: () => Promise<T>): Promise<T> => {
  const prev = personaPatchQueues.get(key) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined) // 이전 실패가 큐를 깨지 않게
    .then(task);
  personaPatchQueues.set(
    key,
    next.finally(() => {
      if (personaPatchQueues.get(key) === next) personaPatchQueues.delete(key);
    }),
  );
  return next;
};

const clampNum = (v: unknown, min: number, max: number) => Math.max(min, Math.min(max, Number(v)));

interface CacheData<T> {
  data: T;
  timestamp: number;
  ttl?: number; // TTL을 데이터별로 설정 가능하도록
}

interface UserDataState {
  // 중복 요청 방지용
  pendingRequests: Map<string, Promise<IPersonaItem[]>>;

  userData: IUpdateUserData | null;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  lastFetched: number | null;
  cacheTime: number; // 캐시 유효 시간 (ms)
  personasCache: Map<string, CacheData<IPersonaItem[]>>;
  userPersonasCache: Map<string, CacheData<IPersonaItem[]>>;

  // 세션 중 보류중인 업데이트
  pendingPersonaPatches: Map<PendingKey, Partial<IPersonaItem>>;
  setPendingPersonaMood: (
    universe: string,
    personaId: string,
    mood: PersonaMoodType,
    type?: "personas" | "userPersonas",
  ) => void;
  flushPendingPersonaPatches: () => Promise<void>;

  // **API 액션**
  fetchUserData: (uid: string) => Promise<IUpdateUserData | null>;
  updateUserData: (data: Partial<IUpdateUserData>) => Promise<IUpdateUserData | null>;
  updatePersona: (params: UpdatePersonaParams) => Promise<IUpdateUserData | null>;
  updateLastAccessedUniverse: (universe: string) => Promise<IUpdateUserData | null>;
  refetchUserData: (uid: string) => Promise<IUpdateUserData | null>;
  updateUserInfo: (userInfo: IUserInfo) => Promise<IUpdateUserData | null>;
  updateSelectedPersona: (universe: string, personaId: string) => Promise<IUpdateUserData | null>;
  fetchPersonasData: (universe: string, type: "personas" | "userPersonas") => Promise<IPersonaItem[]>;
  getCachedPersonasData: (universe: string, type: "personas" | "userPersonas") => IPersonaItem[] | null;

  // **헬퍼 함수**
  isCacheValid: () => boolean;
  clearCache: (deep?: boolean) => void;
  // 캐릭터 사용가능 여부 체크
  checkCharacterAvailable: (universe: string, characterId: string) => Promise<boolean>;
  // 페르소나 데이터 가져오기
  getPersonaData: (
    universe: string,
    personaId: string,
    type?: "personas" | "userPersonas",
  ) => Promise<IPersonaItem | null>;

  // 캐릭터가 어느 타입에 속하는지 확인하기
  getPersonaType: (universe: string, personaId: string) => Promise<"personas" | "userPersonas" | null>;

  // 특정 유니버스의 모든 페르소나 수 반환
  getTotalPersonaCount: (universe: string) => Promise<number>;

  // 특정 유니버스에서 잠금 해제된 페르소나 수 반환
  getUnlockedPersonaCount: (universe: string) => Promise<number>;

  // userPersonas, personas 데이터에 특정 npc가 존재하는지 확인
  checkPersonaExists: (
    universe: string,
    personaId: string,
  ) => Promise<{ exists: boolean; location: "personas" | "userPersonas" | null }>;

  initializeUserPersonas: (universe: string, availablePersonas: IExtendedNpcData[]) => Promise<IUpdateUserData | null>; // userPersonas 초기화
  addPersonaFromNPC: (universe: string, npcData: IExtendedNpcData) => Promise<IUpdateUserData | null>; // 처음 만난 NPC를 personas에 추가

  // **능력치 업데이트 함수들**

  // 대화 상호작용 업데이트 (totalInteractions, lastInteraction)
  updatePersonaInteraction: (
    universe: string,
    personaId: string,
    type?: "personas" | "userPersonas",
    opts?: PersonaPatchOptions,
  ) => Promise<IPersonaItem | null>;

  // 친밀도 업데이트
  updatePersonaIntimacy: (
    universe: string,
    personaId: string,
    increment: number,
    type?: "personas" | "userPersonas",
    isAbsoluteValue?: boolean,
    opts?: PersonaPatchOptions,
  ) => Promise<IPersonaItem | null>;

  // 일반 능력치 업데이트
  updatePersonaStats: (
    universe: string,
    personaId: string,
    updates: Partial<IPersonaItem>,
    type?: "personas" | "userPersonas",
    opts?: PersonaPatchOptions & { inc?: Record<string, number> },
  ) => Promise<IPersonaItem | null>;

  // personas에서 userPersonas로 이동
  movePersonaToUserPersonas: (universe: string, personaId: string) => Promise<IUpdateUserData | null>;

  // 일괄 조회를 위한 헬퍼 함수
  batchCheckCharacterAvailable: (universe: string, characterIds: string[]) => Promise<Record<string, boolean>>;
}

interface UpdatePersonaParams {
  universe: string;
  personaData: IPersonaItem;
  type: "personas" | "userPersonas";
}

const CACHE_TTL = 5 * 60 * 1000; // 5분
const EVT_PERSONA_CHANGED = "personaDataChanged" as const;
const userFetchInFlight = new Map<string, Promise<IUpdateUserData | null>>();

// undefined 제거 헬퍼
const omitUndefined = <T extends Record<string, unknown>>(obj: T): T => {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
  return Object.fromEntries(entries) as T;
};

// 항상 소문자 이메일을 보장
const ensureLower = (u: { userEmail: string; userEmailLower?: string }) =>
  (u.userEmailLower ?? u.userEmail).toLowerCase();

// 모든 업데이트 payload의 공통 베이스
const basePayload = (u: { uid: string; userEmail: string; userEmailLower?: string }) => ({
  uid: u.uid,
  userEmail: u.userEmail,
  userEmailLower: ensureLower(u),
  update: true as const,
});

export const useUserDataStore = create<UserDataState>((set, get) => {
  const begin = (silent?: boolean) => (silent ? set({ error: null }) : set({ isLoading: true, error: null }));
  const end = (silent?: boolean) => (!silent ? set({ isLoading: false }) : undefined);

  // 공통 캐시 무효화 & 이벤트 브로드캐스트
  const invalidatePersonaCache = (universe: string, type: "personas" | "userPersonas") => {
    const cacheKey = `${universe}:${type}`;
    const cache = type === "personas" ? get().personasCache : get().userPersonasCache;
    // 새 Map으로 교체하여 Zustand 변경 감지 확실히
    const newMap = new Map(cache);
    newMap.delete(cacheKey);
    if (type === "personas") set({ personasCache: newMap });
    else set({ userPersonasCache: newMap });

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(EVT_PERSONA_CHANGED, { detail: { universe, type, action: "invalidate" } }));
    }
  };

  // 캐시/스토어에 persona 1개만 반영 (in-place 갱신)
  const upsertPersonaLocal = (universe: string, type: "personas" | "userPersonas", persona: IPersonaItem) => {
    const cacheKey = `${universe}:${type}`;
    const cache = type === "personas" ? get().personasCache : get().userPersonasCache;
    const cached = cache.get(cacheKey);

    const patchList = (list: IPersonaItem[] | undefined | null) => {
      if (!Array.isArray(list)) return list ?? [];
      const idx = list.findIndex((p) => p.pid === persona.pid);
      if (idx < 0) return [...list, persona];
      const next = [...list];
      next[idx] = { ...next[idx], ...persona };
      return next;
    };

    // 1) zustand userData 반영
    set((state) => {
      const ud = state.userData;
      if (!ud) return state;
      const udAccess = ud as unknown as Record<
        "personas" | "userPersonas",
        Record<string, IPersonaItem[] | undefined> | undefined
      >;
      const current = udAccess?.[type]?.[universe];
      const nextList = patchList(current);
      return {
        ...state,
        userData: {
          ...ud,
          [type]: {
            ...(udAccess[type] || {}),
            [universe]: nextList,
          },
        } as IUpdateUserData,
        lastFetched: Date.now(),
      };
    });

    // 2) 캐시 반영 (없으면 userData 기반으로 새로 생성)
    const udNow = get().userData as unknown as Record<
      "personas" | "userPersonas",
      Record<string, IPersonaItem[] | undefined> | undefined
    > | null;
    const baseList = cached?.data ?? (udNow?.[type]?.[universe] as IPersonaItem[]) ?? [];
    const nextData = patchList(baseList) as IPersonaItem[];

    const nextCache = new Map(cache);
    nextCache.set(cacheKey, { data: nextData, timestamp: Date.now() });
    if (type === "personas") set({ personasCache: nextCache });
    else set({ userPersonasCache: nextCache });

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(EVT_PERSONA_CHANGED, { detail: { universe, type, action: "update", personaId: persona.pid } }),
      );
    }
  };

  // ✅ 단일 persona patch endpoint 우선 사용 (원자적 inc는 서버에서 구현)
  const patchPersona = async (
    universe: string,
    type: "personas" | "userPersonas",
    personaId: string,
    patch: PersonaPatch,
    opts?: PersonaPatchOptions,
  ): Promise<IPersonaItem | null> => {
    const { userData } = get();
    if (!userData?.uid) throw new Error("로그인되지 않았거나 사용자 ID가 없습니다");

    const key: PendingKey = `${universe}:${type}:${personaId}`;
    return enqueuePersonaPatch(key, async () => {
      const nowIso = new Date().toISOString();
      const safePatch: PersonaPatch = {
        ...(patch.set ? { set: { ...patch.set, lastInteraction: nowIso } } : { set: { lastInteraction: nowIso } }),
        ...(patch.inc ? { inc: patch.inc } : {}),
      };

      begin(opts?.silent);
      try {
        // 1) ✅ 신규 endpoint 우선
        try {
          const res = await fetchClient.patch("/user/persona", {
            ...basePayload(userData),
            universe,
            type,
            personaId,
            patch: safePatch,
          });
          const persona = res.data?.data?.persona ?? res.data?.persona ?? res.data?.data ?? null;
          const nextUser = res.data?.data?.user ?? res.data?.user ?? null;

          if (nextUser) {
            set({
              userData: { ...nextUser, userEmailLower: ensureLower(nextUser) } as IUpdateUserData,
              lastFetched: Date.now(),
            });
          }
          if (persona && persona.pid) {
            upsertPersonaLocal(universe, type, persona);
            return persona;
          }
        } catch (e: unknown) {
          // 404/501 등일 경우 폴백
          logger.warn(
            "[userDataStore] /user/persona patch endpoint unavailable. Fallback to updateUser()",
            toErrorMessage(e),
          );
        }

        // 범용 /api/user 병합으로 되돌아가지 않는다. 서버 전용 patch 계약이 없으면 쓰기를 실패시킨다.
        throw new Error("server_authoritative_persona_patch_required");
      } finally {
        end(opts?.silent);
      }
    });
  };

  return {
    pendingRequests: new Map<string, Promise<IPersonaItem[]>>(),
    userData: null,
    isLoading: false,
    isReady: false,
    error: null,
    lastFetched: null,
    cacheTime: 30 * 1000, // 30초 캐시 (필요에 따라 조정)
    personasCache: new Map(),
    userPersonasCache: new Map(),

    pendingPersonaPatches: new Map(),

    setPendingPersonaMood: (universe, personaId, mood, type = "personas") => {
      const key: PendingKey = `${universe}:${type}:${personaId}`;
      const map = new Map(get().pendingPersonaPatches);
      const prev = map.get(key) || {};
      map.set(key, { ...prev, mood });
      set({ pendingPersonaPatches: map });

      // UI 즉시반영(프롬프트/표시용) – API 호출은 안 함
      const cacheKey = `${universe}:${type}`;
      const cache = type === "personas" ? get().personasCache : get().userPersonasCache;
      const cached = cache.get(cacheKey);
      if (cached?.data) {
        const updated = cached.data.map((p) => (p.pid === personaId ? { ...p, mood } : p));
        const newCache = new Map(cache); // 새 인스턴스로 교체
        newCache.set(cacheKey, { data: updated, timestamp: Date.now() });
        if (type === "personas") {
          set({ personasCache: newCache });
        } else {
          set({ userPersonasCache: newCache });
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(EVT_PERSONA_CHANGED, { detail: { universe, type, action: "patch", personaId } }),
          );
        }
      }
    },

    flushPendingPersonaPatches: async () => {
      const { pendingPersonaPatches, updatePersonaStats } = get();
      const entries = Array.from(pendingPersonaPatches.entries());
      if (!entries.length) return;

      set({ isLoading: true });
      try {
        for (const [key, patch] of entries) {
          const [universe, type, personaId] = key.split(":") as [string, "personas" | "userPersonas", string];
          await updatePersonaStats(universe, personaId, patch, type, { silent: true }); // 내부 토글 방지
        }
        set({ pendingPersonaPatches: new Map() });
      } finally {
        set({ isLoading: false });
      }
    },

    // 캐시 유효성 확인 헬퍼
    isCacheValid: () => {
      const { lastFetched, cacheTime } = get();
      if (!lastFetched) return false;
      return Date.now() - lastFetched < cacheTime;
    },

    // 캐시 클리어
    clearCache: (deep = false) => {
      const next: Partial<UserDataState> = { lastFetched: null, isReady: false };
      if (deep) {
        next.personasCache = new Map();
        next.userPersonasCache = new Map();
      }
      set(next as Partial<UserDataState>);
    },

    // 사용자 데이터 가져오기
    fetchUserData: async (uid: string) => {
      if (userFetchInFlight.has(uid)) return userFetchInFlight.get(uid)!;
      const p = (async () => {
        const currentState = get();

        // 현재 사용자와 같고 캐시가 유효하면 현재 데이터 반환
        if (currentState.userData?.uid === uid && currentState.isCacheValid()) {
          logger.log("유효한 캐시 데이터 반환:", uid);
          if (!currentState.isReady) set({ isReady: true });
          return currentState.userData;
        }

        // 같은 사용자의 기존 데이터가 있는 재검증은 silent로 수행
        const isSilentRevalidation = currentState.userData?.uid === uid;
        if (isSilentRevalidation) set({ error: null });
        else set({ isLoading: true, error: null, isReady: false });

        try {
          logger.log("사용자 데이터 가져오기 시작:", uid);
          const result = await getUser(uid);

          if (result.error) {
            logger.error("사용자 데이터 가져오기 오류:", result.error);
            set({ error: result.error, isLoading: false, isReady: true });
            return null;
          }

          logger.log("사용자 데이터 가져오기 성공:", result.user?.uid);

          if (result.user) {
            const normalized = {
              ...result.user,
              userEmailLower: ensureLower(result.user),
            };
            set({
              userData: normalized,
              lastFetched: Date.now(),
              isLoading: false,
              isReady: true,
              error: null,
            });
            return normalized;
          }
          set({ isLoading: false, isReady: true });
          return null;
        } catch (err) {
          logger.error("사용자 데이터 가져오기 실패:", err);
          set({
            error: "사용자 데이터를 가져오는 중 오류가 발생했습니다.",
            isLoading: false,
            isReady: true,
          });
          return null;
        }
      })().finally(() => userFetchInFlight.delete(uid));
      userFetchInFlight.set(uid, p);
      return p;
    },

    // 사용자 데이터 업데이트
    updateUserData: async (data: Partial<IUpdateUserData>) => {
      set({ isLoading: true, error: null });

      try {
        const { userData } = get();
        if (!userData?.uid) {
          throw new Error("로그인되지 않았거나 사용자 ID가 없습니다");
        }
        // userEmail이 없으면 기존 데이터에서 가져오기
        const userEmail = userData.userEmail;
        if (!userEmail) {
          throw new Error("사용자 이메일 정보가 없습니다. 다시 로그인해주세요.");
        }

        const { userEmailLower: _drop, ...rest } = data || {};
        const safeRest = omitUndefined(rest);
        const payload: IUpdateUserData = {
          uid: userData.uid,
          userEmail,
          userEmailLower: (userData.userEmailLower ?? userEmail).toLowerCase(),
          ...(safeRest as Omit<IUpdateUserData, "uid" | "userEmail" | "userEmailLower" | "update">),
          update: true,
        };

        const result = await updateUser(payload);

        if (result.error) {
          logger.error("USER API 오류 응답:", result.error);
          set({ userData, error: result.error });
          return null;
        }

        const nextUser = result.user ?? null;
        set({ userData: nextUser, lastFetched: Date.now() });
        return nextUser;
      } catch (err) {
        logger.error("사용자 데이터 업데이트 실패:", err);
        set({ error: "사용자 데이터를 업데이트하는 중 오류가 발생했습니다." });
        return null;
      } finally {
        set({ isLoading: false });
      }
    },

    // 페르소나 정보 업데이트
    updatePersona: async ({ universe, personaData, type }: UpdatePersonaParams) => {
      set({ isLoading: true, error: null });

      try {
        const { userData } = get();
        if (!userData?.uid) {
          throw new Error("로그인되지 않았거나 사용자 ID가 없습니다");
        }

        if (!userData.userEmail) {
          throw new Error("사용자 이메일 정보가 없습니다. 다시 로그인해주세요.");
        }

        // 현재 페르소나 목록 가져오기
        let currentPersonas = userData[type]?.[universe] || [];

        // 배열이 아닌 경우 배열로 변환
        if (!Array.isArray(currentPersonas)) {
          currentPersonas = [];
        }

        // 현재 페르소나 목록에서 동일한 ID를 가진 항목의 인덱스 찾기
        const existingIndex = currentPersonas.findIndex((p: IPersonaItem) => p.pid === personaData.pid);

        let updatedPersonas;
        if (existingIndex >= 0) {
          // 이미 존재하는 페르소나 업데이트
          updatedPersonas = [...currentPersonas];
          updatedPersonas[existingIndex] = {
            ...updatedPersonas[existingIndex],
            ...personaData,
          };
        } else {
          // 새 페르소나 추가
          updatedPersonas = [...currentPersonas, personaData];
        }

        // 업데이트 데이터 준비
        const updateData: IUpdateUserData = { ...basePayload(userData) };
        updateData[type] = { [universe]: updatedPersonas };

        // 낙관적 업데이트 (UI 즉시 반영)
        const optimisticUpdate = {
          ...userData,
          [type]: {
            ...userData[type],
            [universe]: updatedPersonas,
          },
        };

        set({ userData: optimisticUpdate });

        // 실제 API 호출
        const result = await updateUser(updateData);

        if (result.error) {
          // 에러시 이전 상태로 복원
          set({ userData, error: result.error });
          return null;
        }

        const nextUser = result.user ?? null;
        set({ userData: nextUser, lastFetched: Date.now() });

        // 메모리 캐시 무효화
        invalidatePersonaCache(universe, type);

        return nextUser;
      } catch (err) {
        logger.error("페르소나 정보 업데이트 실패:", err);
        set({ error: "페르소나 정보를 업데이트하는 중 오류가 발생했습니다." });

        // 캐시 무효화 (다음 요청에서 새로고침 강제)
        get().clearCache(true);
        return null;
      } finally {
        set({ isLoading: false });
      }
    },

    // 마지막 접속 유니버스 업데이트
    updateLastAccessedUniverse: async (universe: string) => {
      return get().updateUserData({ lastAccessedUniverse: universe });
    },

    // 사용자 데이터 강제 새로고침
    refetchUserData: async (uid: string) => {
      // 캐시 무효화 후 새로 가져오기
      get().clearCache(true);
      return get().fetchUserData(uid);
    },

    // 사용자 정보 업데이트
    updateUserInfo: async (userInfo: IUserInfo) => {
      return get().updateUserData({ userInfo });
    },

    // 사용자의 선택된 캐릭터 업데이트
    updateSelectedPersona: async (universe: string, personaId: string) => {
      set({ isLoading: true, error: null });

      try {
        const { userData } = get();
        if (!userData?.uid) {
          throw new Error("로그인되지 않았거나 사용자 ID가 없습니다");
        }

        logger.log("updateSelectedPersona 호출:", { universe, personaId });

        // 낙관적 업데이트 적용
        const optimisticData = {
          ...userData,
          selectedPersonas: {
            ...userData.selectedPersonas,
            [universe]: personaId,
          },
        };

        // 낙관적 업데이트 적용 (UI 즉시 반영)
        set({ userData: optimisticData });

        const payload: IUpdateUserData = {
          ...basePayload(userData),
          selectedPersonas: { [universe]: personaId },
        };

        // 실제 API 호출
        const result = await updateUser(payload);

        if (result.error) {
          logger.error("USER API 오류 응답:", result.error);
          // 에러시 이전 상태로 복원
          set({ userData, error: result.error });
          return null;
        }

        if (result.warning) {
          logger.warn("USER API 경고 응답:", result.warning);
        }

        const nextUser = result.user ?? null;
        set({ userData: nextUser, lastFetched: Date.now() });
        logger.log("userData 상태 업데이트 완료");

        return nextUser;
      } catch (err) {
        logger.error("선택된 캐릭터 업데이트 실패:", err);
        set({ error: "선택된 캐릭터를 업데이트하는 중 오류가 발생했습니다." });

        // 캐시 무효화 (다음 요청에서 새로고침 강제)
        get().clearCache(true);
        return null;
      } finally {
        set({ isLoading: false });
      }
    },

    // 별도 API로 personas 데이터 가져오기
    fetchPersonasData: async (universe: string, type: "personas" | "userPersonas") => {
      const { userData } = get();
      if (!userData?.uid) {
        throw new Error("사용자 ID가 없습니다");
      }

      const cacheKey = `${universe}:${type}`;
      const cache = type === "personas" ? get().personasCache : get().userPersonasCache;

      // 1. 캐시 확인
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }

      // 2. 이미 진행 중인 요청이 있는지 확인 (중복 방지)
      const pendingKey = `pending:${cacheKey}`;
      const pending = get().pendingRequests?.get(pendingKey);
      if (pending) {
        return pending; // 타입: Promise<IPersonaItem[]>
      }

      // 3. 새 요청 생성
      const requestPromise = (async () => {
        try {
          const response = await fetchClient.get("/user/personas", {
            params: { uid: userData.uid, universe, type },
          });

          let personas: IPersonaItem[] = [];
          if (response.data?.data?.personas) {
            personas = response.data.data.personas;
          } else if (Array.isArray(response.data?.data)) {
            personas = response.data.data;
          } else {
            logger.warn(`예상하지 못한 API 응답 구조:`, response.data);
            personas = [];
          }

          // 캐시에 넣기
          const now = Date.now();
          const base = type === "personas" ? get().personasCache : get().userPersonasCache;
          const next = new Map(base);
          next.set(cacheKey, { data: personas, timestamp: now });

          if (type === "personas") set({ personasCache: next });
          else set({ userPersonasCache: next });

          return personas;
        } catch (error) {
          logger.error(`Personas 데이터 API 호출 실패 (${type}):`, error);
          return []; // 에러 시 빈 배열 반환하여 UI 깨짐 방지
        } finally {
          // 메모리 누수 방지(요청 맵 크기 제한)
          const current = get().pendingRequests;
          if (current) {
            const next = new Map(current);
            next.delete(pendingKey);

            if (next.size > 100) {
              const keys = Array.from(next.keys()).slice(0, 50);
              keys.forEach((k) => next.delete(k));
            }
            set({ pendingRequests: next });
          }
        }
      })();

      // pending 요청 저장
      if (!get().pendingRequests) {
        set({ pendingRequests: new Map() });
      }
      const map = new Map(get().pendingRequests);
      map.set(pendingKey, requestPromise);
      set({ pendingRequests: map });

      return requestPromise;
    },

    // 캐시된 데이터 가져오기 (API 호출 없이)
    getCachedPersonasData: (universe: string, type: "personas" | "userPersonas") => {
      const cacheKey = `${universe}:${type}`;
      const cache = type === "personas" ? get().personasCache : get().userPersonasCache;
      const cached = cache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }

      return null;
    },

    // userPersonas 초기화 함수 - select-character 페이지에서 최초 진입 시 호출
    initializeUserPersonas: async (universe: string, availablePersonas: IExtendedNpcData[]) => {
      set({ isLoading: true, error: null });

      try {
        const { userData } = get();
        if (!userData?.uid) {
          throw new Error("로그인되지 않았거나 사용자 ID가 없습니다");
        }

        // 현재 userPersonas 확인
        const currentUserPersonas = userData.userPersonas?.[universe] || [];

        // 이미 userPersonas가 설정되어 있으면 건너뛰기
        if (currentUserPersonas.length > 0) {
          logger.log(`${universe} 유니버스의 userPersonas가 이미 설정되어 있습니다.`);
          return userData;
        }

        // userPersonas의 초기 능력치·진행 상태는 브라우저에서 만들지 않고 서버 command의 결과만 읽는다.
        const response = await fetchClient.post("/user/persona", {
          command: "ensure",
          universe,
          type: "userPersonas",
          personaIds: availablePersonas.slice(0, GC.INIT_MAX_CHARACTERS).map((persona) => persona.pid),
        });
        if (!response.data?.ok) throw new Error(response.data?.error || "user_personas_initialize_failed");
        const nextUser = await get().refetchUserData(userData.uid);
        logger.log(`${universe} 유니버스 userPersonas 초기화 완료:`, response.data?.data?.personas?.length || 0, "개");
        return nextUser;
      } catch (err) {
        logger.error("userPersonas 초기화 중 오류:", err);
        set({ error: "userPersonas를 초기화하는 중 오류가 발생했습니다." });
        return null;
      } finally {
        set({ isLoading: false });
      }
    },

    // 캐릭터 사용 가능 여부 체크 함수
    checkCharacterAvailable: async (universe: string, characterId: string) => {
      try {
        const userPersona = await get().getPersonaData(universe, characterId, "userPersonas");

        if (!userPersona) {
          return false;
        }

        const isUnlocked = userPersona.isUnlocked ?? false;
        const intimacy = userPersona.intimacy ?? 0;

        return isUnlocked && intimacy >= INTIMACY_LEVEL_MAP.familiar_face.level;
      } catch (error) {
        logger.error("캐릭터 사용 가능 여부 확인 실패:", error);
        return false;
      }
    },

    addPersonaFromNPC: async (universe: string, npcData: IExtendedNpcData) => {
      begin(undefined);

      try {
        const { userData } = get();
        if (!userData?.uid) {
          throw new Error("로그인되지 않았거나 사용자 ID가 없습니다");
        }

        // userPersonas에 이미 존재하는지 먼저 확인
        const currentUserPersonas = userData.userPersonas?.[universe] || [];
        const existsInUserPersonas =
          Array.isArray(currentUserPersonas) && currentUserPersonas.find((p: IPersonaItem) => p.pid === npcData.pid);

        if (existsInUserPersonas) {
          logger.log("이미 userPersonas에 존재하는 NPC, personas 추가 생략:", npcData.pid);
          return userData;
        }

        // personas에 존재하는지 확인
        const currentPersonas = userData.personas?.[universe] || [];
        const existsInPersonas =
          Array.isArray(currentPersonas) && currentPersonas.find((p: IPersonaItem) => p.pid === npcData.pid);

        if (existsInPersonas) {
          logger.log("이미 personas에 존재하는 NPC:", npcData.pid);
          return userData;
        }

        await fetchClient.post("/user/persona", {
          command: "register-npc",
          universe,
          type: "personas",
          personaId: npcData.pid,
        });
        const nextUser = await get().refetchUserData(userData.uid);
        if (!nextUser) return null;

        // 메모리 캐시 즉시 삭제
        invalidatePersonaCache(universe, "personas");

        // 캐시 무효화 이벤트 발생
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(EVT_PERSONA_CHANGED, {
              detail: {
                universe,
                type: "personas",
                action: "add",
                personaId: npcData.pid,
              },
            }),
          );
        }

        return nextUser;
      } catch (err) {
        logger.error("NPC personas 추가 실패:", err);
        set({ error: "NPC 정보를 추가하는 중 오류가 발생했습니다." });
        get().clearCache(true);
        return null;
      } finally {
        end(undefined);
      }
    },

    // 대화 상호작용 업데이트 (totalInteractions, lastInteraction)
    updatePersonaInteraction: async (
      universe: string,
      personaId: string,
      type: "personas" | "userPersonas" = "personas",
      opts?: PersonaPatchOptions,
    ) => {
      try {
        return await patchPersona(universe, type, personaId, { inc: { totalInteractions: 1 } }, opts);
      } catch (err) {
        logger.error("페르소나 상호작용 업데이트 실패:", err);
        set({ error: "페르소나 상호작용 업데이트 중 오류가 발생했습니다." });
        get().clearCache(true);
        return null;
      }
    },

    // 친밀도 업데이트
    updatePersonaIntimacy: async (
      universe: string,
      personaId: string,
      value: number,
      type: "personas" | "userPersonas" = "personas",
      isAbsoluteValue: boolean = false, // 절대값 또는 증감값 계산 여부
      opts?: PersonaPatchOptions,
    ) => {
      begin(opts?.silent);

      try {
        const { userData } = get();
        if (!userData?.uid) {
          throw new Error("로그인되지 않았거나 사용자 ID가 없습니다");
        }

        const currentPersonaForPatch = await get().getPersonaData(universe, personaId, type);
        if (!currentPersonaForPatch) return null;
        const target = Math.max(0, Math.min(GC.ABILITIES.INTIMACY, value));
        const delta = isAbsoluteValue ? target - (currentPersonaForPatch.intimacy || 0) : value;
        return await patchPersona(universe, type, personaId, { inc: { intimacy: delta } }, opts);
      } catch (err) {
        logger.error("페르소나 친밀도 업데이트 실패:", err);
        set({ error: "페르소나 친밀도 업데이트 중 오류가 발생했습니다." });
        get().clearCache(true);
        return null;
      } finally {
        end(opts?.silent);
      }
    },

    // 일반 능력치 업데이트
    updatePersonaStats: async (
      universe: string,
      personaId: string,
      updates: Partial<IPersonaItem>,
      type: "personas" | "userPersonas" = "personas",
      opts?: PersonaPatchOptions & { inc?: Record<string, number> },
    ) => {
      try {
        const safeSet: Partial<IPersonaItem> & Record<string, unknown> = { ...updates };
        // 클램프는 서버에서. 폴백에서도 최소 클램프만 수행
        if (safeSet.level !== undefined) safeSet.level = clampNum(safeSet.level, 1, GC.ABILITIES.LEVEL);
        if (safeSet.xp !== undefined) safeSet.xp = clampNum(safeSet.xp, 0, GC.ABILITIES.XP);
        if (safeSet.hp !== undefined) safeSet.hp = clampNum(safeSet.hp, 0, GC.ABILITIES.HP);
        if (safeSet.mp !== undefined) safeSet.mp = clampNum(safeSet.mp, 0, GC.ABILITIES.MP);
        if (safeSet.iq !== undefined) safeSet.iq = clampNum(safeSet.iq, 0, GC.ABILITIES.IQ);
        if (safeSet.eq !== undefined) safeSet.eq = clampNum(safeSet.eq, 0, GC.ABILITIES.EQ);
        if (safeSet.luck !== undefined) safeSet.luck = clampNum(safeSet.luck, 0, GC.ABILITIES.LUCK);
        if (safeSet.intimacy !== undefined) safeSet.intimacy = clampNum(safeSet.intimacy, 0, GC.ABILITIES.INTIMACY);

        return await patchPersona(universe, type, personaId, { set: safeSet, inc: opts?.inc }, opts);
      } catch (err) {
        logger.error("페르소나 능력치 업데이트 실패:", err);
        set({ error: "페르소나 능력치 업데이트 중 오류가 발생했습니다." });
        get().clearCache(true);
        return null;
      }
    },

    // 현재 페르소나 정보 가져오기 헬퍼 함수
    getPersonaData: async (universe: string, personaId: string, type: "personas" | "userPersonas" = "personas") => {
      // 1. 먼저 캐시 확인
      const cacheKey = `${universe}:${type}`;
      const cache = type === "personas" ? get().personasCache : get().userPersonasCache;
      const cached = cache.get(cacheKey);

      // 캐시가 있고 유효하면 즉시 반환
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        const personas = cached.data;
        logger.log("[userDataStore] getPersonaData cached length:", Array.isArray(personas) ? personas.length : 0);
        if (Array.isArray(personas)) {
          return personas.find((p: IPersonaItem) => p.pid === personaId) || null;
        }
      }

      // 2. 캐시가 없으면 API 호출
      try {
        const personas = await get().fetchPersonasData(universe, type);
        logger.log("[userDataStore] getPersonaData fetched length:", Array.isArray(personas) ? personas.length : 0);
        if (Array.isArray(personas)) {
          return personas.find((p: IPersonaItem) => p.pid === personaId) || null;
        }
      } catch (error) {
        logger.error(`페르소나 데이터 로드 실패: ${personaId}`, error);
      }

      return null;
    },

    // personas에서 userPersonas로 이동하는 함수
    movePersonaToUserPersonas: async (universe: string, personaId: string) => {
      const { userData } = get();
      if (!userData?.uid) return null;

      try {
        // personas에서 해당 캐릭터 찾기
        const currentPersonas = userData.personas?.[universe] || [];
        if (!Array.isArray(currentPersonas)) return userData;

        const personaIndex = currentPersonas.findIndex((p: IPersonaItem) => p.pid === personaId);
        if (personaIndex < 0) {
          logger.warn(`이동할 페르소나를 찾을 수 없음: ${personaId}`);
          return userData;
        }

        const persona = currentPersonas[personaIndex];

        // userPersonas에서 이미 존재하는지 확인
        const currentUserPersonas = userData.userPersonas?.[universe] || [];
        const existsInUserPersonas =
          Array.isArray(currentUserPersonas) && currentUserPersonas.find((p: IPersonaItem) => p.pid === personaId);

        if (existsInUserPersonas) {
          logger.warn(`이미 userPersonas에 존재하는 캐릭터: ${personaId}`);
          // personas에서만 제거
          const updatedPersonas = [...currentPersonas];
          updatedPersonas.splice(personaIndex, 1);

          const updateData: IUpdateUserData = {
            ...basePayload(userData),
            personas: { [universe]: updatedPersonas },
          };

          const result = await updateUser(updateData);
          if (!result.error) {
            set({ userData: result.user ?? null, lastFetched: Date.now() });
          }
          return result.user ?? null;
        }

        // userPersonas에 추가할 데이터 준비 (기본 AFFECTION 친밀도로 업데이트, 잠금 해제)
        const updatedPersona: IPersonaItem = {
          ...persona,
          intimacy: Math.max(INTIMACY_LEVEL_MAP.familiar_face.level, persona.intimacy || 0),
          isUnlocked: true,
          ownership: true,
        };

        // personas에서 제거
        const updatedPersonas = [...currentPersonas];
        updatedPersonas.splice(personaIndex, 1);

        // userPersonas에 추가 (중복 확인 후)
        const updatedUserPersonas = Array.isArray(currentUserPersonas)
          ? [...currentUserPersonas.filter((p) => p.pid !== personaId), updatedPersona] // 혹시 모를 중복 제거
          : [updatedPersona];

        // API 업데이트
        const updateData: IUpdateUserData = {
          ...basePayload(userData),
          personas: { [universe]: updatedPersonas },
          userPersonas: { [universe]: updatedUserPersonas },
        };

        // 낙관적 업데이트
        const optimisticUpdate = {
          ...userData,
          personas: {
            ...userData.personas,
            [universe]: updatedPersonas,
          },
          userPersonas: {
            ...userData.userPersonas,
            [universe]: updatedUserPersonas,
          },
        };
        set({ userData: optimisticUpdate });

        const result = await updateUser(updateData);
        if (result.error) {
          // 에러시 이전 상태로 복원
          set({ userData, error: result.error });
          return null;
        }

        const nextUser = result.user ?? null;
        set({ userData: nextUser, lastFetched: Date.now() });
        logger.log(`페르소나 이동 완료: ${personaId} (personas → userPersonas)`);

        invalidatePersonaCache(universe, "personas");
        invalidatePersonaCache(universe, "userPersonas");
        return nextUser;
      } catch (error) {
        logger.error("페르소나 이동 실패:", error);
        set({ error: "페르소나 이동 중 오류가 발생했습니다." });
        get().clearCache(true);
        return null;
      }
    },

    // 캐릭터가 어느 타입에 속하는지 확인하는 함수
    getPersonaType: async (universe: string, personaId: string) => {
      const check = await get().checkPersonaExists(universe, personaId);
      return check.location;
    },

    // 특정 유니버스의 모든 페르소나 수 반환
    getTotalPersonaCount: async (universe: string) => {
      try {
        // 병렬로 데이터 가져오기
        const [userPersonas, personas] = await Promise.all([
          get().fetchPersonasData(universe, "userPersonas"),
          get().fetchPersonasData(universe, "personas"),
        ]);

        return userPersonas.length + personas.length;
      } catch (error) {
        logger.error("페르소나 카운트 조회 실패:", error);
        return 0;
      }
    },

    // 특정 유니버스에서 잠금 해제된 페르소나 수 반환
    getUnlockedPersonaCount: async (universe: string) => {
      try {
        const [userPersonas, personas] = await Promise.all([
          get().fetchPersonasData(universe, "userPersonas"),
          get().fetchPersonasData(universe, "personas"),
        ]);

        let unlockedCount = 0;
        unlockedCount += userPersonas.filter((p: IPersonaItem) => p.isUnlocked !== false).length;
        unlockedCount += personas.filter((p: IPersonaItem) => p.isUnlocked !== false).length;

        return unlockedCount;
      } catch (error) {
        logger.error("잠금 해제된 페르소나 카운트 조회 실패:", error);
        return 0;
      }
    },

    checkPersonaExists: async (universeId: string, personaId: string) => {
      // Promise.all로 병렬 처리
      const [userPersonasExist, personasExist] = await Promise.all([
        get()
          .getPersonaData(universeId, personaId, "userPersonas")
          .then((data) => !!data),
        get()
          .getPersonaData(universeId, personaId, "personas")
          .then((data) => !!data),
      ]);

      if (userPersonasExist) {
        return { exists: true, location: "userPersonas" as const };
      }

      if (personasExist) {
        return { exists: true, location: "personas" as const };
      }

      return { exists: false, location: null };
    },

    batchCheckCharacterAvailable: async (universe: string, characterIds: string[]) => {
      // 캐시된 데이터 우선 확인
      const userPersonas = await get().fetchPersonasData(universe, "userPersonas");

      const result: Record<string, boolean> = {};

      characterIds.forEach((id) => {
        const persona = userPersonas.find((p) => p.pid === id);
        result[id] = !!(
          persona &&
          persona.isUnlocked &&
          (persona.intimacy ?? 0) >= INTIMACY_LEVEL_MAP.familiar_face.level
        );
      });

      return result;
    },
  };
});
