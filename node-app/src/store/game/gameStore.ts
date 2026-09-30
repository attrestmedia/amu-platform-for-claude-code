import { immer } from "zustand/middleware/immer";
import { create } from "zustand";
import { enableMapSet } from "immer";
import type {
  IGlobalNpcData,
  ITextureRefs,
  IStageData,
  IStageGlobalMeta,
  IExtendedNpcData,
  ICameraState,
  ICameraConstraints,
  CameraMode,
  CameraLockReason,
  DirectionFacingType,
  IWorldData,
  IWorldTrigger,
  CameraBoundaryMode,
  IStageRuntime,
} from "types/game";
import { clampCameraAxis } from "utils/game/cameraUtils";
import { GAME_CONSTANTS as GC } from "consts/game";

/**
 * @docHint
 * @purpose 클라이언트 상태 스토어 정의
 * @process 상태 초기화  업데이트 함수  선택자 제공  로컬 저장 연동
 * @domain game
 * @scope client
 */

enableMapSet(); // Map과 Set에 대한 변경을 Immer가 허용하도록 설정

type StageTransitionType = "none" | "pan" | "fade" | "pan-and-fade";

interface StageTransitionState {
  active: boolean;
  type: StageTransitionType;
  startedAt: number;
  durationMs: number;
  fromCameraX: number;
  fromCameraY: number;
  toCameraX: number;
  toCameraY: number;
  overlayAlpha: number;
  overlayMaxAlpha: number;
}

export interface GameStore {
  // 유니버스 ID 관리
  universeId: string;
  stageId: string; // 스테이지 아이디
  stageName: string; // 스테이지 이름 (stageName)

  // 주인공 상태
  protagonist: {
    x: number;
    y: number;
    baseY: number;
    direction: DirectionFacingType;
  };

  // 카메라 상태 (월드 좌표 기준 뷰포트)
  camera: ICameraState;

  npcs: IGlobalNpcData[]; // 현재 게임 세계에 배치되어 있는 실제 NPC 인스턴스들

  // 캐릭터 템플릿 관리 - 게임에서 사용 가능한 모든 NPC 템플릿의 목록 (해당 NPC들의 기본 속성만 포함)
  characterTemplates: {
    byId: Record<string, IExtendedNpcData>;
    allIds: string[];
    usedIds: Set<string>;
    universeGroups: Record<string, string[]>;
  };

  // 텍스처 참조 관리
  textures: ITextureRefs | null;

  // 스테이지 데이터
  stageData: {
    [key: string]: IStageData;
  };

  // 현재 활성 스테이지 런타임
  stageRuntime: IStageRuntime | null;

  // 스테이지 메타 정보(단일 객체로 저장)
  stageGlobalMetaData: IStageGlobalMeta | null;

  // 월드 데이터 (맵에 표시할 데이터)
  worldData: IWorldData;

  // 월드 트리거 (포탈, 상점 영역, 연출 존 등)
  worldTriggers: IWorldTrigger[];

  // 스테이지 전환(연출) 상태
  stageTransition: StageTransitionState;

  // 액션
  setUniverseId: (id: string) => void;
  setStage: (stageId: string, stageName: string) => void;
  setProtagonist: (x: number, y: number, baseY: number, direction?: DirectionFacingType) => void;

  // 카메라 액션
  setCameraState: (updater: Partial<ICameraState> | ((prev: ICameraState) => ICameraState)) => void;
  setCameraViewSize: (width: number, height: number) => void;
  setCameraPosition: (x: number, y: number, opts?: { clampToConstraints?: boolean }) => void;
  moveCameraBy: (dx: number, dy: number, opts?: { clampToConstraints?: boolean }) => void;
  focusCameraOn: (worldX: number, worldY: number, opts?: { immediate?: boolean; clampToConstraints?: boolean }) => void;
  setCameraMode: (mode: CameraMode) => void;
  setCameraBoundaryMode: (mode: CameraBoundaryMode) => void;
  setCameraConstraints: (constraints: ICameraConstraints | null) => void;
  lockCamera: (reason?: CameraLockReason) => void;
  unlockCamera: () => void;
  attachCameraToProtagonist: () => void;

