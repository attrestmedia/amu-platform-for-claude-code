import type { StageBorderType, IsoLayerType } from "./stage";
import type { UniverseType } from "./universe";
import type { GridFootprint, GridRoundingPolicy, NormalizedAnchor, ScreenPoint } from "./coordinates";
import type { IStageReleaseDeployment } from "./stage-release";

// **Isometric 공통 타입들**

// 맵 투영 방식
export type StageProjectionType = "isometric-2to1";

export type StageCoordinateContractVersion = 2;

export interface IStageProjectionRoundingV2 {
  storage: "integer";
  occupancy: Extract<GridRoundingPolicy, "floor">;
  snap: Extract<GridRoundingPolicy, "round">;
  picking: Extract<GridRoundingPolicy, "nearest-cell">;
}

export interface IStageProjectionConfigV2 {
  projection: "isometric-2to1";
  tileWidth: number;
  tileHeight: number;
  origin: ScreenPoint;
  logicalUnitsPerTile: number;
  rounding: IStageProjectionRoundingV2;
}

// 아이소 타일 풋프린트 (논리 레이어; 충돌/AI 기준)
// - width/height: 양의 정수 타일 크기 (예: 1x1, 2x3)
// - offsetX/offsetY: 타일 좌표 기준 정수 원점 오프셋
export type IIsometricFootprint = GridFootprint;

// 스테이지 단위 아이소 설정
export interface IIsometricConfig {
  // 투영 방식 (default: true Iso, 실사용은 2:1 근사)
  projection: StageProjectionType;

  // 화면 픽셀 기준 타일 크기 (뷰 레이어)
  tileWidth: number;
  tileHeight: number;

  // 렌더링 기준 원점 위치 (스크린/월드 좌표; 빌더에서 해석)
  originX?: number;
  originY?: number;
}

// **StageDoc 도메인/스코프 타입**

// 스테이지 소유 타입
export type StageOwnerType = "global" | "universe" | "user";

// 스테이지 공개 범위
export type StageVisibilityType = "private" | "universe" | "public";

// 스테이지 활용 타입 (게임/커머스/겸용)
export type StageUsageType = UniverseType | "both";

// Stage 도큐먼트 도메인 (저장 목적 구분)
export type StageDocDomain = "stage" | "asset-pack" | "layout-template";

// **비정형 경계 / 포털 예약 타입 (에셋 계약 v2 / D3 — P0 타입 예약, 런타임 구현은 P1(경계)/L3(포털))**

// 비정형 경계 타일 역할 태그
// - IStageAsset.roles 또는 IStageLayoutTileMeta.roles에 부여
// - 충돌 그리드에서 이동을 차단하는 경계 타일을 표현 (카메라 클램프는 직사각 bounding box 유지)
// - boundary: 일반 차단 경계 / boundary-cliff·water·fence: 시각 테마 구분 (충돌 동작은 동일)
export type StageBoundaryRoleType = "boundary" | "boundary-cliff" | "boundary-water" | "boundary-fence";

// 맵↔맵 이동 포털 정의 (L3에서 구현 — P0에서는 스키마 예약만)
export interface IStagePortal {
  objectId: string; // 포털 오브젝트 타일 id (IStageLayoutTile.id 참조)
  targetStageId: string; // 이동 대상 스테이지
  targetSpawn?: { x: number; y: number }; // 대상 스테이지 스폰 위치 (타일 그리드 좌표)
  locked?: boolean; // 잠금 포털 여부 (P3-4 Coming Soon 포털)
  meta?: Record<string, unknown>;
}

// Stage 배경 정보 (StageDoc 전용)
export interface IStageBackground {
  name: string;
  size: {
    width: number;
    height: number;
  };
}

// Stage 에셋 메타 (전략/게임용 확장 필드)
export interface IStageAssetMeta {
  // 상태/전략 메타
  maxHp?: number;
  defaultCondition?: number; // 노후도 (0~1 스케일로 해석)
  states?: {
    key: string; // "normal" | "damaged" | "destroyed" 등
    fileName: string; // 상태별 대체 런타임 이미지 URL
  }[];

  // Isometric 관련 메타
  // 충돌/프루닝에 사용할 기본 풋프린트
  // - 타일 단위, 빌딩 바닥면(footprint) 표현, 없으면 size.width/height와 타일 크기에서 추론
  isoFootprint?: IIsometricFootprint;

  // 화면 상 시각적 높이 (픽셀)
  // - ex) 0이면 단순 바닥 타일, 96이면 3층 높이 등
  isoHeightPx?: number;

  // 스프라이트 기준 피벗 (0~1)
  // - 기본값: (0.5, 1.0) = 바닥 중앙
  isoAnchor?: NormalizedAnchor;

