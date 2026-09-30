import type { INpcBehavior, IExtendedNpcData } from "./npc";
import type { IPaginationInfo } from "../data";
import type { UniverseType } from "./universe";
import type {
  IStageDoc,
  IStageAsset,
  IStageBackground,
  IStageLayout,
  IStageLayoutTile,
  IIsometricFootprint,
  IIsometricConfig,
  StageProjectionType,
  StageUsageType,
} from "./stage-doc";
import type {
  GridFootprint,
  GridPoint,
  IsometricProjectionConfig,
  LogicalWorldPoint,
  NormalizedAnchor,
  ScreenPoint,
} from "./coordinates";

// **방향 / 행동 / 경계 타입**

// 캐릭터의 단순 방향 타입 - 스프라이트 텍스처 선택에 사용
// 현재 AMU는 직교 방향이 아니라 아이소메트릭 대각선 별칭을 사용한다.
// left => 북서(NW), up => 북동(NE), right => 남동(SE), down => 남서(SW)
export type DirectionBaseType = typeof import("consts/game").GAME_ENTITIES.DIRECTIONS[number];

// 방향 타입 - 캐릭터가 움직일 수 있는 8방향 또는 정지 상태 (null = 입력 없음)
export type DirectionType = DirectionBaseType | "up-left" | "up-right" | "down-left" | "down-right" | null;

// 렌더/영속용 non-null 8방향
export type DirectionFacingType = Exclude<DirectionType, null>;

// 논리적 아이소 8방향 타입
// – pathfinding 등에 활용
export type IsoDirectionType =
  | "north"
  | "south"
  | "east"
  | "west"
  | "north-east"
  | "south-east"
  | "south-west"
  | "north-west";

// 아이소 방향 매핑 (뷰 스프라이트 ↔ 논리 방향 통합용)
export const DIRECTION_TO_ISO: Record<DirectionBaseType, IsoDirectionType> = {
  left: "north-west",
  right: "south-east",
  up: "north-east",
  down: "south-west",
};

// NPC 행동 패턴 타입
export type BehaviorType = "wander" | "follow" | "patrol" | "stationary" | "random";

// 스테이지 경계 위치 타입
export type StageBorderType =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

// **장애물 / 런타임 StageData**

// 장애물 데이터
// - IStageLayoutTile(그리드 기준 정의)에서 파생된 런타임 인스턴스
// - x, y 는 논리 world 좌표이며 화면 좌표는 isoRender에서만 사용한다.
export interface ObstacleType extends IStageLayoutTile {
  textureIndex: number; // blockImages 배열 인덱스 (렌더링/텍스처 매핑용)
  isoFootprint?: IIsometricFootprint; // 아이소 기준 풋프린트 오버라이드
  isoRender?: IIsometricRenderPlacement; // v2 좌표에서 계산한 화면 투영/정렬 계약
  productData?: unknown; // 커머스 전용 데이터 (상품/스토어 메타 등) — 사용처에서 narrow

  // 충돌/프루닝 용도 (논리 world 단위 footprint 크기)
  width?: number;
  height?: number;
}

// 스테이지 데이터
// - 충돌/프루닝/렌더링의 기본 단위
export interface IStageData {
  // 스테이지 내 모든 장애물/도로/빌딩 인스턴스
  obstacles: Array<ObstacleType>;

  // v2 아이소 그리드 메타 정보
  isoMeta?: {
    coordinateContractVersion?: IStageDoc["coordinateContractVersion"];
    logicalUnitsPerTile?: number;
    gridWidth: number;
    gridHeight: number;
    // 논리 world 크기
    worldWidth?: number;
    worldHeight?: number;
    config: Partial<IIsometricConfig>;
  };
}

export interface IIsometricMovementRuntime {
  projection: IsometricProjectionConfig;
  logicalUnitsPerTile: number;
  gridWidth: number;
  gridHeight: number;
}

export interface ILogicalEntityPlacement {
  position: LogicalWorldPoint;
  footprint: GridFootprint;
}

// StageDoc + 런타임 변환 결과를 한 번에 묶는 레이어
export interface IStageRuntime {
  doc: IStageDoc; // DB StageDoc 원본
  data: IStageData; // 충돌/렌더링용 StageData
  assets: IStageAsset[]; // 저장용 메타
  blockImages: IBlockImage[]; // 렌더링용 블록 이미지

  // projectionConfig에서 만든 렌더 설정 캐시
  projection: StageProjectionType;
  isoConfig: IIsometricConfig;
}

// 스테이지 글로벌 메타 정보
// - 재사용을 위한 커머스/게임 구분 + 맵 모드 정보 포함
export interface IStageGlobalMeta {
  stageId: string;
  stageName: string;
  background?: IStageBackground;
  border?: Partial<Record<StageBorderType, string>>;

  // 아이소 스테이지 전역 설정 (뷰/UI 접근용)
  projection?: StageProjectionType;

  // StageDoc 기반 메타 (커머스/게임/공개 범위 등)
  usageType?: StageUsageType;
  ownerType?: IStageDoc["ownerType"];
  ownerId?: string;
  visibility?: IStageDoc["visibility"];

  // 레이아웃 모드 (auto/manual/mixed)
  layoutMode?: IStageLayout["mode"];

  // 유니버스 타입 힌트
  universeType?: UniverseType;

  // 해석/캐시 결과
  _resolved?: {
    universeId?: string;
    type?: UniverseType;
    usageType?: StageUsageType;
    stageDocId?: string;
    [key: string]: unknown;
  };

  // 전략/커머스용 확장 필드 여지
  [key: string]: unknown;
}

// 아이소 레이어 타입 (뷰 레이어 정렬 힌트)
export type IsoLayerType = "ground" | "object" | "roof" | "overlay";