  // 스테이지 전환 액션
  setStageTransition: (
    updater: Partial<StageTransitionState> | ((prev: StageTransitionState) => StageTransitionState),
  ) => void;
  startStageTransition: (options: {
    type?: Exclude<StageTransitionType, "none">;
    durationMs?: number;
    toWorldPos?: { x: number; y: number };
    lockReason?: CameraLockReason;
  }) => void;
  finishStageTransition: () => void;

  setNpcs: (npcs: IGlobalNpcData[]) => void;
  updateNpcPosition: (id: string, worldX: number, worldY: number) => void;
  setTextures: (textures: ITextureRefs) => void;
  setStageData: (key: string, data: IStageData) => void;
  setStageRuntime: (runtime: IStageRuntime | null) => void; // 현재 스테이지 런타임 전체를 교체
  setStageGlobalMetaData: (data: IStageGlobalMeta) => void;
  setWorldData: (data: IWorldData) => void;

  // 월드 트리거 액션
  setWorldTriggers: (triggers: IWorldTrigger[]) => void;
  addWorldTrigger: (trigger: IWorldTrigger) => void;
  removeWorldTrigger: (id: string) => void;
  markTriggerFired: (id: string) => void;

  // 캐릭터 템플릿 액션
  setCharacterTemplates: (templates: IExtendedNpcData[]) => void;
  getAvailableCharacters: (count?: number, universeId?: string, userCharacterId?: string) => IExtendedNpcData[];
  markCharacterAsUsed: (characterId: string) => void;
  resetUsedCharacters: () => void; // 사용된 캐릭터 목록 초기화

}

