import type { IWorldEntity } from "./stage";

// 카메라 모드
export type CameraMode = "follow-protagonist" | "free" | "locked" | "cutscene";

// 카메라 타깃 타입
export type CameraTargetType = "none" | "protagonist" | "npc" | "point";

// 카메라 잠금 사유
export type CameraLockReason = "shop" | "cutscene" | "system" | "manual";

export type CameraBoundaryMode = "finite-hard";

// 카메라 경계(클램프) 설정
export interface ICameraConstraints {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// 카메라 상태 - IWorldEntity를 확장
// - x, y: 카메라 뷰포트의 "좌측 상단" 월드 좌표
// - width, height: 화면에 보이는 뷰포트 너비/높이
export interface ICameraState extends IWorldEntity {
  mode: CameraMode; // follow/free/locked/cutscene
  zoom: number; // 줌 레벨(1 = 100%)

  // 월드 경계 모드 (무한/유한)
  boundaryMode: CameraBoundaryMode;

  // 타깃 정보 (팔로우, 포인트 패닝 등)
  targetType: CameraTargetType;
  targetId: string | null; // npc id 등 (protagonist는 고정 문자열 사용 가능)
  targetX: number | null; // 타깃 월드 좌표 (center 기준)
  targetY: number | null;

  // 소프트 락 박스 (중심에서 얼마나 벗어나야 카메라가 움직이는지, px 단위 반경)
  softLockRadiusX: number;
  softLockRadiusY: number;

  // 카메라 이동 보간 계수 (0~1, 0에 가까울수록 빨리 따라감)
  lerpFactor: number;

  // 월드 경계 클램프 설정 (없으면 무제한)
  constraints: ICameraConstraints | null;

  // 강제 잠금 상태 (상점/컷씬 등)
  isLocked: boolean;
  lockReason: CameraLockReason | null;
}
