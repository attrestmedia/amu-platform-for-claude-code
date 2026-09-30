import type React from "react";
import type { ICollisionRect } from "types/game";
import { SpatialGrid } from "./SpatialGrid";
import { logger } from "../log";

/**
 * @docHint
 * @purpose collisionUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain game-collision
 * @scope game-runtime
 */

// 두 사각형 간의 충돌 여부를 확인하는 기본 함수
function isCollidinBase(rectA: ICollisionRect, rectB: ICollisionRect): boolean {
  return (
    rectA.x < rectB.x + rectB.width &&
    rectA.x + rectA.width > rectB.x &&
    rectA.y < rectB.y + rectB.height &&
    rectA.y + rectA.height > rectB.y
  );
}

// 확장된 충돌 감지 - 특정 타입의 객체를 충돌 검사에서 제외할 수 있음
export function isColliding(rect: ICollisionRect, rectList: ICollisionRect[], excludeTypes: string[] = []): boolean {
  return rectList.some((r) => {
    // 제외 타입 목록에 있는 타입은 충돌 체크에서 제외
    if (r.type && excludeTypes.includes(r.type)) {
      return false;
    }
    return isCollidinBase(rect, r);
  });
}

// 블록이 도로 영역과 겹치는지 정확하게 확인 - 블록의 코너와 도로 영역 사이의 겹침을 더 정확하게 검사
export function isBlockOverlappingRoad(
  block: ICollisionRect,
  roadAreas: ICollisionRect[],
  bufferDistance: number,
): boolean {
  // 블록의 각 모서리 점 정의
  const blockCorners = [
    { x: block.x, y: block.y }, // 좌상단
    { x: block.x + block.width, y: block.y }, // 우상단
    { x: block.x, y: block.y + block.height }, // 좌하단
    { x: block.x + block.width, y: block.y + block.height }, // 우하단
    { x: block.x + block.width / 2, y: block.y }, // 상단 중앙
    { x: block.x + block.width / 2, y: block.y + block.height }, // 하단 중앙
    { x: block.x, y: block.y + block.height / 2 }, // 좌측 중앙
    { x: block.x + block.width, y: block.y + block.height / 2 }, // 우측 중앙
    { x: block.x + block.width / 2, y: block.y + block.height / 2 }, // 중앙
  ];

  // 도로 영역과의 겹침 검사 (모든 모서리 점 확인)
  return roadAreas.some((roadArea) => {
    // 확장된 도로 영역 계산
    const expandedRoad = {
      x: roadArea.x - bufferDistance,
      y: roadArea.y - bufferDistance,
      width: roadArea.width + bufferDistance * 2,
      height: roadArea.height + bufferDistance * 2,
    };

    // 블록의 모서리 중 하나라도 확장된 도로 영역 내에 있으면 겹침
    return blockCorners.some(
      (corner) =>
        corner.x >= expandedRoad.x &&
        corner.x <= expandedRoad.x + expandedRoad.width &&
        corner.y >= expandedRoad.y &&
        corner.y <= expandedRoad.y + expandedRoad.height,
    );
  });
}

// 두 사각형 간 충돌 여부를 안전 버퍼를 포함하여 확인
export function isCollidingWithBuffer(rectA: ICollisionRect, rectB: ICollisionRect, buffer: number = 0): boolean {
  return (
    rectA.x - buffer < rectB.x + rectB.width &&
    rectA.x + rectA.width + buffer > rectB.x &&
    rectA.y - buffer < rectB.y + rectB.height &&
    rectA.y + rectA.height + buffer > rectB.y
  );
}

// 특정 역할을 가진 장애물들과의 충돌을 버퍼를 포함하여 확인
export function isCollidingWithRole(
  rect: ICollisionRect,
  rectList: ICollisionRect[],
  targetRole: string,
  buffer: number = 0,
): boolean {
  return rectList.some((r) => {
    // 특정 역할을 가진 객체만 검사
    if (!r.role || !r.role.includes(targetRole)) {
      return false;
    }

    // 버퍼를 포함한 충돌 검사
    return isCollidingWithBuffer(rect, r, buffer);
  });
}

// 두 사각형의 침투(MTV) 계산: a를 밖으로 밀기 위한 최소 이동 벡터
export function getPenetrationMTV(
  a: ICollisionRect,
  b: ICollisionRect,
): { nx: number; ny: number; depth: number; axis: "x" | "y" } | null {
  const acx = a.x + a.width / 2;
  const bcx = b.x + b.width / 2;
  const dx = acx - bcx;
  const px = a.width / 2 + b.width / 2 - Math.abs(dx);

  if (px <= 0) return null;

  const acy = a.y + a.height / 2;
  const bcy = b.y + b.height / 2;
  const dy = acy - bcy;
  const py = a.height / 2 + b.height / 2 - Math.abs(dy);

  if (py <= 0) return null;

  // 더 작은 축으로 밀어내는 MTV
  if (px < py) {
    return { nx: dx < 0 ? -1 : 1, ny: 0, depth: px, axis: "x" };
  } else {
    return { nx: 0, ny: dy < 0 ? -1 : 1, depth: py, axis: "y" };
  }
}

// 안전 충돌 영역 체크
export function safeCheckCollision(
  spatialGridRef: React.RefObject<SpatialGrid>,
  rect: { id: string; x: number; y: number; width: number; height: number },
  filter?: (obj: ICollisionRect) => boolean,
) {
  const grid = spatialGridRef.current;
  if (!grid) {
    return null; // 아직 grid 미초기화: 충돌판정을 일시 스킵
  }
  try {
    return grid.checkCollision(rect, filter);
  } catch (e) {
    logger.error("safeCheckCollision error:", e);
    return null;
  }
}