const useGameStore = create<GameStore>()(
  immer((set, get) => ({
    universeId: "",
    stageId: GC.FALLBACK.STAGE_ID,
    stageName: GC.FALLBACK.STAGE_NAME,
    protagonist: {
      x: 0,
      y: 0,
      baseY: 0,
      direction: "down",
    },
    camera: {
      x: 0,
      y: 0,
      width: 600,
      height: 800,
      mode: "follow-protagonist",
      zoom: GC.CAMERA.DEFAULT_ZOOM,
      boundaryMode: GC.CAMERA.BOUNDARY_MODE.GAME,
      targetType: "protagonist",
      targetId: "protagonist",
      targetX: null,
      targetY: null,
      softLockRadiusX: 600 * GC.CAMERA.SOFT_LOCK_BOX_RATIO.X,
      softLockRadiusY: 800 * GC.CAMERA.SOFT_LOCK_BOX_RATIO.Y,
      lerpFactor: GC.CAMERA.LERP_FACTOR,
      constraints: null,
      isLocked: false,
      lockReason: null,
    },
    npcs: [],
    // 캐릭터 템플릿 초기화
    characterTemplates: {
      byId: {},
      allIds: [],
      usedIds: new Set(),
      universeGroups: {},
    },
    textures: null,
    stageData: {},
    stageRuntime: null,
    stageGlobalMetaData: null,
    worldData: {
      stageWidth: 600,
      stageHeight: 800,
      objects: [],
    },
    worldTriggers: [],
    stageTransition: {
      active: false,
      type: "none",
      startedAt: 0,
      durationMs: GC.CAMERA.TRANSITION.DEFAULT_DURATION,
      fromCameraX: 0,
      fromCameraY: 0,
      toCameraX: 0,
      toCameraY: 0,
      overlayAlpha: 0,
      overlayMaxAlpha: GC.CAMERA.TRANSITION.FADE_MAX_ALPHA,
    },

    // 유니버스 ID 설정 액션
    setUniverseId: (id) =>
      set((state) => {
        state.universeId = id;
        // 유니버스가 변경되면 스테이지도 초기화
        state.stageId = GC.FALLBACK.STAGE_ID;
        state.stageName = GC.FALLBACK.STAGE_NAME;

        // 스테이지 메타 리셋
        state.stageRuntime = null;
        state.stageData = {};
        state.stageGlobalMetaData = null;

        // 유니버스 변경 시 카메라도 기본 상태로 리셋
        state.camera.x = 0;
        state.camera.y = 0;
        state.camera.mode = "follow-protagonist";
        state.camera.targetType = "protagonist";
        state.camera.targetId = "protagonist";
        state.camera.targetX = null;
        state.camera.targetY = null;
        state.camera.constraints = null;
        state.camera.isLocked = false;
        state.camera.lockReason = null;
        state.camera.boundaryMode = GC.CAMERA.BOUNDARY_MODE.GAME;

        // 유니버스가 바뀔 때 NPC 사용 이력도 새로 시작
        state.characterTemplates.usedIds.clear();
      }),

    setStage: (stageId, stageName) =>
      set((state) => {
        state.stageId = stageId;
        state.stageName = stageName;

        // 스테이지 변경 시 런타임은 새로 세팅
        state.stageRuntime = null;

        // 스테이지 변경 시, 타깃 정보만 기본값으로
        state.camera.mode = "follow-protagonist";
        state.camera.targetType = "protagonist";
        state.camera.targetId = "protagonist";
        state.camera.targetX = null;
        state.camera.targetY = null;
      }),

    setProtagonist: (x, y, baseY, direction) =>
      set((state) => {
        state.protagonist.x = x;
        state.protagonist.y = y;
        state.protagonist.baseY = baseY;
        if (direction) state.protagonist.direction = direction;
      }),

    // 카메라 상태 업데이트 (부분 업데이트/함수 업데이트 모두 지원)
    // - 전체 상태를 바꾸고 싶을 땐 setCameraState((prev) => newState)만 사용
    setCameraState: (updater) =>
      set((state) => {
        if (typeof updater === "function") {
          const fn = updater as (prev: ICameraState) => ICameraState;
          state.camera = fn(state.camera);
        } else {
          state.camera = {
            ...state.camera,
            ...updater,
          };
        }
      }),

    // 뷰포트 크기 변경 (리사이즈 시 호출)
    setCameraViewSize: (width, height) =>
      set((state) => {
        state.camera.width = width;
        state.camera.height = height;

        // 뷰포트 크기에 따른 소프트 락 박스 재계산
        state.camera.softLockRadiusX = width * GC.CAMERA.SOFT_LOCK_BOX_RATIO.X;
        state.camera.softLockRadiusY = height * GC.CAMERA.SOFT_LOCK_BOX_RATIO.Y;

        const c = state.camera.constraints;
        if (c) {
          // 역전 가드 포함 단일 clamp (P1-4) — 월드 < 뷰포트 축은 중앙 정렬
          state.camera.x = clampCameraAxis(state.camera.x, c.minX, c.maxX, width);
          state.camera.y = clampCameraAxis(state.camera.y, c.minY, c.maxY, height);
        }
      }),

    // 카메라 위치를 절대 좌표로 설정
    setCameraPosition: (x, y, opts) =>
      set((state) => {
        const clampToConstraints = opts?.clampToConstraints ?? true;
        let nx = x;
        let ny = y;

        if (clampToConstraints && state.camera.constraints) {
          const c = state.camera.constraints;
          // 역전 가드 포함 단일 clamp (P1-4)
          nx = clampCameraAxis(nx, c.minX, c.maxX, state.camera.width);
          ny = clampCameraAxis(ny, c.minY, c.maxY, state.camera.height);
        }

        state.camera.x = nx;
        state.camera.y = ny;
      }),

    // 카메라를 상대 이동 (px 단위)
    moveCameraBy: (dx, dy, opts) => {
      const { camera, setCameraPosition } = get();
      setCameraPosition(camera.x + dx, camera.y + dy, opts);
    },

    // 특정 월드 포인트를 화면 중앙에 오도록 포커스
    focusCameraOn: (worldX, worldY, opts) => {
      const { camera, setCameraPosition } = get();
      const { immediate = true, clampToConstraints = true } = opts ?? {};

      const targetCenterX = worldX;
      const targetCenterY = worldY;

      const viewX = targetCenterX - camera.width / 2;
      const viewY = targetCenterY - camera.height / 2;

      // 타깃 정보는 항상 갱신
      set((state) => {
        state.camera.targetX = targetCenterX;
        state.camera.targetY = targetCenterY;
        state.camera.targetType = "point";
      });

      // 즉시 이동 (이후 단계에서 게임 루프에서 lerp 처리)
      if (immediate) {
        setCameraPosition(viewX, viewY, { clampToConstraints });
      }
    },

    setCameraMode: (mode) =>
      set((state) => {
        state.camera.mode = mode;
      }),

    setCameraBoundaryMode: (mode) =>
      set((state) => {
        state.camera.boundaryMode = mode;

        // 무한 모드로 전환시 하드 클램프 해제
        if (mode !== "finite-hard") {
          state.camera.constraints = null;
        }
      }),

    // 월드 경계 클램프 설정
    setCameraConstraints: (constraints) =>
      set((state) => {
        state.camera.constraints = constraints;
        if (!constraints) return;

        // 역전 가드 포함 단일 clamp (P1-4)
        state.camera.x = clampCameraAxis(state.camera.x, constraints.minX, constraints.maxX, state.camera.width);
        state.camera.y = clampCameraAxis(state.camera.y, constraints.minY, constraints.maxY, state.camera.height);
      }),

    lockCamera: (reason) =>
      set((state) => {
        state.camera.isLocked = true;
        state.camera.lockReason = reason ?? "manual";
        state.camera.mode = "locked";
      }),

    unlockCamera: () =>
      set((state) => {
        state.camera.isLocked = false;
        state.camera.lockReason = null;
        if (state.camera.mode === "locked") {
          state.camera.mode = "follow-protagonist";
        }
      }),

    // 주인공 팔로우 모드 설정
    attachCameraToProtagonist: () =>
      set((state) => {
        state.camera.mode = "follow-protagonist";
        state.camera.targetType = "protagonist";
        state.camera.targetId = "protagonist";
        state.camera.targetX = null;
        state.camera.targetY = null;
      }),

    // 스테이지 전환 상태 관리
    setStageTransition: (updater) =>
      set((state) => {
        if (typeof updater === "function") {
          const fn = updater as (prev: StageTransitionState) => StageTransitionState;
          state.stageTransition = fn(state.stageTransition);
        } else {
          state.stageTransition = {
            ...state.stageTransition,
            ...updater,
          };
        }
      }),

    // 카메라 컷씬/패닝/페이드 전환 시작
    startStageTransition: (options) =>
      set((state) => {
        const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

        const cam = state.camera;
        const duration = options.durationMs ?? GC.CAMERA.TRANSITION.DEFAULT_DURATION;
        const type = options.type ?? GC.CAMERA.TRANSITION.DEFAULT_TYPE;

        let targetCamX = cam.x;
        let targetCamY = cam.y;

        // 월드 좌표 기준 타깃이 주어졌다면 -> 카메라 좌측 상단 좌표로 변환
        if (options.toWorldPos) {
          targetCamX = options.toWorldPos.x - cam.width / 2;
          targetCamY = options.toWorldPos.y - cam.height / 2;

          // 카메라 클램프
          const c = cam.constraints;
          const w = cam.width;
          const h = cam.height;
          if (c) {
            if (typeof c.minX === "number") targetCamX = Math.max(targetCamX, c.minX);
            if (typeof c.maxX === "number") targetCamX = Math.min(targetCamX, c.maxX - w);
            if (typeof c.minY === "number") targetCamY = Math.max(targetCamY, c.minY);
            if (typeof c.maxY === "number") targetCamY = Math.min(targetCamY, c.maxY - h);
          }
        }

        // 카메라 컷씬 모드 + 잠금
        state.camera.mode = "cutscene";
        state.camera.isLocked = true;
        state.camera.lockReason = options.lockReason ?? "cutscene";
        state.camera.targetX = targetCamX;
        state.camera.targetY = targetCamY;

        state.stageTransition = {
          ...state.stageTransition,
          active: true,
          type,
          startedAt: now,
          durationMs: duration,
          fromCameraX: cam.x,
          fromCameraY: cam.y,
          toCameraX: targetCamX,
          toCameraY: targetCamY,
          overlayAlpha: 0,
          overlayMaxAlpha: GC.CAMERA.TRANSITION.FADE_MAX_ALPHA,
        };
      }),

    // 전환 종료 시 카메라 모드 복원
    finishStageTransition: () =>
      set((state) => {
        state.stageTransition.active = false;
        state.stageTransition.type = "none";
        state.stageTransition.startedAt = 0;
        state.stageTransition.durationMs = GC.CAMERA.TRANSITION.DEFAULT_DURATION;
        state.stageTransition.overlayAlpha = 0;

        if (state.camera.lockReason === "cutscene") {
          state.camera.isLocked = false;
          state.camera.lockReason = null;
          state.camera.mode = "follow-protagonist";
          state.camera.targetType = "protagonist";
          state.camera.targetId = "protagonist";
          state.camera.targetX = null;
          state.camera.targetY = null;
        }
      }),

    setNpcs: (npcs) =>
      set((state) => {
        state.npcs = npcs;
      }),

    updateNpcPosition: (id, worldX, worldY) =>
      set((state) => {
        const npc = state.npcs.find((n) => n.id === id);
        if (npc) {
          npc.logicalPosition = { worldX, worldY };
          npc.info.logicalPosition = { worldX, worldY };
        }
      }),

    setTextures: (textures) =>
      set((state) => {
        state.textures = textures;
      }),

    setStageData: (key, data) =>
      set((state) => {
        state.stageData[key] = data;
      }),

    setStageRuntime: (runtime) =>
      set((state) => {
        state.stageRuntime = runtime;
      }),

    setStageGlobalMetaData: (data) =>
      set((state) => {
        state.stageGlobalMetaData = data;
      }),

    setWorldData: (data) =>
      set((state) => {
        state.worldData = data;
      }),

    setWorldTriggers: (triggers) =>
      set((state) => {
        state.worldTriggers = triggers;
      }),

    addWorldTrigger: (trigger) =>
      set((state) => {
        const exists = state.worldTriggers.some((t) => t.id === trigger.id);
        if (exists) {
          state.worldTriggers = state.worldTriggers.map((t) => (t.id === trigger.id ? { ...t, ...trigger } : t));
        } else {
          state.worldTriggers.push(trigger);
        }
      }),

    removeWorldTrigger: (id) =>
      set((state) => {
        state.worldTriggers = state.worldTriggers.filter((t) => t.id !== id);
      }),

    markTriggerFired: (id) =>
      set((state) => {
        const trigger = state.worldTriggers.find((t) => t.id === id);
        if (!trigger) return;

        if (trigger.once) {
          state.worldTriggers = state.worldTriggers.filter((t) => t.id !== id);
        }
      }),

    // 캐릭터 템플릿 설정 액션
    setCharacterTemplates: (templates) =>
      set((state) => {
        const byId: Record<string, IExtendedNpcData> = {};
        const allIds: string[] = [];
        const universeGroups: Record<string, string[]> = {};

        templates.forEach((template) => {
          const id = template.pid;
          if (!id) return;

          byId[id] = template;
          allIds.push(id);

          const universeKey = (template as { universeId?: string }).universeId || state.universeId || "unknown";
          if (!universeGroups[universeKey]) {
            universeGroups[universeKey] = [];
          }
          universeGroups[universeKey].push(id);
        });

        state.characterTemplates = {
          byId,
          allIds,
          usedIds: new Set(),
          universeGroups,
        };
      }),

    // 특정 캐릭터를 사용된 것으로 표시
    markCharacterAsUsed: (characterId) =>
      set((state) => {
        state.characterTemplates.usedIds.add(characterId);
      }),

    // 사용 가능한 캐릭터 가져오기
    getAvailableCharacters: (count = Infinity, universeId = "all", userCharacterId) => {
      const state = get();

      // universeId가 지정되지 않으면 현재 유니버스 ID 사용
      const targetUniverseId = universeId || state.universeId || "all";

      const { byId, allIds, usedIds, universeGroups } = state.characterTemplates;

      // 필터링할 ID 목록 결정 (전체 또는 특정 유니버스)
      const candidateIds = targetUniverseId === "all" ? allIds : universeGroups[targetUniverseId] || [];

      // 사용되지 않은 ID만 필터링
      const availableIds = candidateIds.filter((id) => {
        // 이미 사용된 캐릭터 제외
        if (usedIds.has(id)) return false;

        // 현재 선택된 유저 캐릭터 제외
        if (userCharacterId && id === userCharacterId) return false;

        return true;
      });

      // 무작위로 섞기 (Fisher-Yates 알고리즘)
      for (let i = availableIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableIds[i], availableIds[j]] = [availableIds[j], availableIds[i]];
      }

      // 요청된 개수만큼 반환 (전체 또는 제한)
      const selectedIds = availableIds.slice(0, count);

      // ID로 데이터 매핑하여 반환
      return selectedIds.map((id) => byId[id]);
    },

    // 캐릭터 사용 기록 초기화
    resetUsedCharacters: () =>
      set((state) => {
        state.characterTemplates.usedIds.clear();
      }),

  })),
);

export default useGameStore;