export interface IIsometricDepthKey {
  layer: IsoLayerType;
  diagonal: number;
  elevationPx: number;
  gridX: number;
  gridY: number;
  stableId: string;
}

export interface IIsometricRenderPlacement {
  gridPoint: GridPoint;
  screenPoint: ScreenPoint;
  footprint: IIsometricFootprint;
  anchor: NormalizedAnchor;
  elevationPx: number;
  visualHeightPx: number;
  layer: IsoLayerType;
  depthKey: IIsometricDepthKey;
}

// 장애물 이미지 정보 (런타임용 블록 이미지)
// - StageAsset + 실제 텍스처 경로 + 아이소 메타
export interface IBlockImage {
  // IStageAsset.name 참조용 논리 키
  name: string;

  // 원본 에셋 파일명 (확장자 포함)
  fileName: string;

  // 텍스처 로더에서 사용하는 실제 경로
  path: string;

  // 스프라이트의 논리 크기 (타일 단위)
  // - 실제 픽셀 크기는 isoMeta.config.tileWidth / tileHeight와 조합해서 계산
  size: {
    width: number;
    height: number;
  };

  // 충돌/AI에 사용할 아이소 풋프린트
  // - 없으면 StageAsset.meta.isoFootprint 또는 size/tileWidth에서 추론
  isoFootprint?: IIsometricFootprint;

  // 화면 상 시각적 높이 (픽셀)
  // - 렌더링시 z-sorting 계산에 사용
  isoHeightPx?: number;

  // 렌더 레이어. StageAsset.meta.isoLayer에서 전달된다.
  isoLayer?: IsoLayerType;

  // 스프라이트 피벗 (0~1)
  // - 기본: (0.5, 1.0) = 바닥 중앙
  anchor?: {
    x: number;
    y: number;
  };

  // 역할 태그
  // - 예: "road", "building", "park", "sign", "multi", "shop" ...
  role?: string[];

  // 기타 메타데이터 (전략/연출용)
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

// NPC 캐릭터 이미지 정보 (스테이지용 페르소나 스냅샷 + 행동 메타)
export interface INpcImage {
  persona: IExtendedNpcData; // 스테이지에 배치할 NPC의 페르소나 스냅샷
  behavior?: INpcBehavior; // 기본 행동 패턴
  displayName?: string; // 스테이지 표시 이름
  [key: string]: unknown; // 확장을 위한 기타 메타데이터
}

// 도로 타입
export type RoadType = "horizontal" | "vertical" | "crossroad" | "corner-tl" | "corner-tr" | "corner-bl" | "corner-br";

// 도로 노드 인터페이스 (그리드/월드 혼합)
export interface IRoadNode {
  x: number;
  y: number;
  width: number;
  height: number;
  type: RoadType;
  textureIndex: number;
}

// **월드 엔티티 / 트리거 타입**

// 월드 좌표계 기준 엔티티 공통 필드
// - x, y 는 항상 "월드 좌표(worldX, worldY)" 로 해석
// - width, height 는 기본적으로 "충돌용 footprint 크기"
export interface IWorldEntity {
  x: number; // worldX
  y: number; // worldY
  width: number;
  height: number;

  // 아이소 z 값 (정렬용)
  // - 예: y + isoHeightPx 등을 미리 계산해 저장 가능
  isoZ?: number;

  // 뷰 레이어 힌트
  isoLayer?: IsoLayerType;
}

// 월드 오브젝트(맵에 표시되는 요소)
export interface IWorldObject extends IWorldEntity {
  id: string; // 오브젝트 식별자(npc id, "protagonist" 등)
  type: "npc" | "obstacle" | "protagonist";
  role?: string[];
}

// 기본 충돌 영역 정의
export interface ICollisionRect extends IWorldEntity {
  id: string;
  type?: string;
  role?: string[]; // 충돌 객체의 역할(통과 가능, 치유, 함정 등)
  coordinateSpace?: "logical-world";
}

// 월드 데이터 타입
export interface IWorldData {
  stageWidth: number;
  stageHeight: number;
  objects: IWorldObject[];
}

// 월드 트리거 / 이벤트 정의
export type WorldTriggerShape = "circle" | "rect";

export interface IWorldTriggerAreaCircle {
  shape: "circle";
  cx: number;
  cy: number;
  radius: number;
}

export interface IWorldTriggerAreaRect extends IWorldEntity {
  shape: "rect";
}

export type IWorldTriggerArea = IWorldTriggerAreaCircle | IWorldTriggerAreaRect;

export type WorldTriggerKind = "portal" | "shop" | "cutscene" | "zone" | "custom";

export interface IWorldTrigger {
  id: string;
  kind: WorldTriggerKind;
  area: IWorldTriggerArea;
  once?: boolean; // true면 1회 발동 후 자동 제거
  enabled?: boolean; // false면 무시
  meta?: Record<string, unknown>; // 포탈 타깃, 상점 id 등 부가 정보
}

// **스테이지 데이터 관련**

export interface IStageResponseBase {
  success: boolean;
  message?: string;
}

export interface IStageResponse extends IStageResponseBase {
  data: IStageDoc;
}

export interface IStagesResponse extends IStageResponseBase {
  data: IStageDoc[];
}

export interface IStagesListResponse extends IStagesResponse {
  pagination: IPaginationInfo;
}

export interface IStageListParams {
  page?: number;
  pageSize?: number;
  ownerType?: IStageDoc["ownerType"];
  ownerId?: string;
  usageType?: IStageDoc["usageType"];
  domain?: IStageDoc["domain"];
  visibility?: IStageDoc["visibility"];
  stageId?: string;
  stageName?: string;
  q?: string;
}
