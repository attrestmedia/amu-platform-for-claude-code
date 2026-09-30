export type GridRoundingPolicy = "continuous" | "floor" | "round" | "nearest-cell";

/**
 * StageDoc의 논리 타일 평면 좌표.
 * 정수 저장 검증은 coordinateContractVersion을 도입하는 ISO-2에서 담당한다.
 */
export interface GridPoint {
  readonly gridX: number;
  readonly gridY: number;
}

/**
 * 이동·충돌에서 사용하는 연속 논리 좌표.
 * 단위는 LogicalWorldScale.unitsPerTile로 명시하며 화면 px와 혼용하지 않는다.
 */
export interface LogicalWorldPoint {
  readonly worldX: number;
  readonly worldY: number;
}

/** Pixi/canvas 투영 평면의 픽셀 좌표. */
export interface ScreenPoint {
  readonly screenX: number;
  readonly screenY: number;
}

/** 스프라이트 bitmap 내부의 정규화된 pivot. */
export interface NormalizedAnchor {
  readonly x: number;
  readonly y: number;
}

/** 논리 그리드에서 점유하는 정수 셀 영역. */
export interface GridFootprint {
  readonly width: number;
  readonly height: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
}

/** 논리 그리드 1타일을 연속 논리 월드 단위로 환산하는 비율. */
export interface LogicalWorldScale {
  readonly unitsPerTile: number;
}

/** 정식 아이소메트릭 투영에 필요한 최소 설정. */
export interface IsometricProjectionConfig {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly origin?: ScreenPoint;
}

export interface ScreenBounds {
  readonly minScreenX: number;
  readonly maxScreenX: number;
  readonly minScreenY: number;
  readonly maxScreenY: number;
  readonly width: number;
  readonly height: number;
}

export interface IsometricWorldBounds {
  readonly minGridX: number;
  readonly maxGridX: number;
  readonly minGridY: number;
  readonly maxGridY: number;
  readonly screen: ScreenBounds;
  readonly corners: readonly [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint];
}