  // 기본 레이어 힌트
  // - ground: 바닥/도로, object: 건물/나무 등 일반 오브젝트, roof: 지붕/상층, overlay: 포탈/하이라이트 등
  isoLayer?: IsoLayerType;
  [key: string]: unknown;
}

// Stage 에셋 정의 (StageDoc 저장용)
// - 런타임용 IBlockImage 와는 분리 (저장 도메인 전용)
export interface IStageAsset {
  name: string; // 스테이지 내에서 사용하는 키
  fileName: string; // 런타임 이미지 URL
  size: {
    width: number; // 타일 단위
    height: number;
  };
  roles?: string[]; // "heal" | "shop" | "obstacle" 등, 자유 확장
  meta?: IStageAssetMeta;
}

// Stage 레이아웃 타일 메타
export interface IStageLayoutTileMeta {
  hp?: number;
  condition?: number;

  // 에셋 기본 isoFootprint 덮어쓰기용
  // - 특정 타일 인스턴스만 충돌 크기를 바꾸고 싶을 때
  isoFootprint?: IIsometricFootprint;

  // 에셋 기본 isoHeightPx 덮어쓰기용
  isoHeightPx?: number;

  // 같은 타일 내에서 위/아래로 살짝 띄우는 용도 (픽셀)
  // - ex) 같은 타일 위에 여러 개 쌓을 때 z-sorting 편의를 위한 오프셋
  isoZOffsetPx?: number;

  // 레이어 오버라이드 (없으면 에셋 meta.isoLayer 사용)
  isoLayer?: IsoLayerType;

  // 타일 인스턴스별 역할 태그 (**IStageAsset.roles와 다름**)
  // - IStageAsset.roles: 인스턴스 자체의 기본 역할(build, road, park, ...)
  // - tile.meta.roles: 인스턴스가 하는 역할 (예: shop-entry, npc-spawn, cutscene-trigger, ...)
  roles?: string[];

  // Forge 저작 도구의 표시/잠금 레이어. 런타임 depth는 isoLayer 정본을 계속 사용한다.
  authoringLayer?: "ground" | "object" | "boundary" | "overlay";

  [key: string]: unknown;
}

// Stage 레이아웃 타일
export interface IStageLayoutTile {
  id: string;
  assetName: string; // IStageAsset.name 참조

  // 그리드 좌표 (아이소 타일 기준, 논리 레이어)
  // - (x, y)는 "타일 인덱스", 실제 픽셀 좌표는 iso 설정(tileWidth, tileHeight)으로 변환
  x: number;
  y: number;

  rotation?: number;
  scale?: number;
  state?: string; // "normal" | "damaged" | "destroyed" 등
  meta?: IStageLayoutTileMeta;
}

// Stage 레이아웃
export interface IStageLayout {
  mode: "auto" | "manual" | "mixed";

  width: number;
  height: number;

  tiles: IStageLayoutTile[];
}

// StageDoc 저장용 도큐먼트
// - DB stages 컬렉션의 저장 구조를 표현
export interface IStageDoc {
  stageId: string;
  stageName: string;

  // 좌표 계약 v2 정본. 모든 StageDoc은 이 계약을 반드시 가져야 한다.
  coordinateContractVersion: StageCoordinateContractVersion;
  projectionConfig: IStageProjectionConfigV2;

  // immutable R2 release 정본.
  releaseDeployment?: IStageReleaseDeployment;

  // 도메인/스코프
  domain: StageDocDomain; // 1단계에서는 기본값 "stage"
  ownerType: StageOwnerType;
  ownerId?: string;
  visibility: StageVisibilityType;
  usageType: StageUsageType;

  // 에셋/레이아웃/메타
  background?: IStageBackground;
  border?: Partial<Record<StageBorderType, string>>;
  assets?: IStageAsset[];
  layout?: IStageLayout;

  // 맵↔맵 이동 포털 목록 (에셋 계약 v2 / D3 — L3 구현 예약)
  portals?: IStagePortal[];

  // 실지도 테마 참조 키 (L6 예약 — 약관 검토 + 수요 실증 후 활성화)
  regionRef?: string;

  // 관리용 메타
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// 스테이지 정보
export interface IStageInfo {
  stageId: string; // 스테이지 에셋 아이디(타입 폴더)
  stageName: string; // 스테이지 에셋 이름(타입 → [name] 폴더)

  // Universe.stages에서 사용하는 확장 메타
  isDefault?: boolean; // 유니버스 내 기본 스테이지 여부
  mode?: string; // "normal" | "commerce" | "event" ...
  layoutVersion?: string; // 빌더/레이아웃 버전 관리
  usageType?: StageUsageType;
}
